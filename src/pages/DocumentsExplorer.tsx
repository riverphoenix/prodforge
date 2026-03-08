import { useState, useEffect, useCallback } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { Folder, ContextDocument, FrameworkOutput, TreeNode, SearchResult, FrameworkDefinition } from '../lib/types';
import { foldersAPI, contextDocumentsAPI, frameworkOutputsAPI, frameworkDefsAPI } from '../lib/ipc';
import FolderTree from '../components/FolderTree';
import { FOLDER_COLORS } from '../components/TreeItem';
import ResizableDivider from '../components/ResizableDivider';
import MarkdownWithMermaid from '../components/MarkdownWithMermaid';

interface DocumentsExplorerProps {
  projectId: string;
}

function buildTree(
  folders: Folder[],
  docs: ContextDocument[],
  outputs: FrameworkOutput[]
): TreeNode[] {
  const folderNodes: Map<string, TreeNode> = new Map();
  const rootNodes: TreeNode[] = [];

  for (const f of folders) {
    folderNodes.set(f.id, {
      id: f.id,
      name: f.name,
      type: 'folder',
      parent_id: f.parent_id,
      sort_order: f.sort_order,
      is_favorite: false,
      tags: [],
      color: f.color || undefined,
      created_at: f.created_at,
      children: [],
    });
  }

  for (const d of docs) {
    const node: TreeNode = {
      id: d.id,
      name: d.name,
      type: 'context_doc',
      parent_id: d.folder_id,
      sort_order: d.sort_order,
      is_favorite: d.is_favorite,
      tags: JSON.parse(d.tags || '[]'),
      doc_type: d.type,
      size_bytes: d.size_bytes,
      created_at: d.created_at,
    };
    if (d.folder_id && folderNodes.has(d.folder_id)) {
      folderNodes.get(d.folder_id)!.children!.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  for (const o of outputs) {
    const node: TreeNode = {
      id: o.id,
      name: o.name,
      type: 'framework_output',
      parent_id: o.folder_id,
      sort_order: o.sort_order,
      is_favorite: o.is_favorite,
      tags: JSON.parse(o.tags || '[]'),
      category: o.category,
      framework_id: o.framework_id,
      created_at: o.created_at,
    };
    if (o.folder_id && folderNodes.has(o.folder_id)) {
      folderNodes.get(o.folder_id)!.children!.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  for (const [, node] of folderNodes) {
    if (node.parent_id && folderNodes.has(node.parent_id)) {
      folderNodes.get(node.parent_id)!.children!.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };

  sortNodes(rootNodes);
  return rootNodes;
}

function getBreadcrumbs(tree: TreeNode[], targetId: string): TreeNode[] {
  const path: TreeNode[] = [];
  const walk = (nodes: TreeNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === targetId) {
        path.push(node);
        return true;
      }
      if (node.children) {
        if (walk(node.children)) {
          path.unshift(node);
          return true;
        }
      }
    }
    return false;
  };
  walk(tree);
  return path;
}

export default function DocumentsExplorer({ projectId }: DocumentsExplorerProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<ContextDocument[]>([]);
  const [outputs, setOutputs] = useState<FrameworkOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [treeWidth, setTreeWidth] = useState(300);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [copied, setCopied] = useState(false);

  const [frameworksMap, setFrameworksMap] = useState<Map<string, FrameworkDefinition>>(new Map());

  // Move-to-folder modal
  const [moveTarget, setMoveTarget] = useState<TreeNode | null>(null);

  // Color picker
  const [colorTarget, setColorTarget] = useState<TreeNode | null>(null);
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');

  const tree = buildTree(folders, docs, outputs);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, d, o, allFw] = await Promise.all([
        foldersAPI.list(projectId),
        contextDocumentsAPI.list(projectId),
        frameworkOutputsAPI.list(projectId),
        frameworkDefsAPI.list(),
      ]);
      setFolders(f);
      setDocs(d);
      setOutputs(o);
      setFrameworksMap(new Map(allFw.map(fw => [fw.id, fw])));
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelect = useCallback(async (node: TreeNode) => {
    setSelectedNode(node);
    setSelectedContent(null);

    if (node.type === 'context_doc') {
      try {
        const doc = await contextDocumentsAPI.get(node.id);
        if (doc) setSelectedContent(doc.content);
      } catch (err) {
        console.error('Failed to load document content:', err);
      }
    } else if (node.type === 'framework_output') {
      try {
        const output = await frameworkOutputsAPI.get(node.id);
        if (output) setSelectedContent(output.generated_content);
      } catch (err) {
        console.error('Failed to load output content:', err);
      }
    }
  }, []);

  const handleRename = useCallback(async (nodeId: string, nodeType: TreeNode['type'], newName: string) => {
    try {
      if (nodeType === 'folder') {
        await foldersAPI.update(nodeId, newName);
      } else if (nodeType === 'context_doc') {
        const doc = docs.find(d => d.id === nodeId);
        if (doc) await contextDocumentsAPI.update(nodeId, newName, doc.is_global);
      } else if (nodeType === 'framework_output') {
        const output = outputs.find(o => o.id === nodeId);
        if (output) await frameworkOutputsAPI.update(nodeId, newName, output.generated_content);
      }
      await loadData();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  }, [docs, outputs, loadData]);

  const handleDelete = useCallback(async (node: TreeNode) => {
    const typeLabel = node.type === 'folder' ? 'folder and all its contents' : 'document';
    const confirmed = await ask(`Delete "${node.name}"? This will permanently remove this ${typeLabel}.`, {
      title: 'Confirm Delete',
      kind: 'warning',
    });
    if (!confirmed) return;

    try {
      if (node.type === 'folder') {
        await foldersAPI.delete(node.id);
      } else if (node.type === 'context_doc') {
        await contextDocumentsAPI.delete(node.id);
      } else if (node.type === 'framework_output') {
        await frameworkOutputsAPI.delete(node.id);
      }
      if (selectedNode?.id === node.id) {
        setSelectedNode(null);
        setSelectedContent(null);
      }
      await loadData();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, [selectedNode, loadData]);

  const handleToggleFavorite = useCallback(async (node: TreeNode) => {
    if (node.type === 'folder') return;
    try {
      const itemType = node.type as 'context_doc' | 'framework_output';
      await foldersAPI.toggleItemFavorite(node.id, itemType, !node.is_favorite);
      await loadData();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [loadData]);

  const handleMoveToFolder = useCallback((node: TreeNode) => {
    setMoveTarget(node);
  }, []);

  const handleMoveConfirm = useCallback(async (folderId: string | null) => {
    if (!moveTarget) return;
    try {
      if (moveTarget.type === 'folder') {
        await foldersAPI.update(moveTarget.id, undefined, folderId);
      } else {
        await foldersAPI.moveItem(moveTarget.id, moveTarget.type as 'context_doc' | 'framework_output', folderId);
      }
      setMoveTarget(null);
      await loadData();
    } catch (err) {
      console.error('Failed to move item:', err);
    }
  }, [moveTarget, loadData]);

  const handleSetColor = useCallback((node: TreeNode) => {
    setColorTarget(node);
  }, []);

  const handleColorConfirm = useCallback(async (color: string | null) => {
    if (!colorTarget) return;
    try {
      await foldersAPI.setFolderColor(colorTarget.id, color);
      setColorTarget(null);
      await loadData();
    } catch (err) {
      console.error('Failed to set folder color:', err);
    }
  }, [colorTarget, loadData]);

  const handleDrop = useCallback(async (draggedId: string, draggedType: TreeNode['type'], targetFolderId: string | null) => {
    try {
      if (draggedType === 'folder') {
        await foldersAPI.update(draggedId, undefined, targetFolderId);
      } else {
        await foldersAPI.moveItem(draggedId, draggedType as 'context_doc' | 'framework_output', targetFolderId);
      }
      await loadData();
    } catch (err) {
      console.error('Failed to move via drag:', err);
    }
  }, [loadData]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const parentId = selectedNode?.type === 'folder' ? selectedNode.id : undefined;
      await foldersAPI.create(projectId, newFolderName.trim(), parentId);
      setNewFolderName('');
      setIsCreatingFolder(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  };

  const handleCreateDoc = async () => {
    if (!newDocName.trim() || !newDocContent.trim()) return;
    try {
      await contextDocumentsAPI.create(projectId, newDocName.trim(), 'text', newDocContent.trim());
      setNewDocName('');
      setNewDocContent('');
      setIsAddingDoc(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await foldersAPI.searchItems(projectId, query);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    }
  }, [projectId]);

  const handleCopy = async () => {
    if (selectedContent) {
      await navigator.clipboard.writeText(selectedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePanelResize = (deltaX: number) => {
    setTreeWidth(prev => Math.max(220, Math.min(500, prev + deltaX)));
  };

  const getPreviewIcon = () => {
    if (!selectedNode) return '';
    if (selectedNode.type === 'folder') return '📁';
    if (selectedNode.type === 'framework_output') {
      const fw = selectedNode.framework_id ? frameworksMap.get(selectedNode.framework_id) : null;
      return fw?.icon || '⚡';
    }
    const icons: Record<string, string> = { pdf: '📄', url: '🔗', google_doc: '📝', text: '📝' };
    return icons[selectedNode.doc_type || 'text'] || '📝';
  };

  const breadcrumbs = selectedNode ? getBreadcrumbs(tree, selectedNode.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      {/* Header */}
      <div style={{ flexShrink: 0 }} className="px-8 pt-6 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-2xl font-semibold text-codex-text-primary">Documents</h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              {docs.length + outputs.length} items{folders.length > 0 ? ` in ${folders.length} folder${folders.length > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingDoc(true)}
              className="px-3 py-1.5 text-xs bg-codex-accent text-white rounded-md hover:bg-codex-accent/80 transition-colors"
            >
              + New Document
            </button>
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="px-3 py-1.5 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface-hover transition-colors"
            >
              + Folder
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-md">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-codex-text-secondary">Loading documents...</div>
          </div>
        ) : tree.length === 0 && !isCreatingFolder ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-lg px-8">
              <div className="text-4xl mb-3">📂</div>
              <h3 className="text-sm font-semibold text-codex-text-primary mb-1">No documents yet</h3>
              <p className="text-xs text-codex-text-secondary mb-6">
                This is your document organizer. Add text documents, context files, and view generated framework outputs here.
              </p>
              <div className="flex items-center justify-center gap-3 mb-6">
                <button
                  onClick={() => setIsAddingDoc(true)}
                  className="px-4 py-2 text-xs bg-codex-accent text-white rounded-md hover:bg-codex-accent/80 transition-colors"
                >
                  Create Text Document
                </button>
                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="px-4 py-2 text-xs bg-codex-surface border border-codex-border text-codex-text-secondary rounded-md hover:bg-codex-surface-hover transition-colors"
                >
                  Create Folder
                </button>
              </div>
              <div className="text-[10px] text-codex-text-muted leading-relaxed space-y-1">
                <p>Documents from the <span className="text-codex-text-secondary">Context</span> tab and outputs from <span className="text-codex-text-secondary">Frameworks</span> also appear here.</p>
                <p>Organize with folders, drag-and-drop, favorites, and color coding.</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Tree Panel */}
            <div
              className="flex-shrink-0 border-r border-codex-border overflow-y-auto"
              style={{ width: `${treeWidth}px` }}
            >
              {/* New Folder Input */}
              {isCreatingFolder && (
                <div className="p-2 border-b border-codex-border">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📁</span>
                    <input
                      type="text"
                      placeholder="Folder name..."
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                      }}
                      autoFocus
                      className="flex-1 bg-codex-surface border border-codex-accent rounded px-2 py-1 text-xs text-codex-text-primary outline-none"
                    />
                    <button
                      onClick={handleCreateFolder}
                      className="px-2 py-1 text-xs text-codex-accent hover:text-codex-text-primary"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                      className="px-1 py-1 text-xs text-codex-text-muted hover:text-codex-text-primary"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Search Results or Tree */}
              {searchResults ? (
                <div className="p-2">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <span className="text-[10px] text-codex-text-muted uppercase">
                      {searchResults.length} results
                    </span>
                    <button
                      onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                      className="text-[10px] text-codex-text-muted hover:text-codex-text-primary"
                    >
                      Clear
                    </button>
                  </div>
                  {searchResults.map(result => (
                    <div
                      key={result.id}
                      onClick={() => {
                        const treeNode: TreeNode = {
                          id: result.id,
                          name: result.name,
                          type: result.item_type as TreeNode['type'],
                          parent_id: result.folder_id,
                          sort_order: 0,
                          is_favorite: result.is_favorite,
                          tags: [],
                          doc_type: result.doc_type || undefined,
                          category: result.category || undefined,
                          created_at: result.created_at,
                        };
                        handleSelect(treeNode);
                      }}
                      className={`p-2 rounded cursor-pointer transition-colors ${
                        selectedNode?.id === result.id
                          ? 'bg-codex-accent/15'
                          : 'hover:bg-codex-surface-hover'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">
                          {result.item_type === 'framework_output' ? '⚡' : '📝'}
                        </span>
                        <span className="text-xs text-codex-text-primary truncate">{result.name}</span>
                        {result.is_favorite && <span className="text-[10px] text-yellow-400">★</span>}
                      </div>
                      <div className="text-[10px] text-codex-text-muted truncate mt-0.5 pl-5">
                        {result.category || result.doc_type || result.item_type}
                      </div>
                    </div>
                  ))}
                  {searchResults.length === 0 && (
                    <div className="text-xs text-codex-text-muted text-center py-4">No results found</div>
                  )}
                </div>
              ) : (
                <FolderTree
                  nodes={tree}
                  selectedId={selectedNode?.id || null}
                  onSelect={handleSelect}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onToggleFavorite={handleToggleFavorite}
                  onMoveToFolder={handleMoveToFolder}
                  onSetColor={handleSetColor}
                  onDrop={handleDrop}
                  projectId={projectId}
                />
              )}
            </div>

            {/* Resizable Divider */}
            <ResizableDivider onResize={handlePanelResize} />

            {/* Preview Panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {selectedNode && selectedNode.type !== 'folder' ? (
                <>
                  {/* Breadcrumb */}
                  {breadcrumbs.length > 1 && (
                    <div className="flex-shrink-0 px-6 py-1.5 border-b border-codex-border/50 bg-codex-bg">
                      <div className="flex items-center gap-1 text-[10px] text-codex-text-muted">
                        {breadcrumbs.map((crumb, i) => (
                          <span key={crumb.id} className="flex items-center gap-1">
                            {i > 0 && <span>/</span>}
                            <span
                              className={`${i === breadcrumbs.length - 1 ? 'text-codex-text-secondary' : 'hover:text-codex-text-primary cursor-pointer'}`}
                              onClick={() => { if (i < breadcrumbs.length - 1) handleSelect(crumb); }}
                            >
                              {crumb.name}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview Header */}
                  <div className="flex-shrink-0 border-b border-codex-border bg-codex-surface/50 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg flex-shrink-0">{getPreviewIcon()}</span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-codex-text-primary truncate">
                          {selectedNode.name}
                        </h3>
                        <div className="flex items-center gap-2 text-[10px] text-codex-text-muted mt-0.5">
                          <span>{selectedNode.type === 'context_doc' ? 'Context Document' : 'Framework Output'}</span>
                          {selectedNode.category && (
                            <>
                              <span>·</span>
                              <span>{selectedNode.category}</span>
                            </>
                          )}
                          {selectedNode.size_bytes && (
                            <>
                              <span>·</span>
                              <span>{(selectedNode.size_bytes / 1024).toFixed(1)} KB</span>
                            </>
                          )}
                          {selectedNode.created_at > 0 && (
                            <>
                              <span>·</span>
                              <span>{new Date(selectedNode.created_at * 1000).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedNode.tags.length > 0 && (
                        <div className="flex gap-1">
                          {selectedNode.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-codex-surface border border-codex-border rounded text-codex-text-muted">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => handleToggleFavorite(selectedNode)}
                        className={`px-2 py-1 text-xs transition-colors ${
                          selectedNode.is_favorite ? 'text-yellow-400' : 'text-codex-text-secondary hover:text-yellow-400'
                        }`}
                      >
                        {selectedNode.is_favorite ? '★ Favorited' : '☆ Favorite'}
                      </button>
                      <button
                        onClick={handleCopy}
                        className={`px-3 py-1 text-xs transition-colors ${
                          copied ? 'text-green-400' : 'text-codex-text-secondary hover:text-codex-text-primary'
                        }`}
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Preview Content */}
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="p-6">
                    {selectedContent ? (
                      selectedNode.type === 'framework_output' ? (
                        <MarkdownWithMermaid content={selectedContent} />
                      ) : (
                        <pre className="text-xs text-codex-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
                          {selectedContent}
                        </pre>
                      )
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-xs text-codex-text-muted">Loading content...</div>
                      </div>
                    )}
                  </div>
                </>
              ) : selectedNode?.type === 'folder' ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md px-8">
                    <div className="text-3xl mb-3">📁</div>
                    <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
                      {selectedNode.name}
                    </h3>
                    <p className="text-xs text-codex-text-secondary mb-3">
                      {selectedNode.children?.length || 0} items
                    </p>
                    {selectedNode.color && (
                      <div className="flex items-center justify-center gap-1 mb-3">
                        <span className={`w-3 h-3 rounded-full ${FOLDER_COLORS[selectedNode.color] || ''}`} />
                        <span className="text-[10px] text-codex-text-muted capitalize">{selectedNode.color}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-codex-text-muted">
                      Drag items here or use the move button to organize
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md px-8">
                    <div className="text-3xl mb-3">👈</div>
                    <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
                      Select a document
                    </h3>
                    <p className="text-xs text-codex-text-secondary">
                      Choose a document from the tree to preview its content
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Move-to-Folder Modal */}
      {moveTarget && (
        <div
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50"
          onClick={() => setMoveTarget(null)}
        >
          <div
            className="bg-codex-surface border border-codex-border rounded-lg shadow-xl w-80 max-h-96 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-codex-border">
              <h3 className="text-sm font-semibold text-codex-text-primary">Move "{moveTarget.name}"</h3>
              <p className="text-[10px] text-codex-text-muted mt-1">Select a destination folder</p>
            </div>
            <div className="max-h-60 overflow-y-auto p-2">
              <button
                onClick={() => handleMoveConfirm(null)}
                className="w-full text-left px-3 py-2 rounded text-xs text-codex-text-secondary hover:bg-codex-surface-hover transition-colors"
              >
                📂 Root (no folder)
              </button>
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => handleMoveConfirm(folder.id)}
                  disabled={folder.id === moveTarget.id}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                    folder.id === moveTarget.id
                      ? 'text-codex-text-muted opacity-50'
                      : 'text-codex-text-secondary hover:bg-codex-surface-hover'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {folder.color && FOLDER_COLORS[folder.color] && (
                      <span className={`w-2 h-2 rounded-full ${FOLDER_COLORS[folder.color]}`} />
                    )}
                    📁 {folder.name}
                    {folder.parent_id && (
                      <span className="text-codex-text-muted text-[10px]">(nested)</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-codex-border">
              <button
                onClick={() => setMoveTarget(null)}
                className="w-full px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-bg border border-codex-border rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {isAddingDoc && (
        <div
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50"
          onClick={() => { setIsAddingDoc(false); setNewDocName(''); setNewDocContent(''); }}
        >
          <div
            className="bg-codex-surface border border-codex-border rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-codex-border">
              <h3 className="text-sm font-semibold text-codex-text-primary">New Text Document</h3>
              <p className="text-[10px] text-codex-text-muted mt-1">Create a document to use as context for AI conversations and frameworks</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-codex-text-muted uppercase tracking-wide block mb-1">Name</label>
                <input
                  type="text"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g., Product Requirements, User Research Notes..."
                  autoFocus
                  className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>
              <div>
                <label className="text-[10px] text-codex-text-muted uppercase tracking-wide block mb-1">Content</label>
                <textarea
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  placeholder="Paste or type your document content here..."
                  rows={12}
                  className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-y font-mono"
                />
              </div>
            </div>
            <div className="p-3 border-t border-codex-border flex items-center justify-end gap-2">
              <button
                onClick={() => { setIsAddingDoc(false); setNewDocName(''); setNewDocContent(''); }}
                className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-bg border border-codex-border rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDoc}
                disabled={!newDocName.trim() || !newDocContent.trim()}
                className="px-4 py-1.5 text-xs bg-codex-accent text-white rounded hover:bg-codex-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color Picker Modal */}
      {colorTarget && (
        <div
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50"
          onClick={() => setColorTarget(null)}
        >
          <div
            className="bg-codex-surface border border-codex-border rounded-lg shadow-xl w-64 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-codex-border">
              <h3 className="text-sm font-semibold text-codex-text-primary">Folder Color</h3>
              <p className="text-[10px] text-codex-text-muted mt-1">Choose a color for "{colorTarget.name}"</p>
            </div>
            <div className="p-4 flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => handleColorConfirm(null)}
                className="w-8 h-8 rounded-full border-2 border-codex-border bg-codex-bg hover:border-codex-text-secondary transition-colors flex items-center justify-center"
                title="No color"
              >
                <span className="text-[10px] text-codex-text-muted">✕</span>
              </button>
              {Object.keys(FOLDER_COLORS).map(color => (
                <button
                  key={color}
                  onClick={() => handleColorConfirm(color)}
                  className={`w-8 h-8 rounded-full ${FOLDER_COLORS[color]} hover:ring-2 hover:ring-offset-2 hover:ring-offset-codex-surface hover:ring-codex-accent transition-all ${
                    colorTarget.color === color ? 'ring-2 ring-offset-2 ring-offset-codex-surface ring-white' : ''
                  }`}
                  title={color}
                />
              ))}
            </div>
            <div className="p-3 border-t border-codex-border">
              <button
                onClick={() => setColorTarget(null)}
                className="w-full px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-bg border border-codex-border rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
