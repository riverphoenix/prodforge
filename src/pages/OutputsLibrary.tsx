import { useState, useEffect, useRef } from 'react';
import { ask, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { frameworkOutputsAPI, frameworkDefsAPI, settingsAPI, gitAPI } from '../lib/ipc';
import { FrameworkOutput, FrameworkDefinition, Settings, LLMProvider } from '../lib/types';
import MarkdownWithMermaid from '../components/MarkdownWithMermaid';
import MarkdownEditor from '../components/MarkdownEditor';
import SectionRegenerator from '../components/SectionRegenerator';
import ModelSelector from '../components/ModelSelector';
import ResizableDivider from '../components/ResizableDivider';
import VersionHistory from '../components/VersionHistory';
import ExportToJiraDialog from '../components/ExportToJiraDialog';
import ExportToNotionDialog from '../components/ExportToNotionDialog';

interface OutputsLibraryProps {
  projectId: string;
  onEdit?: (outputId: string) => void;
}

export default function OutputsLibrary({ projectId }: OutputsLibraryProps) {
  const [outputs, setOutputs] = useState<FrameworkOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOutput, setSelectedOutput] = useState<FrameworkOutput | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [frameworksMap, setFrameworksMap] = useState<Map<string, FrameworkDefinition>>(new Map());
  const [showHistory, setShowHistory] = useState(false);
  const [showJiraExport, setShowJiraExport] = useState(false);
  const [showNotionExport, setShowNotionExport] = useState(false);
  const [settings, setAppSettings] = useState<Settings | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [showRefineChat, setShowRefineChat] = useState(false);
  const [refineInput, setRefineInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refineProvider, setRefineProvider] = useState<LLMProvider>('openai');
  const [refineModel, setRefineModel] = useState('gpt-5');
  const refineAbortRef = useRef<AbortController | null>(null);

  // Panel resize state
  const [listWidth, setListWidth] = useState(384); // 384px = 96 * 4 (w-96)

  const handlePanelResize = (deltaX: number) => {
    setListWidth(prev => Math.max(280, Math.min(600, prev + deltaX)));
  };

  useEffect(() => {
    loadOutputs();
  }, [projectId]);

  const loadOutputs = async () => {
    setLoading(true);
    try {
      const [data, allFw, sett] = await Promise.all([
        frameworkOutputsAPI.list(projectId),
        frameworkDefsAPI.list(),
        settingsAPI.get(),
      ]);
      setOutputs(data);
      setFrameworksMap(new Map(allFw.map(fw => [fw.id, fw])));
      setAppSettings(sett);
    } catch (err) {
      console.error('Failed to load outputs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await ask('Are you sure you want to delete this output?', {
      title: 'Confirm Delete',
      kind: 'warning',
    });

    if (!confirmed) return;

    try {
      await frameworkOutputsAPI.delete(id);
      await loadOutputs();
      if (selectedOutput?.id === id) {
        setSelectedOutput(null);
      }
    } catch (err) {
      console.error('Failed to delete output:', err);
    }
  };

  const handleCopyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownloadMarkdown = async (output: FrameworkOutput) => {
    try {
      const filename = `${output.name}.md`;
      console.log('📥 Opening save dialog for:', filename);

      const filePath = await save({
        defaultPath: filename,
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }]
      });

      if (!filePath) {
        console.log('⚠️ Save cancelled by user');
        return;
      }

      await writeTextFile(filePath, output.generated_content);
      console.log('✅ File saved successfully to:', filePath);
    } catch (err) {
      console.error('❌ Failed to save file:', err);
    }
  };

  const handleContentChange = async (newContent: string) => {
    if (!selectedOutput) return;
    try {
      const updated = await frameworkOutputsAPI.update(selectedOutput.id, selectedOutput.name, newContent);
      setSelectedOutput({ ...selectedOutput, generated_content: newContent, updated_at: updated.updated_at });
      try {
        await gitAPI.commitOutput(projectId, selectedOutput.id, selectedOutput.name, newContent, `Edit: ${selectedOutput.name}`);
      } catch { /* git commit is best-effort */ }
    } catch (err) {
      console.error('Failed to save edit:', err);
    }
  };

  const handleRefine = async () => {
    if (!selectedOutput || !refineInput.trim()) return;
    setIsRefining(true);

    try {
      const apiKey = await settingsAPI.getDecryptedKeyForProvider(refineProvider);
      const sett = await settingsAPI.get();
      const abortController = new AbortController();
      refineAbortRef.current = abortController;

      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are refining a PM document. Return the COMPLETE updated document in markdown format. Keep the same structure and headers.' },
            { role: 'user', content: `Here is the current document:\n\n${selectedOutput.generated_content}\n\n---\n\nPlease refine it with this instruction: ${refineInput}` }
          ],
          model: refineModel,
          api_key: apiKey || '',
          provider: refineProvider,
          ollama_url: sett.ollama_base_url || undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let newContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.substring(6));
              if (event.type === 'content_block_delta' && event.delta?.text) {
                newContent += event.delta.text;
              } else if (event.type === 'error') {
                throw new Error(event.error);
              }
            } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
          }
        }
      }

      if (newContent.trim()) {
        await handleContentChange(newContent.trim());
        await loadOutputs();
      }
      setRefineInput('');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Refinement failed:', err);
    } finally {
      setIsRefining(false);
      refineAbortRef.current = null;
    }
  };

  // Filter outputs
  const filteredOutputs = outputs.filter(output => {
    const matchesCategory = filterCategory === 'all' || output.category === filterCategory;
    const matchesSearch = !searchQuery.trim() ||
      output.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      output.generated_content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Group by category
  const categories = Array.from(new Set(outputs.map(o => o.category)));
  const categoryCounts = categories.map(cat => ({
    category: cat,
    count: outputs.filter(o => o.category === cat).length
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      {/* Header */}
      <div style={{ flexShrink: 0 }} className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-codex-text-primary">
              Outputs
            </h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              {outputs.length} saved framework outputs
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 max-w-2xl">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search outputs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-codex-accent"
          >
            <option value="all">All Categories ({outputs.length})</option>
            {categoryCounts.map(({ category, count }) => (
              <option key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)} ({count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-codex-text-secondary">Loading outputs...</div>
        </div>
      ) : outputs.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center max-w-md px-8">
            <div className="text-4xl mb-3">📚</div>
            <h3 className="text-sm font-semibold text-codex-text-primary mb-1">No outputs yet</h3>
            <p className="text-xs text-codex-text-secondary">
              Generate your first PM framework to see it here
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
          {/* Outputs List */}
          <div
            className="flex-shrink-0 border-r border-codex-border overflow-y-auto"
            style={{ width: `${listWidth}px` }}
          >
            {filteredOutputs.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-codex-text-secondary text-sm">No matching outputs</div>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {filteredOutputs.map((output) => {
                  const framework = frameworksMap.get(output.framework_id);
                  const isSelected = selectedOutput?.id === output.id;

                  return (
                    <div
                      key={output.id}
                      onClick={() => { setSelectedOutput(output); setEditMode(false); setShowRefineChat(false); }}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/50'
                          : 'bg-codex-surface/60 border border-codex-border hover:bg-codex-surface-hover hover:border-codex-surface-hover'
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        {framework && (
                          <span className="text-lg flex-shrink-0">{framework.icon}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-codex-text-primary truncate">
                            {output.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 text-xs text-codex-text-muted">
                            {framework && <span>{framework.name}</span>}
                            <span>•</span>
                            <span>{new Date(output.created_at * 1000).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      {output.user_prompt && (
                        <p className="text-xs text-codex-text-secondary line-clamp-2">
                          {output.user_prompt}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resizable Divider */}
          <ResizableDivider onResize={handlePanelResize} />

          {/* Output Preview */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {selectedOutput ? (
              <>
                <div className="flex-shrink-0 border-b border-codex-border bg-codex-surface/50 px-6 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-codex-text-primary">{selectedOutput.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-codex-text-muted">
                      <span>Created {new Date(selectedOutput.created_at * 1000).toLocaleDateString()}</span>
                      {selectedOutput.updated_at !== selectedOutput.created_at && (
                        <>
                          <span>•</span>
                          <span>Updated {new Date(selectedOutput.updated_at * 1000).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowHistory(true)}
                      className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                      title="Version history"
                    >
                      History
                    </button>
                    <button
                      onClick={() => handleCopyToClipboard(selectedOutput.generated_content)}
                      className={`px-3 py-1 text-xs transition-colors ${
                        copied
                          ? 'text-green-400'
                          : 'text-codex-text-secondary hover:text-codex-text-primary'
                      }`}
                      title="Copy to clipboard"
                    >
                      {copied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                    <button
                      onClick={() => handleDownloadMarkdown(selectedOutput)}
                      className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                      title="Download as markdown"
                    >
                      ⬇️ Download
                    </button>
                    {settings?.jira_api_token_encrypted && (
                      <button
                        onClick={() => setShowJiraExport(true)}
                        className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                      >
                        Jira
                      </button>
                    )}
                    {settings?.notion_api_token_encrypted && (
                      <button
                        onClick={() => setShowNotionExport(true)}
                        className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                      >
                        Notion
                      </button>
                    )}
                    <button
                      onClick={() => { setEditMode(!editMode); setShowRefineChat(false); }}
                      className={`px-3 py-1 text-xs transition-colors ${
                        editMode ? 'text-codex-accent' : 'text-codex-text-secondary hover:text-codex-text-primary'
                      }`}
                    >
                      {editMode ? 'Done' : 'Edit'}
                    </button>
                    <button
                      onClick={() => { setShowRefineChat(!showRefineChat); }}
                      className={`px-3 py-1 text-xs transition-colors ${
                        showRefineChat ? 'text-codex-accent' : 'text-codex-text-secondary hover:text-codex-text-primary'
                      }`}
                    >
                      Refine
                    </button>
                    <button
                      onClick={() => handleDelete(selectedOutput.id)}
                      className="px-3 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* User Prompt */}
                {selectedOutput.user_prompt && (
                  <div className="flex-shrink-0 border-b border-codex-border bg-codex-surface/40 px-6 py-3">
                    <div className="text-[10px] font-medium text-codex-text-muted uppercase mb-1">
                      Prompt
                    </div>
                    <div className="text-xs text-codex-text-secondary">
                      {selectedOutput.user_prompt}
                    </div>
                  </div>
                )}

                {/* Content area */}
                <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {editMode ? (
                    <MarkdownEditor
                      content={selectedOutput.generated_content}
                      onChange={handleContentChange}
                    />
                  ) : (
                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="p-6">
                      <MarkdownWithMermaid content={selectedOutput.generated_content} />
                    </div>
                  )}

                  {/* Section regenerator */}
                  {!editMode && (
                    <SectionRegenerator
                      content={selectedOutput.generated_content}
                      onContentUpdate={async (newContent) => {
                        await handleContentChange(newContent);
                        await loadOutputs();
                      }}
                    />
                  )}

                  {/* Refine chat drawer */}
                  {showRefineChat && (
                    <div className="flex-shrink-0 border-t border-codex-border bg-codex-surface/50 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-codex-text-muted font-medium">Refine with AI</span>
                        <ModelSelector
                          selectedProvider={refineProvider}
                          selectedModel={refineModel}
                          onSelect={(p, m) => { setRefineProvider(p); setRefineModel(m); }}
                          compact
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={refineInput}
                          onChange={(e) => setRefineInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                          placeholder="e.g. Make the competitive analysis more detailed..."
                          className="flex-1 px-3 py-1.5 bg-codex-bg border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                          disabled={isRefining}
                        />
                        <button
                          onClick={handleRefine}
                          disabled={isRefining || !refineInput.trim()}
                          className="px-3 py-1.5 text-xs bg-codex-accent hover:bg-codex-accent-hover disabled:opacity-50 text-white rounded transition-colors"
                        >
                          {isRefining ? 'Refining...' : 'Refine'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md px-8">
                  <div className="text-3xl mb-3">👈</div>
                  <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
                    Select an output
                  </h3>
                  <p className="text-xs text-codex-text-secondary">
                    Choose an output from the list to view its content
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {showHistory && selectedOutput && (
        <VersionHistory
          projectId={projectId}
          outputId={selectedOutput.id}
          currentContent={selectedOutput.generated_content}
          onRestore={(content) => {
            setSelectedOutput({ ...selectedOutput, generated_content: content });
            setShowHistory(false);
            loadOutputs();
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showJiraExport && selectedOutput && (
        <ExportToJiraDialog
          outputId={selectedOutput.id}
          outputName={selectedOutput.name}
          onClose={() => setShowJiraExport(false)}
        />
      )}

      {showNotionExport && selectedOutput && (
        <ExportToNotionDialog
          outputId={selectedOutput.id}
          outputName={selectedOutput.name}
          defaultParentPageId={settings?.notion_parent_page_id || undefined}
          onClose={() => setShowNotionExport(false)}
        />
      )}
    </div>
  );
}
