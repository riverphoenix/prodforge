import { useState, useEffect } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { contextDocumentsAPI } from '../lib/ipc';
import { ContextDocument } from '../lib/types';

interface ContextManagerProps {
  projectId: string;
}

export default function ContextManager({ projectId }: ContextManagerProps) {
  const [documents, setDocuments] = useState<ContextDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState<'text' | 'url' | 'pdf' | 'google_doc'>('text');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [projectId]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await contextDocumentsAPI.list(projectId);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchUrl = async () => {
    if (!newDocUrl.trim()) {
      setError('Please enter a URL');
      return;
    }

    console.log('🌐 Fetching URL:', newDocUrl);
    setIsFetching(true);
    setError(null);

    try {
      const url = `http://127.0.0.1:8001/parse-url?url=${encodeURIComponent(newDocUrl)}`;
      console.log('Calling:', url);

      const response = await fetch(url, {
        method: 'POST'
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        let errorMessage = 'Failed to fetch URL';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('✅ Fetched data:', { title: data.title, contentLength: data.content?.length, type: data.type });

      // Auto-fill name and content
      if (!newDocName.trim() && data.title) {
        setNewDocName(data.title);
      }

      if (data.content) {
        setNewDocContent(data.content);
        console.log('✅ Content set, length:', data.content.length);
      } else {
        throw new Error('No content received from URL');
      }

      setNewDocType(data.type === 'google_doc' ? 'google_doc' : 'url');

    } catch (err) {
      console.error('❌ Failed to fetch URL:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch URL content';
      setError(`Fetch failed: ${errorMessage}`);
    } finally {
      setIsFetching(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    console.log('📄 PDF upload started:', { name: file.name, size: file.size, type: file.type });

    setPdfFile(file);
    setNewDocType('pdf');

    if (!newDocName.trim()) {
      setNewDocName(file.name.replace(/\.pdf$/i, ''));
    }

    setIsFetching(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      console.log('📤 Sending PDF to parser, size:', bytes.length);

      const response = await fetch('http://127.0.0.1:8001/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: bytes
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        let errorMessage = 'Failed to parse PDF';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('✅ PDF parsed, content length:', data.content?.length);

      if (data.content) {
        setNewDocContent(data.content);
        console.log('✅ PDF content set');
      } else {
        throw new Error('No content extracted from PDF');
      }

    } catch (err) {
      console.error('❌ Failed to parse PDF:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract PDF text';
      setError(`PDF parsing failed: ${errorMessage}`);
    } finally {
      setIsFetching(false);
    }
  };

  const handleAddDocument = async () => {
    if (!newDocName.trim()) {
      setError('Name is required');
      return;
    }

    // For text type, content is required. For URL/PDF/Google Doc, content should be auto-populated
    if (newDocType === 'text' && !newDocContent.trim()) {
      setError('Content is required for text documents');
      return;
    }

    if ((newDocType === 'url' || newDocType === 'google_doc') && !newDocContent.trim()) {
      setError('Please fetch the URL first to extract content');
      return;
    }

    if (newDocType === 'pdf' && !newDocContent.trim()) {
      setError('Please upload a PDF file first to extract content');
      return;
    }

    try {
      await contextDocumentsAPI.create(
        projectId,
        newDocName,
        newDocType,
        newDocContent,
        newDocType === 'url' ? newDocUrl : undefined,
        false
      );

      // Reset form
      setNewDocName('');
      setNewDocContent('');
      setNewDocUrl('');
      setShowAddDialog(false);
      setError(null);

      // Reload documents
      await loadDocuments();
    } catch (err) {
      console.error('Failed to add document:', err);
      setError('Failed to add document');
    }
  };


  const handleDeleteDocument = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    console.log('🗑️ Delete button clicked for document:', id);

    const confirmed = await ask('Are you sure you want to delete this document?', {
      title: 'Confirm Delete',
      kind: 'warning',
    });
    console.log('User confirmation:', confirmed);

    if (!confirmed) return;

    try {
      console.log('Deleting document:', id);
      await contextDocumentsAPI.delete(id);
      console.log('✅ Document deleted successfully');
      await loadDocuments();
    } catch (err) {
      console.error('❌ Failed to delete document:', err);
      setError(`Failed to delete document: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const totalSize = documents.reduce((sum, doc) => sum + doc.size_bytes, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      {/* Header */}
      <div style={{ flexShrink: 0 }} className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-codex-text-primary">
              Context
            </h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              Manage documents that provide context for AI framework generation.
            </p>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-codex-accent hover:bg-codex-accent-hover text-white text-sm rounded-md transition-colors"
          >
            + Add Document
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-codex-text-muted">Total:</span>
            <span className="text-codex-text-primary">{documents.length} documents</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-codex-text-muted">Size:</span>
            <span className="text-codex-text-primary">{(totalSize / 1024).toFixed(1)} KB</span>
          </div>
          {totalSize > 50000 && (
            <div className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded">
              ⚠️ Large context size may increase costs
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-codex-text-secondary">Loading documents...</div>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center max-w-md">
              <div className="text-4xl mb-3">📄</div>
              <h3 className="text-sm font-semibold text-codex-text-primary mb-1">No documents yet</h3>
              <p className="text-[10px] text-codex-text-muted mb-4">
                Add context documents to provide background information for AI framework generation
              </p>
              <button
                onClick={() => setShowAddDialog(true)}
                className="px-3 py-1.5 bg-codex-accent hover:bg-codex-accent-hover text-white text-xs rounded transition-colors"
              >
                Add Your First Document
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-codex-surface/60 border border-codex-border rounded-lg p-4 hover:bg-codex-surface-hover transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-codex-text-primary truncate">
                        {doc.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-codex-text-muted">
                      <span className="capitalize">{doc.type}</span>
                      <span>•</span>
                      <span>{(doc.size_bytes / 1024).toFixed(1)} KB</span>
                      <span>•</span>
                      <span>Added {new Date(doc.created_at * 1000).toLocaleDateString()}</span>
                    </div>
                    {doc.url && (
                      <div className="mt-1 text-[10px] text-codex-text-muted truncate">
                        🔗 {doc.url}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={(e) => handleDeleteDocument(doc.id, e)}
                      className="px-3 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Content Preview */}
                <div className="mt-3 pt-3 border-t border-codex-border/50">
                  <div className="text-[10px] text-codex-text-muted line-clamp-2">
                    {doc.content.substring(0, 200)}
                    {doc.content.length > 200 && '...'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Document Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-6">
          <div className="border border-codex-border rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-codex-bg">
            <h3 className="text-lg font-semibold text-codex-text-primary mb-4">Add Context Document</h3>

            <div className="space-y-4">
              {/* Document Type */}
              <div>
                <label className="block text-sm font-medium text-codex-text-secondary mb-2">
                  Document Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['text', 'url', 'pdf', 'google_doc'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewDocType(type)}
                      className={`px-3 py-2 text-sm rounded transition-colors ${
                        newDocType === type
                          ? 'bg-indigo-600 text-codex-text-primary'
                          : 'bg-codex-surface text-codex-text-secondary hover:bg-slate-600'
                      }`}
                    >
                      {type === 'text' && '📝 Text'}
                      {type === 'url' && '🔗 URL'}
                      {type === 'pdf' && '📄 PDF'}
                      {type === 'google_doc' && '📄 Google Doc'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-codex-text-secondary mb-2">
                  Document Name
                </label>
                <input
                  type="text"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g., Product Strategy 2026"
                  className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded text-codex-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-codex-accent"
                />
              </div>

              {/* URL (if type is url or google_doc) */}
              {(newDocType === 'url' || newDocType === 'google_doc') && (
                <div>
                  <label className="block text-sm font-medium text-codex-text-secondary mb-2">
                    URL {newDocType === 'google_doc' && '(Google Docs public link)'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newDocUrl}
                      onChange={(e) => setNewDocUrl(e.target.value)}
                      placeholder={newDocType === 'google_doc' ? 'https://docs.google.com/document/d/...' : 'https://...'}
                      className="flex-1 px-3 py-2 bg-codex-bg border border-codex-border rounded text-codex-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-codex-accent"
                      onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                    />
                    <button
                      onClick={handleFetchUrl}
                      disabled={isFetching || !newDocUrl.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-codex-surface disabled:cursor-not-allowed text-codex-text-primary text-sm font-medium rounded transition-colors"
                    >
                      {isFetching ? 'Fetching...' : 'Fetch'}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-codex-text-muted">
                    Automatically extracts content from the URL
                  </div>
                </div>
              )}

              {/* PDF Upload */}
              {newDocType === 'pdf' && (
                <div>
                  <label className="block text-sm font-medium text-codex-text-secondary mb-2">
                    Upload PDF
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center justify-center px-4 py-3 bg-codex-bg border-2 border-dashed border-codex-border rounded cursor-pointer hover:border-indigo-500 hover:bg-codex-surface transition-colors">
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePdfUpload(file);
                        }}
                        className="hidden"
                      />
                      <div className="text-center">
                        {pdfFile ? (
                          <>
                            <div className="text-sm text-codex-text-primary mb-1">📄 {pdfFile.name}</div>
                            <div className="text-[10px] text-codex-text-muted">
                              {(pdfFile.size / 1024).toFixed(1)} KB • Click to change
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm text-codex-text-secondary mb-1">Click to upload PDF</div>
                            <div className="text-xs text-codex-text-muted">Text will be extracted automatically</div>
                          </>
                        )}
                      </div>
                    </label>
                  </div>
                  {isFetching && (
                    <div className="mt-2 text-xs text-indigo-400">
                      Extracting text from PDF...
                    </div>
                  )}
                </div>
              )}

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-codex-text-secondary mb-2">
                  Content
                  {newDocType === 'pdf' && ' (Paste extracted text)'}
                </label>
                <textarea
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  placeholder="Paste your document content here..."
                  rows={10}
                  className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded text-codex-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-codex-accent resize-none font-mono"
                />
                <div className="mt-1 text-xs text-codex-text-muted">
                  {newDocContent.length} characters • {(newDocContent.length / 1024).toFixed(1)} KB
                </div>
              </div>

            </div>

            {error && (
              <div className="mt-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddDialog(false);
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-codex-surface hover:bg-slate-600 text-codex-text-primary text-sm rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDocument}
                className="flex-1 px-3 py-1.5 bg-codex-accent hover:bg-codex-accent-hover text-white text-xs rounded transition-colors"
              >
                Add Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
