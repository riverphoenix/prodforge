import { useState, useEffect, useRef, useCallback } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { getFramework } from '../lib/frameworks';
import { contextDocumentsAPI, frameworkOutputsAPI, settingsAPI, savedPromptsAPI } from '../lib/ipc';
import { FrameworkDefinition, ContextDocument, LLMProvider } from '../lib/types';
import MarkdownWithMermaid from './MarkdownWithMermaid';
import ResizableDivider from './ResizableDivider';
import FrameworkCustomizer from './FrameworkCustomizer';
import PromptPickerModal from './PromptPickerModal';
import ModelSelector from './ModelSelector';
import { getFrameworkState, setFrameworkState } from '../lib/frameworkStore';

interface FrameworkGeneratorProps {
  projectId: string;
  frameworkId: string;
  onSave?: () => void;
  onCancel?: () => void;
}

export default function FrameworkGenerator({
  projectId,
  frameworkId,
  onSave,
  onCancel,
}: FrameworkGeneratorProps) {
  const [framework, setFramework] = useState<FrameworkDefinition | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [availableDocs, setAvailableDocs] = useState<ContextDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackProvider, setFallbackProvider] = useState<LLMProvider | null>(null);
  const [outputName, setOutputName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const [apiKey, setApiKey] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Chat refinement state
  const [refinementMessages, setRefinementMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [refinementInput, setRefinementInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Customizer state
  const [showCustomizer, setShowCustomizer] = useState(false);

  // Prompt picker state
  const [showPromptPicker, setShowPromptPicker] = useState(false);

  // Panel resize state
  const [leftPanelWidth, setLeftPanelWidth] = useState(50); // percentage

  // Add document state
  const [showAddDocPanel, setShowAddDocPanel] = useState(false);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [newDocUrl, setNewDocUrl] = useState('');

  const handlePanelResize = (deltaX: number) => {
    const containerWidth = window.innerWidth - 260; // Subtract sidebar width
    const deltaPercent = (deltaX / containerWidth) * 100;
    setLeftPanelWidth(prev => Math.max(30, Math.min(70, prev + deltaPercent)));
  };

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const key = await settingsAPI.getDecryptedKeyForProvider(selectedProvider);
        if (key) {
          setApiKey(key);
        }
        const settings = await settingsAPI.get();
        if (settings.default_provider) {
          setSelectedProvider(settings.default_provider as LLMProvider);
        }
      } catch (err) {
        console.error('Failed to load API key:', err);
      }
    };

    loadApiKey();
  }, []);

  useEffect(() => {
    const updateKey = async () => {
      if (selectedProvider === 'ollama') {
        setApiKey('');
        return;
      }
      try {
        const key = await settingsAPI.getDecryptedKeyForProvider(selectedProvider);
        setApiKey(key || '');
      } catch {
        setApiKey('');
      }
    };
    updateKey();
  }, [selectedProvider]);

  useEffect(() => {
    const loadFramework = async () => {
      const fw = await getFramework(frameworkId);
      setFramework(fw || null);
      if (fw) {
        setOutputName(`${fw.name} - ${new Date().toLocaleDateString()}`);
      }
    };

    const loadDocs = async () => {
      try {
        const docs = await contextDocumentsAPI.list(projectId);
        setAvailableDocs(docs);
        setSelectedDocIds(docs.filter(d => d.is_global).map(d => d.id));
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
    };

    loadFramework();
    loadDocs();
  }, [projectId, frameworkId]);

  // Restore cached state on mount
  useEffect(() => {
    const cached = getFrameworkState(projectId, frameworkId);
    if (cached) {
      if (cached.generatedContent) setGeneratedContent(cached.generatedContent);
      if (cached.userPrompt) setUserPrompt(cached.userPrompt);
      if (cached.selectedDocIds?.length) setSelectedDocIds(cached.selectedDocIds);
      if (cached.outputName) setOutputName(cached.outputName);
      if (cached.selectedProvider) setSelectedProvider(cached.selectedProvider as LLMProvider);
      if (cached.selectedModel) setSelectedModel(cached.selectedModel);
      if (cached.refinementMessages?.length) setRefinementMessages(cached.refinementMessages);
    }
  }, [projectId, frameworkId]);

  // Save state to store on unmount or when key values change
  const saveToStore = useCallback(() => {
    if (!frameworkId) return;
    setFrameworkState(projectId, frameworkId, {
      frameworkId,
      generatedContent,
      userPrompt,
      selectedDocIds,
      outputName,
      selectedProvider,
      selectedModel,
      refinementMessages,
    });
  }, [projectId, frameworkId, generatedContent, userPrompt, selectedDocIds, outputName, selectedProvider, selectedModel, refinementMessages]);

  useEffect(() => {
    return () => { saveToStore(); };
  }, [saveToStore]);

  // Autoscroll as content generates
  useEffect(() => {
    if (isGenerating && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [generatedContent, isGenerating]);

  const handleGenerate = async () => {
    if (!framework) return;

    console.log('🎯 Generate button clicked', {
      framework: framework.name,
      model: selectedModel,
      documentsSelected: selectedDocIds.length,
      hasApiKey: !!apiKey,
      hasPrompt: !!userPrompt
    });

    setIsGenerating(true);
    setError(null);
    setFallbackProvider(null);
    setGeneratedContent('');

    try {
      if (!apiKey) {
        throw new Error('❌ API key not configured. Please go to Settings and add your OpenAI API key.');
      }

      console.log('✅ API key found');

      // Fetch full document content for selected docs
      const selectedDocs = await Promise.all(
        selectedDocIds.map(id => contextDocumentsAPI.get(id))
      );
      const docs = selectedDocs.filter((d): d is ContextDocument => d !== null);

      // Add file content if provided
      if (newDocFile) {
        try {
          console.log('📎 Reading uploaded file:', newDocFile.name);
          const fileContent = await newDocFile.text();
          docs.push({
            id: 'temp-file',
            project_id: projectId,
            name: newDocFile.name,
            type: 'text',
            content: fileContent,
            size_bytes: newDocFile.size,
            created_at: Date.now() / 1000,
            is_global: false,
            folder_id: null,
            tags: '[]',
            is_favorite: false,
            sort_order: 0,
          });
          console.log('✅ File added to context');
        } catch (err) {
          console.error('❌ Failed to read file:', err);
          setError('Failed to read uploaded file');
          setIsGenerating(false);
          return;
        }
      }

      // Fetch URL content if provided
      if (newDocUrl.trim()) {
        try {
          console.log('🔗 Fetching URL:', newDocUrl.trim());
          const response = await fetch('http://127.0.0.1:8001/fetch-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: newDocUrl.trim() }),
          });
          if (response.ok) {
            const data = await response.json();
            docs.push({
              id: 'temp-url',
              project_id: projectId,
              name: newDocUrl.trim(),
              type: 'url',
              content: data.content,
              size_bytes: data.content.length,
              created_at: Date.now() / 1000,
              is_global: false,
              folder_id: null,
              tags: '[]',
              is_favorite: false,
              sort_order: 0,
            });
            console.log('✅ URL content added to context');
          } else {
            console.error('❌ Failed to fetch URL');
            setError('Failed to fetch URL content');
            setIsGenerating(false);
            return;
          }
        } catch (err) {
          console.error('❌ Failed to fetch URL:', err);
          setError('Failed to fetch URL content');
          setIsGenerating(false);
          return;
        }
      }

      console.log(`📚 Loaded ${docs.length} documents for context (including temporary uploads)`);

      const prompt = userPrompt || `Generate a ${framework.name} based on the context provided.`;
      console.log('📝 Using prompt:', prompt.substring(0, 100) + '...');

      // Call STREAMING endpoint
      const url = 'http://127.0.0.1:8001/generate-framework/stream';
      console.log('🌐 Calling streaming endpoint:', url);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            project_id: projectId,
            framework_id: frameworkId,
            framework_definition: {
              id: framework.id,
              name: framework.name,
              category: framework.category,
              description: framework.description,
              icon: framework.icon,
              system_prompt: framework.system_prompt,
              guiding_questions: framework.guiding_questions,
              example_output: framework.example_output,
              supports_visuals: framework.supports_visuals,
              visual_instructions: framework.visual_instructions || null,
            },
            context_documents: docs.map(d => ({
              id: d.id,
              name: d.name,
              type: d.type,
              content: d.content,
              url: d.url
            })),
            user_prompt: prompt,
            api_key: apiKey,
            model: selectedModel,
            provider: selectedProvider,
            personal_info: await settingsAPI.get().then(s => {
              const parts: string[] = [];
              if (s.name || s.surname) parts.push(`Name: ${[s.name, s.surname].filter(Boolean).join(' ')}`);
              if (s.job_title) parts.push(`Role: ${s.job_title}`);
              if (s.company) parts.push(`Company: ${s.company}`);
              if (s.about_me) parts.push(s.about_me);
              if (s.about_role) parts.push(s.about_role);
              return parts.length > 0 ? parts.join('\n') : undefined;
            }).catch(() => undefined),
            global_context: await settingsAPI.get().then(s => s.global_context || undefined).catch(() => undefined),
          })
        });
      } catch (fetchErr) {
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') throw fetchErr;
        throw new Error('Cannot connect to AI server. The server may still be starting — please wait a few seconds and try again.');
      }

      console.log('📡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('❌ API error response:', errorText);
        let errorMessage = 'Failed to generate framework';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      console.log('📡 Starting to read stream...');

      if (reader) {
        let chunkCount = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('✅ Stream complete. Total chunks:', chunkCount, 'Content length:', streamedContent.length);
            break;
          }

          chunkCount++;
          const chunk = decoder.decode(value);
          console.log(`📦 Chunk ${chunkCount} (${chunk.length} bytes):`, chunk.substring(0, 100));
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              try {
                const event = JSON.parse(data);
                console.log('📨 Event:', event.type, event);

                if (event.type === 'content_block_delta' && event.delta?.text) {
                  streamedContent += event.delta.text;
                  setGeneratedContent(streamedContent);
                  console.log('✍️ Content length now:', streamedContent.length);
                } else if (event.type === 'message_stop') {
                  console.log('✅ Message complete, final length:', streamedContent.length);
                } else if (event.type === 'error') {
                  console.error('❌ Stream error:', event.error);
                  throw new Error(event.error);
                }
              } catch (e) {
                // Ignore JSON parse errors for incomplete chunks
                if (data.trim() && !(e instanceof SyntaxError)) {
                  console.warn('⚠️ Failed to parse event:', data.substring(0, 100), e);
                }
              }
            }
          }
        }
      } else {
        console.error('❌ No reader available from response');
        throw new Error('No reader available from response');
      }

      if (!streamedContent) {
        throw new Error('No content received from stream');
      }

      // Auto-save to outputs library
      try {
        await frameworkOutputsAPI.create(
          projectId,
          frameworkId,
          framework.category,
          outputName || `${framework.name} - ${new Date().toLocaleDateString()}`,
          userPrompt,
          selectedDocIds,
          streamedContent,
          'markdown'
        );
      } catch (saveErr) {
        console.error('Auto-save to outputs failed:', saveErr);
      }

    } catch (err) {
      // Ignore abort errors (user cancelled)
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('⚠️ Generation cancelled by user');
        return;
      }

      console.error('❌ Generation error:', err);
      let errorMessage = err instanceof Error ? err.message : String(err);
      if (!errorMessage || errorMessage === '{}' || errorMessage === '[object Object]') {
        errorMessage = 'Generation failed. Please check your API key is valid. The AI server may still be starting.';
      }
      setError(errorMessage);
      setFallbackProvider(null);

      if (!apiKey && selectedProvider !== 'ollama') {
        alert('Please configure your API key in Settings before generating frameworks.');
      }

      try {
        const providers = await settingsAPI.getAvailableProviders();
        const configured = providers.filter(p => p.configured && p.id !== selectedProvider);
        if (configured.length > 0) {
          setFallbackProvider(configured[0].id);
        }
      } catch { /* ignore */ }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setGeneratedContent('');
      setError(null);
      console.log('🛑 Generation cancelled and cleared');
    }
  };

  const handleRefinement = async () => {
    if (!refinementInput.trim() || !framework) return;

    setIsRefining(true);
    setError(null);

    // Add user message to history
    const userMessage = { role: 'user' as const, content: refinementInput };
    setRefinementMessages(prev => [...prev, userMessage]);
    setRefinementInput('');

    try {
      // Load selected documents
      const docs = await Promise.all(
        selectedDocIds.map(id => contextDocumentsAPI.get(id))
      );
      const validDocs = docs.filter((d): d is ContextDocument => d !== null);

      // Build conversation context
      const messages = [
        { role: 'user', content: `Original request: ${userPrompt || `Generate a ${framework.name}`}` },
        { role: 'assistant', content: generatedContent },
        ...refinementMessages.map(m => ({ role: m.role, content: m.content })),
        userMessage
      ];

      // Add document context if any
      let contextPrompt = '';
      if (validDocs.length > 0) {
        contextPrompt = `\n\nContext Documents:\n${validDocs.map(d => `${d.name}:\n${d.content}`).join('\n\n')}`;
      }

      // Stream refinement
      const url = 'http://127.0.0.1:8001/chat/stream';
      abortControllerRef.current = new AbortController();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          project_id: projectId,
          messages: messages.map(m => ({ role: m.role, content: m.content + (m.role === 'user' && contextPrompt ? contextPrompt : '') })),
          conversation_id: 'refinement-' + Date.now(), // Temporary ID for refinement
          api_key: apiKey,
          model: selectedModel,
          provider: selectedProvider,
          max_tokens: 100000
        })
      });

      console.log('📡 Refinement response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Refinement failed:', response.status, errorText);
        throw new Error(`Failed to get refinement response: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              try {
                const event = JSON.parse(data);
                if (event.type === 'content_block_delta' && event.delta?.text) {
                  assistantResponse += event.delta.text;
                  setGeneratedContent(assistantResponse);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }

      setRefinementMessages(prev => [...prev, { role: 'assistant', content: assistantResponse }]);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('⚠️ Refinement cancelled');
        return;
      }
      console.error('❌ Refinement error:', err);
      setError(err instanceof Error ? err.message : 'Refinement failed');
    } finally {
      setIsRefining(false);
      abortControllerRef.current = null;
    }
  };

  const handleSaveOutput = async () => {
    if (!framework || !generatedContent) return;

    try {
      await frameworkOutputsAPI.create(
        projectId,
        frameworkId,
        framework.category,
        outputName,
        userPrompt,
        selectedDocIds,
        generatedContent,
        'markdown'
      );
      setShowSaveDialog(false);
      if (onSave) onSave();
    } catch (err) {
      console.error('Failed to save output:', err);
      setError('Failed to save output');
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownloadMarkdown = async () => {
    try {
      const defaultFilename = `${outputName || framework?.name || 'framework'}.md`;
      console.log('📥 Opening save dialog for:', defaultFilename);

      const filePath = await save({
        defaultPath: defaultFilename,
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }]
      });

      if (!filePath) {
        console.log('⚠️ Save cancelled by user');
        return;
      }

      await writeTextFile(filePath, generatedContent);
      console.log('✅ File saved successfully to:', filePath);
    } catch (err) {
      console.error('❌ Failed to save file:', err);
    }
  };

  if (!framework) {
    return (
      <div className="flex-1 flex items-center justify-center bg-codex-bg">
        <div className="text-codex-text-secondary">Framework not found</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-codex-bg h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-codex-border bg-codex-surface/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{framework.icon}</span>
            <div>
              <h2 className="text-sm font-semibold text-codex-text-primary">{framework.name}</h2>
              <p className="text-xs text-codex-text-secondary">{framework.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCustomizer(true)}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
            >
              Edit Prompt
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
              >
                ✕ Close
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 items-stretch">
        {/* Left Panel: Context Input */}
        <div
          className="flex-shrink-0 flex flex-col border-r border-codex-border h-full"
          style={{ width: `${leftPanelWidth}%`, overflow: 'visible' }}
        >

          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {/* User Prompt */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-codex-text-secondary">
                  What do you want to generate?
                </label>
                <button
                  onClick={() => setShowPromptPicker(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Use Saved Prompt
                </button>
              </div>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder={`e.g., "Prioritize these 3 features for Q2" or "Create a PRD for dark mode"`}
                className="w-full h-24 px-3 py-2 bg-codex-surface border border-codex-border rounded text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-2 focus:ring-codex-accent resize-none"
              />
            </div>

            {/* Context Documents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-codex-text-secondary">
                  Context Documents ({selectedDocIds.length} selected)
                </label>
                <button
                  onClick={() => setShowAddDocPanel(!showAddDocPanel)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {showAddDocPanel ? '✕ Close' : '+ Add Document'}
                </button>
              </div>

              {/* Add Document Panel */}
              {showAddDocPanel && (
                <div className="mb-3 p-3 bg-codex-surface/50 border border-codex-border rounded space-y-3">
                  <div className="text-[10px] text-codex-text-muted mb-2">
                    Add files or URLs to create new context documents
                  </div>

                  {/* File Upload */}
                  <div>
                    <div className="text-[10px] text-codex-text-secondary mb-1.5 uppercase font-medium">
                      Upload File
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setNewDocFile(file);
                          }
                        }}
                        className="text-xs text-codex-text-secondary file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-codex-surface file:text-codex-text-secondary hover:file:bg-slate-600 file:cursor-pointer"
                      />
                      {newDocFile && (
                        <button
                          onClick={() => setNewDocFile(null)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* URL Input */}
                  <div>
                    <div className="text-[10px] text-codex-text-secondary mb-1.5 uppercase font-medium">
                      Fetch URL
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={newDocUrl}
                        onChange={(e) => setNewDocUrl(e.target.value)}
                        placeholder="https://example.com/document"
                        className="flex-1 px-2 py-1.5 bg-codex-surface border border-codex-surface-hover rounded text-slate-200 text-xs placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                      />
                      {newDocUrl.trim() && (
                        <button
                          onClick={() => setNewDocUrl('')}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-[10px] text-codex-text-muted italic">
                    Note: These will be added as temporary context for this generation only. Save them in Context tab for reuse.
                  </div>
                </div>
              )}

              {availableDocs.length === 0 && !showAddDocPanel ? (
                <div className="text-center py-8 bg-codex-surface/60 border border-codex-border rounded">
                  <div className="text-2xl mb-2">📄</div>
                  <p className="text-xs text-codex-text-secondary mb-3">
                    No context documents yet
                  </p>
                  <button
                    onClick={() => setShowAddDocPanel(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Upload your first document
                  </button>
                </div>
              ) : availableDocs.length > 0 ? (
                <div className="space-y-2">
                  {availableDocs.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex items-start gap-3 p-3 bg-codex-surface/60 border border-codex-border rounded hover:bg-codex-surface-hover cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocIds.includes(doc.id)}
                        onChange={(e) => {
                          console.log('📄 Checkbox clicked for:', doc.name, 'checked:', e.target.checked);
                          if (e.target.checked) {
                            const newIds = [...selectedDocIds, doc.id];
                            console.log('✅ Adding document, new selection:', newIds);
                            setSelectedDocIds(newIds);
                          } else {
                            const newIds = selectedDocIds.filter(id => id !== doc.id);
                            console.log('❌ Removing document, new selection:', newIds);
                            setSelectedDocIds(newIds);
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-codex-text-primary truncate">
                            {doc.name}
                          </span>
                          {doc.is_global && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">
                              Global
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-codex-text-muted">
                          <span className="capitalize">{doc.type}</span>
                          <span>•</span>
                          <span>{(doc.size_bytes / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Guiding Questions */}
            {framework.guiding_questions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-codex-text-secondary mb-2">
                  Guiding Questions
                </label>
                <div className="bg-codex-surface/60 border border-codex-border rounded p-3 space-y-1">
                  {framework.guiding_questions.map((question, idx) => (
                    <div key={idx} className="text-xs text-codex-text-secondary">
                      • {question}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <div className="flex-shrink-0 border-t border-codex-border p-4" style={{ overflow: 'visible', position: 'relative', zIndex: 20 }}>
            {error && (
              <div className="mb-3">
                <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
                  {error}
                </div>
                {fallbackProvider && (
                  <div className="mt-2 px-3 py-2 bg-codex-accent/10 border border-codex-accent/30 rounded flex items-center justify-between">
                    <span className="text-xs text-codex-text-secondary">
                      Try with {fallbackProvider === 'openai' ? 'OpenAI' : fallbackProvider === 'anthropic' ? 'Anthropic' : fallbackProvider === 'google' ? 'Google' : 'Ollama'}?
                    </span>
                    <button
                      onClick={() => {
                        setSelectedProvider(fallbackProvider);
                        const fallbackModels: Record<string, string> = { openai: 'gpt-5', anthropic: 'claude-sonnet-4-5-20250514', google: 'gemini-2.5-pro', ollama: 'llama3' };
                        setSelectedModel(fallbackModels[fallbackProvider] || 'gpt-5');
                        setError(null);
                        setFallbackProvider(null);
                      }}
                      className="px-2 py-1 text-xs bg-codex-accent hover:bg-codex-accent-hover text-white rounded transition-colors"
                    >
                      Switch
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Model Selector */}
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs text-codex-text-secondary font-medium">Model:</label>
              <ModelSelector
                selectedProvider={selectedProvider}
                selectedModel={selectedModel}
                onSelect={(provider, model) => {
                  setSelectedProvider(provider);
                  setSelectedModel(model);
                }}
              />
            </div>

            {isGenerating ? (
              <button
                onClick={handleCancel}
                className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-codex-text-primary text-sm font-medium rounded transition-colors"
              >
                🛑 Stop Generation
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-codex-text-primary text-sm font-medium rounded transition-colors"
              >
                Generate {framework.name}
              </button>
            )}
          </div>
        </div>

        {/* Resizable Divider */}
        <ResizableDivider onResize={handlePanelResize} />

        {/* Right Panel: Output Preview - Scrollable */}
        <div
          className="flex-shrink-0 flex flex-col bg-codex-bg h-full overflow-x-hidden"
          style={{ width: `${100 - leftPanelWidth}%` }}
        >
          {!generatedContent ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-8">
                <div className="text-3xl mb-3">{framework.icon}</div>
                <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
                  {isGenerating ? 'Generating...' : 'Ready to Generate'}
                </h3>
                <p className="text-xs text-codex-text-secondary">
                  {isGenerating
                    ? 'AI is creating your framework output...'
                    : 'Click Generate to create your framework (context documents optional)'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 border-b border-codex-border bg-codex-surface/50 px-6 py-3 flex items-center justify-between">
                <h3 className="text-xs font-medium text-codex-text-secondary">Generated Output</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyToClipboard}
                    className={`px-2 py-1 text-xs transition-colors ${
                      copied
                        ? 'text-green-400'
                        : 'text-codex-text-secondary hover:text-codex-text-primary'
                    }`}
                    title="Copy to clipboard"
                  >
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    className="px-2 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                    title="Download as markdown"
                  >
                    ⬇️ Download
                  </button>
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-codex-text-primary text-xs font-medium rounded transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
                <MarkdownWithMermaid content={generatedContent} />
              </div>

              {/* Refinement Input Bar */}
              {!isGenerating && (
                <div className="flex-shrink-0 border-t border-codex-border p-3 bg-codex-surface/40">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refinementInput}
                      onChange={(e) => setRefinementInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !isRefining && handleRefinement()}
                      placeholder="Refine: ask for changes or clarifications..."
                      disabled={isRefining}
                      className="flex-1 px-3 py-2 bg-codex-surface border border-codex-border rounded text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-2 focus:ring-codex-accent disabled:opacity-50"
                    />
                    <button
                      onClick={handleRefinement}
                      disabled={isRefining || !refinementInput.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-codex-surface disabled:cursor-not-allowed text-codex-text-primary text-sm font-medium rounded transition-colors"
                    >
                      {isRefining ? '...' : 'Refine'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-50">
          <div className="bg-codex-surface border border-codex-border rounded-lg p-6 w-96">
            <h3 className="text-sm font-semibold text-codex-text-primary mb-4">Save Framework Output</h3>
            <input
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="Output name"
              className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded text-codex-text-primary text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-codex-accent"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-4 py-2 bg-codex-surface hover:bg-slate-600 text-codex-text-primary text-sm rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOutput}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-codex-text-primary text-sm font-medium rounded transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomizer && framework && (
        <FrameworkCustomizer
          framework={framework}
          onClose={() => setShowCustomizer(false)}
          onSaved={(updated) => {
            setFramework(updated);
            setShowCustomizer(false);
          }}
        />
      )}

      {showPromptPicker && (
        <PromptPickerModal
          onSelect={(resolvedPrompt, promptId) => {
            setUserPrompt(resolvedPrompt);
            savedPromptsAPI.incrementUsage(promptId);
            setShowPromptPicker(false);
          }}
          onClose={() => setShowPromptPicker(false)}
        />
      )}
    </div>
  );
}
