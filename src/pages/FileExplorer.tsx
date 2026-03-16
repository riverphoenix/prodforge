import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { fileSystemAPI } from '../lib/ipc';
import { FileEntry } from '../lib/types';

interface OpenTab {
  path: string;
  name: string;
  content: string;
  modified: boolean;
  language: string;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', json: 'json', md: 'markdown', html: 'html',
  css: 'css', scss: 'scss', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell', txt: 'plaintext',
  xml: 'xml', svg: 'xml', java: 'java', go: 'go', rb: 'ruby',
  php: 'php', swift: 'swift', kt: 'kotlin', c: 'c', cpp: 'cpp',
  h: 'c', hpp: 'cpp', graphql: 'graphql', dockerfile: 'dockerfile',
  env: 'plaintext', gitignore: 'plaintext', lock: 'plaintext',
};

function getLanguage(name: string, ext: string): string {
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  if (lower.endsWith('.d.ts')) return 'typescript';
  return EXT_TO_LANG[ext.toLowerCase()] || 'plaintext';
}

function getFileIcon(name: string, ext: string, isDir: boolean): string {
  if (isDir) {
    const lower = name.toLowerCase();
    if (lower === 'src') return '\u{1F4E6}';
    if (lower === 'node_modules') return '\u{1F4E6}';
    if (lower === 'public' || lower === 'assets') return '\u{1F310}';
    if (lower === 'test' || lower === 'tests' || lower === '__tests__') return '\u{1F9EA}';
    return '\u{1F4C1}';
  }
  const e = ext.toLowerCase();
  if (['ts', 'tsx'].includes(e)) return '\u{1F7E6}';
  if (['js', 'jsx'].includes(e)) return '\u{1F7E8}';
  if (e === 'py') return '\u{1F40D}';
  if (e === 'rs') return '\u{2699}\uFE0F';
  if (e === 'json') return '\u{1F4CB}';
  if (e === 'md') return '\u{1F4DD}';
  if (['css', 'scss'].includes(e)) return '\u{1F3A8}';
  if (e === 'html') return '\u{1F310}';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'].includes(e)) return '\u{1F5BC}\uFE0F';
  if (e === 'toml') return '\u{2699}\uFE0F';
  if (e === 'lock') return '\u{1F512}';
  return '\u{1F4C4}';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)?.[0] || '';
  if (home && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

interface TreeItemProps {
  entry: FileEntry;
  depth: number;
  expanded: boolean;
  children?: FileEntry[];
  childrenExpanded: Record<string, boolean>;
  childrenMap: Record<string, FileEntry[]>;
  loadingDirs: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  selectedPath: string | null;
}

function TreeItem({ entry, depth, expanded, children, childrenExpanded, childrenMap, loadingDirs, onToggle, onFileClick, onContextMenu, selectedPath }: TreeItemProps) {
  const isSelected = selectedPath === entry.path;

  return (
    <>
      <div
        className={`flex items-center gap-1 px-2 py-[2px] cursor-pointer transition-colors duration-100 ${
          isSelected ? 'bg-codex-accent/15 text-codex-text-primary' : 'hover:bg-codex-surface-hover text-codex-text-secondary hover:text-codex-text-primary'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px`, fontSize: '12px', lineHeight: '22px' }}
        onClick={() => {
          if (entry.is_dir) {
            onToggle(entry.path);
          } else {
            onFileClick(entry);
          }
        }}
        onContextMenu={(e) => onContextMenu(e, entry)}
      >
        {entry.is_dir ? (
          <span className="w-3 text-[10px] text-codex-text-muted flex-shrink-0 select-none">
            {loadingDirs.has(entry.path) ? '...' : expanded ? '\u25BE' : '\u25B8'}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <span className="flex-shrink-0 text-xs select-none">{getFileIcon(entry.name, entry.extension, entry.is_dir)}</span>
        <span className="truncate select-none">{entry.name}</span>
      </div>
      {entry.is_dir && expanded && children && children.map(child => (
        <TreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          expanded={!!childrenExpanded[child.path]}
          children={childrenMap[child.path]}
          childrenExpanded={childrenExpanded}
          childrenMap={childrenMap}
          loadingDirs={loadingDirs}
          onToggle={onToggle}
          onFileClick={onFileClick}
          onContextMenu={onContextMenu}
          selectedPath={selectedPath}
        />
      ))}
    </>
  );
}

export default function FileExplorer() {
  const [rootPath, setRootPath] = useState<string>('');
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [childrenMap, setChildrenMap] = useState<Record<string, FileEntry[]>>({});
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const [creatingItem, setCreatingItem] = useState<{ parentPath: string; type: 'file' | 'folder' } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [treeWidth, setTreeWidth] = useState(240);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const resizingRef = useRef(false);

  useEffect(() => {
    const appDir = window.location.pathname.includes('tauri')
      ? undefined
      : undefined;
    if (appDir) {
      setRootPath(appDir);
    } else {
      fileSystemAPI.getAppDirectory().then(dir => {
        setRootPath(dir);
      }).catch(() => {
        fileSystemAPI.getHomeDirectory().then(home => setRootPath(home));
      });
    }
  }, []);

  const loadDirectory = useCallback(async (path: string) => {
    try {
      const entries = showHidden
        ? await fileSystemAPI.listDirectoryAll(path)
        : await fileSystemAPI.listDirectory(path);
      return entries;
    } catch (err) {
      console.error(`Failed to list directory ${path}:`, err);
      return [];
    }
  }, [showHidden]);

  useEffect(() => {
    if (!rootPath) return;
    loadDirectory(rootPath).then(setRootEntries);
  }, [rootPath, loadDirectory]);

  const handleToggleDir = useCallback(async (path: string) => {
    if (expandedDirs[path]) {
      setExpandedDirs(prev => ({ ...prev, [path]: false }));
      return;
    }

    setLoadingDirs(prev => new Set([...prev, path]));
    const entries = await loadDirectory(path);
    setChildrenMap(prev => ({ ...prev, [path]: entries }));
    setExpandedDirs(prev => ({ ...prev, [path]: true }));
    setLoadingDirs(prev => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, [expandedDirs, loadDirectory]);

  const handleFileClick = useCallback(async (entry: FileEntry) => {
    const existing = tabs.find(t => t.path === entry.path);
    if (existing) {
      setActiveTabPath(entry.path);
      return;
    }

    try {
      const content = await fileSystemAPI.readFile(entry.path);
      const lang = getLanguage(entry.name, entry.extension);
      const newTab: OpenTab = {
        path: entry.path,
        name: entry.name,
        content,
        modified: false,
        language: lang,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabPath(entry.path);
    } catch (err) {
      console.error('Failed to read file:', err);
    }
  }, [tabs]);

  const handleCloseTab = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs(prev => {
      const filtered = prev.filter(t => t.path !== path);
      if (activeTabPath === path) {
        const idx = prev.findIndex(t => t.path === path);
        const nextTab = filtered[Math.min(idx, filtered.length - 1)];
        setActiveTabPath(nextTab?.path || null);
      }
      return filtered;
    });
  }, [activeTabPath]);

  const handleContentChange = useCallback((path: string, value: string | undefined) => {
    if (value === undefined) return;
    setTabs(prev => prev.map(t =>
      t.path === path ? { ...t, content: value, modified: true } : t
    ));
  }, []);

  const handleSave = useCallback(async (path: string) => {
    const tab = tabs.find(t => t.path === path);
    if (!tab || !tab.modified) return;

    try {
      await fileSystemAPI.writeFile(path, tab.content);
      setTabs(prev => prev.map(t =>
        t.path === path ? { ...t, modified: false } : t
      ));
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [tabs]);

  const activeTab = useMemo(() => tabs.find(t => t.path === activeTabPath), [tabs, activeTabPath]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (activeTabPath) handleSave(activeTabPath);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      e.preventDefault();
      if (activeTabPath) handleCloseTab(activeTabPath);
    }
  }, [activeTabPath, handleSave, handleCloseTab]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const refreshDir = useCallback(async (dirPath: string) => {
    const entries = await loadDirectory(dirPath);
    if (dirPath === rootPath) {
      setRootEntries(entries);
    } else {
      setChildrenMap(prev => ({ ...prev, [dirPath]: entries }));
    }
  }, [rootPath, loadDirectory]);

  const handleCreateItem = useCallback(async () => {
    if (!creatingItem || !newItemName.trim()) {
      setCreatingItem(null);
      setNewItemName('');
      return;
    }

    const fullPath = `${creatingItem.parentPath}/${newItemName.trim()}`;
    try {
      if (creatingItem.type === 'file') {
        await fileSystemAPI.createFile(fullPath);
      } else {
        await fileSystemAPI.createDirectory(fullPath);
      }
      await refreshDir(creatingItem.parentPath);
      if (!expandedDirs[creatingItem.parentPath] && creatingItem.parentPath !== rootPath) {
        setExpandedDirs(prev => ({ ...prev, [creatingItem.parentPath]: true }));
      }
    } catch (err) {
      console.error('Failed to create item:', err);
    }
    setCreatingItem(null);
    setNewItemName('');
  }, [creatingItem, newItemName, rootPath, expandedDirs, refreshDir]);

  const handleRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      setRenameValue('');
      return;
    }

    const dir = renamingPath.substring(0, renamingPath.lastIndexOf('/'));
    const newPath = `${dir}/${renameValue.trim()}`;
    try {
      await fileSystemAPI.rename(renamingPath, newPath);
      await refreshDir(dir);
      setTabs(prev => prev.map(t =>
        t.path === renamingPath ? { ...t, path: newPath, name: renameValue.trim() } : t
      ));
      if (activeTabPath === renamingPath) setActiveTabPath(newPath);
    } catch (err) {
      console.error('Failed to rename:', err);
    }
    setRenamingPath(null);
    setRenameValue('');
  }, [renamingPath, renameValue, activeTabPath, refreshDir]);

  const handleDelete = useCallback(async (entry: FileEntry) => {
    try {
      await fileSystemAPI.delete(entry.path, entry.is_dir);
      const dir = entry.path.substring(0, entry.path.lastIndexOf('/'));
      await refreshDir(dir);
      if (tabs.find(t => t.path === entry.path)) {
        handleCloseTab(entry.path);
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, [tabs, handleCloseTab, refreshDir]);

  useEffect(() => {
    if (creatingItem && newItemInputRef.current) newItemInputRef.current.focus();
  }, [creatingItem]);

  useEffect(() => {
    if (renamingPath && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingPath]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = treeWidth;

    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - startX;
      setTreeWidth(Math.max(160, Math.min(500, startWidth + delta)));
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [treeWidth]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setRootPath(selected);
        setExpandedDirs({});
        setChildrenMap({});
      }
    } catch {
      // fallback: do nothing
    }
  }, []);

  const handleNavigateUp = useCallback(() => {
    const parent = rootPath.substring(0, rootPath.lastIndexOf('/'));
    if (parent) {
      setRootPath(parent);
      setExpandedDirs({});
      setChildrenMap({});
    }
  }, [rootPath]);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }} className="bg-codex-bg">
      {/* File Tree */}
      <div style={{ width: treeWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="border-r border-codex-border bg-codex-sidebar">
        {/* Tree Header */}
        <div className="flex items-center justify-between px-3 h-8 flex-shrink-0 border-b border-codex-border">
          <span className="text-[10px] font-semibold text-codex-text-muted tracking-wider uppercase select-none">Explorer</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setCreatingItem({ parentPath: rootPath, type: 'file' });
                setNewItemName('');
              }}
              className="w-5 h-5 flex items-center justify-center text-codex-text-muted hover:text-codex-text-primary rounded hover:bg-codex-surface-hover transition-colors"
              title="New File"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 1H3.5L3 1.5V13.5L3.5 14H12.5L13 13.5V2.5L11.5 1ZM4 13V2H11V4H13V13H4Z"/><path d="M8 6H9V8H11V9H9V11H8V9H6V8H8V6Z"/></svg>
            </button>
            <button
              onClick={() => {
                setCreatingItem({ parentPath: rootPath, type: 'folder' });
                setNewItemName('');
              }}
              className="w-5 h-5 flex items-center justify-center text-codex-text-muted hover:text-codex-text-primary rounded hover:bg-codex-surface-hover transition-colors"
              title="New Folder"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H9.618L8.5 2.882A1.005 1.005 0 007.882 2.5H2.5L2 3V13L2.5 13.5H13.5L14 13V4.5L14 4ZM3 3.5H7.882L9 4.618V5H13V12.5H3V3.5Z"/><path d="M8 7H9V9H11V10H9V12H8V10H6V9H8V7Z"/></svg>
            </button>
            <button
              onClick={() => refreshDir(rootPath)}
              className="w-5 h-5 flex items-center justify-center text-codex-text-muted hover:text-codex-text-primary rounded hover:bg-codex-surface-hover transition-colors"
              title="Refresh"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.146-1.108 1.61l1.059.394c.056-.144.236-.44.48-.759l-.109.735A4.502 4.502 0 017.5 12.5c-2.481 0-4.5-2.019-4.5-4.5S5.019 3.5 7.5 3.5a4.47 4.47 0 013.397 1.56l-.898-.143-.156.987 2.727.433.432-2.728-.987-.156-.133.84A5.47 5.47 0 007.5 2.5C4.467 2.5 2 4.967 2 8s2.467 5.5 5.5 5.5S13 11.033 13 8c0-.318-.028-.63-.082-.934l.533.068z"/></svg>
            </button>
            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`w-5 h-5 flex items-center justify-center rounded hover:bg-codex-surface-hover transition-colors ${showHidden ? 'text-codex-accent' : 'text-codex-text-muted hover:text-codex-text-primary'}`}
              title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.7 5.3.5 8c1.2 2.7 4 5 7.5 5s6.3-2.3 7.5-5C14.3 5.3 11.5 3 8 3zm0 8.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm0-5.5a2 2 0 100 4 2 2 0 000-4z"/></svg>
            </button>
          </div>
        </div>

        {/* Root path bar */}
        <div className="flex items-center gap-1 px-2 h-6 flex-shrink-0 border-b border-codex-border bg-codex-surface/30">
          <button
            onClick={handleNavigateUp}
            className="text-codex-text-muted hover:text-codex-text-primary text-[10px] flex-shrink-0"
            title="Go up"
          >
            ..
          </button>
          <span className="text-[10px] text-codex-text-muted truncate flex-1" title={rootPath}>
            {shortenPath(rootPath)}
          </span>
          <button
            onClick={handleOpenFolder}
            className="text-[10px] text-codex-text-muted hover:text-codex-text-primary flex-shrink-0"
            title="Open folder"
          >
            ...
          </button>
        </div>

        {/* Tree content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {creatingItem && creatingItem.parentPath === rootPath && (
            <div className="flex items-center gap-1 px-2 py-[2px]" style={{ paddingLeft: '8px', fontSize: '12px' }}>
              <span className="w-3 flex-shrink-0" />
              <span className="text-xs flex-shrink-0">{creatingItem.type === 'folder' ? '\u{1F4C1}' : '\u{1F4C4}'}</span>
              <input
                ref={newItemInputRef}
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateItem();
                  if (e.key === 'Escape') { setCreatingItem(null); setNewItemName(''); }
                }}
                onBlur={handleCreateItem}
                className="flex-1 bg-codex-surface border border-codex-accent rounded px-1 text-codex-text-primary outline-none"
                style={{ fontSize: '12px', lineHeight: '20px' }}
                placeholder={creatingItem.type === 'folder' ? 'folder name' : 'file name'}
              />
            </div>
          )}
          {rootEntries.map(entry => (
            <TreeItem
              key={entry.path}
              entry={entry}
              depth={0}
              expanded={!!expandedDirs[entry.path]}
              children={childrenMap[entry.path]}
              childrenExpanded={expandedDirs}
              childrenMap={childrenMap}
              loadingDirs={loadingDirs}
              onToggle={handleToggleDir}
              onFileClick={handleFileClick}
              onContextMenu={handleContextMenu}
              selectedPath={activeTabPath}
            />
          ))}
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="w-1 cursor-col-resize hover:bg-codex-accent/30 transition-colors flex-shrink-0"
      />

      {/* Editor area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {/* Tab bar */}
        {tabs.length > 0 && (
          <div className="flex items-center h-[30px] flex-shrink-0 border-b border-codex-border bg-codex-sidebar overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(tab => (
              <div
                key={tab.path}
                className={`flex items-center gap-1.5 px-3 h-full cursor-pointer border-r border-codex-border transition-colors ${
                  activeTabPath === tab.path
                    ? 'bg-codex-bg text-codex-text-primary'
                    : 'bg-codex-sidebar text-codex-text-secondary hover:bg-codex-surface-hover'
                }`}
                onClick={() => setActiveTabPath(tab.path)}
                title={tab.path}
                style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
              >
                <span className="text-[10px]">{getFileIcon(tab.name, tab.path.split('.').pop() || '', false)}</span>
                <span>{tab.name}</span>
                {tab.modified && (
                  <span className="w-2 h-2 rounded-full bg-codex-accent flex-shrink-0" />
                )}
                <button
                  onClick={(e) => handleCloseTab(tab.path, e)}
                  className="ml-1 text-codex-text-muted hover:text-codex-text-primary rounded hover:bg-codex-surface-hover w-4 h-4 flex items-center justify-center flex-shrink-0"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1.41 0L0 1.41 2.59 4 0 6.59 1.41 8 4 5.41 6.59 8 8 6.59 5.41 4 8 1.41 6.59 0 4 2.59z"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Breadcrumb */}
        {activeTab && (
          <div className="flex items-center h-5 px-3 flex-shrink-0 bg-codex-surface/20" style={{ fontSize: '10px' }}>
            <span className="text-codex-text-muted truncate">{shortenPath(activeTab.path)}</span>
            {activeTab.modified && (
              <span className="ml-2 text-codex-accent">(unsaved)</span>
            )}
          </div>
        )}

        {/* Editor */}
        {activeTab ? (
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <Editor
              key={activeTab.path}
              defaultLanguage={activeTab.language}
              defaultValue={activeTab.content}
              theme="vs-dark"
              onChange={(value) => handleContentChange(activeTab.path, value)}
              options={{
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, monospace",
                minimap: { enabled: true, maxColumn: 80 },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                padding: { top: 8 },
                tabSize: 2,
                automaticLayout: true,
              }}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="text-4xl mb-3 opacity-50">{'\u{1F4C2}'}</div>
              <h3 className="text-sm text-codex-text-secondary mb-2">No file open</h3>
              <p className="text-[10px] text-codex-text-muted leading-relaxed">
                Click a file in the explorer to open it, or use the folder button above to open a directory.
              </p>
              <div className="mt-4 flex flex-col items-center gap-1 text-[10px] text-codex-text-muted">
                <span><span className="text-codex-text-secondary">Cmd+S</span> Save</span>
                <span><span className="text-codex-text-secondary">Cmd+W</span> Close tab</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-codex-surface border border-codex-border rounded-md shadow-xl py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y, fontSize: '12px', minWidth: '160px' }}
        >
          {contextMenu.entry.is_dir && (
            <>
              <button
                className="w-full px-3 py-1.5 text-left text-codex-text-primary hover:bg-codex-surface-hover transition-colors"
                onClick={() => {
                  setCreatingItem({ parentPath: contextMenu.entry.path, type: 'file' });
                  setNewItemName('');
                  if (!expandedDirs[contextMenu.entry.path]) {
                    handleToggleDir(contextMenu.entry.path);
                  }
                  setContextMenu(null);
                }}
              >
                New File
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-codex-text-primary hover:bg-codex-surface-hover transition-colors"
                onClick={() => {
                  setCreatingItem({ parentPath: contextMenu.entry.path, type: 'folder' });
                  setNewItemName('');
                  if (!expandedDirs[contextMenu.entry.path]) {
                    handleToggleDir(contextMenu.entry.path);
                  }
                  setContextMenu(null);
                }}
              >
                New Folder
              </button>
              <div className="border-t border-codex-border my-1" />
            </>
          )}
          <button
            className="w-full px-3 py-1.5 text-left text-codex-text-primary hover:bg-codex-surface-hover transition-colors"
            onClick={() => {
              setRenamingPath(contextMenu.entry.path);
              setRenameValue(contextMenu.entry.name);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => {
              handleDelete(contextMenu.entry);
              setContextMenu(null);
            }}
          >
            Delete
          </button>
          {!contextMenu.entry.is_dir && (
            <>
              <div className="border-t border-codex-border my-1" />
              <div className="px-3 py-1 text-[10px] text-codex-text-muted">
                {formatSize(contextMenu.entry.size)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Rename overlay */}
      {renamingPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" onClick={() => { setRenamingPath(null); setRenameValue(''); }}>
          <div className="bg-codex-surface border border-codex-border rounded-lg p-4 shadow-xl w-80" onClick={e => e.stopPropagation()}>
            <div className="text-xs text-codex-text-secondary mb-2">Rename</div>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') { setRenamingPath(null); setRenameValue(''); }
              }}
              className="w-full px-2 py-1.5 bg-codex-bg border border-codex-border rounded text-codex-text-primary text-sm outline-none focus:border-codex-accent"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setRenamingPath(null); setRenameValue(''); }}
                className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="px-3 py-1 text-xs bg-codex-accent text-white rounded hover:bg-codex-accent/80"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
