import { useState, useEffect, useRef } from 'react';
import { Message, ChatStreamEvent, Settings, ContextDocument, LLMProvider } from '../lib/types';
import { conversationsAPI, messagesAPI, tokenUsageAPI, contextDocumentsAPI, settingsAPI } from '../lib/ipc';
import MarkdownRenderer from './MarkdownRenderer';
import ModelSelector from './ModelSelector';
import { emitError } from '../lib/errorBus';

interface ChatInterfaceProps {
  projectId: string;
  conversationId?: string;
  apiKey: string;
  settings: Settings;
  initialMessage?: string | null;
  onInitialMessageConsumed?: () => void;
  activeDocumentContext?: { type: string; name: string; content: string } | null;
  initialProvider?: LLMProvider;
  initialModel?: string;
}

interface MessageWithContext extends Message {
  systemPrompt?: string;
  fullContext?: string;
}

export default function ChatInterface({
  projectId,
  conversationId: initialConversationId,
  apiKey,
  settings,
  initialMessage,
  onInitialMessageConsumed,
  activeDocumentContext,
  initialProvider,
  initialModel,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<MessageWithContext[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId
  );
  const [streamingMessage, setStreamingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fallbackProvider, setFallbackProvider] = useState<LLMProvider | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(initialProvider || 'openai');
  const [selectedModel, setSelectedModel] = useState(initialModel || 'gpt-5');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Context attachment state
  const [selectedContextDocs, setSelectedContextDocs] = useState<string[]>([]);
  const [availableDocs, setAvailableDocs] = useState<ContextDocument[]>([]);
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);

  // Update local conversationId when prop changes
  useEffect(() => {
    setConversationId(initialConversationId);
  }, [initialConversationId]);

  // Load messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      loadMessages();
    } else {
      // Clear messages when starting new conversation
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  useEffect(() => {
    if (initialProvider) return;
    const loadDefaultProvider = async () => {
      try {
        const s = await settingsAPI.get();
        if (s.default_provider) {
          setSelectedProvider(s.default_provider as LLMProvider);
        }
      } catch {}
    };
    loadDefaultProvider();
  }, []);

  // Load available context documents
  useEffect(() => {
    const loadContextDocs = async () => {
      try {
        const docs = await contextDocumentsAPI.list(projectId);
        setAvailableDocs(docs);
      } catch (err) {
        console.error('Failed to load context documents:', err);
      }
    };

    loadContextDocs();
  }, [projectId]);

  // Auto-send initial message from welcome page
  const initialMessageSentRef = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current && !loading) {
      initialMessageSentRef.current = true;
      setInput(initialMessage);
      onInitialMessageConsumed?.();
      // Defer send to next tick so input state is set
      setTimeout(() => {
        setInput('');
        // Directly trigger send with the message
        sendMessage(initialMessage);
      }, 100);
    }
  }, [initialMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  };

  const loadMessages = async () => {
    if (!conversationId) return;
    console.log('Loading messages for conversation:', conversationId);
    try {
      const msgs = await messagesAPI.list(conversationId);
      console.log('Loaded messages:', msgs.length);
      setMessages(msgs);
    } catch (error) {
      console.error('Failed to load messages:', error);
      setError('Failed to load conversation messages');
    }
  };

  const generateSystemPrompt = (): string => {
    const parts: string[] = [
      'You are an AI assistant helping a Product Manager with their work.',
    ];

    if (settings.name || settings.surname) {
      const fullName = [settings.name, settings.surname].filter(Boolean).join(' ');
      parts.push(`You are assisting ${fullName}.`);
    }

    if (settings.job_title) {
      parts.push(`They are a ${settings.job_title}.`);
    }

    if (settings.company) {
      parts.push(`They work at ${settings.company}.`);
    }

    if (settings.about_me) {
      parts.push(`\nAbout them:\n${settings.about_me}`);
    }

    if (settings.about_role) {
      parts.push(`\nAbout their role:\n${settings.about_role}`);
    }

    if (activeDocumentContext) {
      parts.push(`\nThe user is currently viewing a ${activeDocumentContext.type} named "${activeDocumentContext.name}". Here is its content for reference:\n\n---\n${activeDocumentContext.content.slice(0, 8000)}\n---\n`);
      parts.push('You can reference this document in your responses when relevant.');
    }

    if (settings.global_context) {
      parts.push(`\n${settings.global_context}`);
    }

    parts.push(
      '\nProvide concise, actionable advice tailored to their role. Use PM frameworks and best practices when relevant.'
    );

    return parts.join(' ');
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || loading) return;

    const userMessage = messageText.trim();
    setLoading(true);
    setStreamingMessage('');
    setError(null);
    setFallbackProvider(null);

    try {
      // Build context from attachments
      const contextParts: string[] = [];
      console.log('📎 Building context from attachments:', {
        selectedDocs: selectedContextDocs.length,
        hasFile: !!fileInput,
        hasUrl: !!urlInput.trim()
      });

      // 1. Get content from selected context documents
      for (const docId of selectedContextDocs) {
        try {
          console.log('📄 Loading context document:', docId);
          const doc = await contextDocumentsAPI.get(docId);
          if (doc) {
            console.log('✅ Loaded document:', doc.name, 'length:', doc.content.length);
            contextParts.push(`=== Context: ${doc.name} ===\n${doc.content}\n`);
          }
        } catch (err) {
          console.error('❌ Failed to load context document:', docId, err);
        }
      }

      // 2. Read file content if provided
      if (fileInput) {
        try {
          console.log('📎 Reading file:', fileInput.name);
          const fileContent = await fileInput.text();
          console.log('✅ File read, length:', fileContent.length);
          contextParts.push(`=== File: ${fileInput.name} ===\n${fileContent}\n`);
        } catch (err) {
          console.error('❌ Failed to read file:', err);
          setError(`Failed to read file: ${fileInput.name}`);
        }
      }

      // 3. Fetch URL content if provided
      if (urlInput.trim()) {
        try {
          console.log('🔗 Fetching URL:', urlInput.trim());
          const response = await fetch('http://127.0.0.1:8001/fetch-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlInput.trim() }),
          });
          if (response.ok) {
            const data = await response.json();
            console.log('✅ URL fetched, content length:', data.content.length);
            contextParts.push(`=== URL: ${urlInput.trim()} ===\n${data.content}\n`);
          } else {
            console.error('❌ Failed to fetch URL, status:', response.status);
            setError('Failed to fetch URL content');
          }
        } catch (err) {
          console.error('❌ Failed to fetch URL:', err);
          setError('Failed to fetch URL content');
        }
      }

      // Combine user message with context
      const fullUserMessage = contextParts.length > 0
        ? `${contextParts.join('\n')}\n=== User Message ===\n${userMessage}`
        : userMessage;

      console.log('💬 Full message prepared, total length:', fullUserMessage.length, 'contexts:', contextParts.length);

      // Create conversation if needed
      let convId = conversationId;
      if (!convId) {
        const conversation = await conversationsAPI.create(
          projectId,
          userMessage.substring(0, 50) + '...',
          selectedModel
        );
        convId = conversation.id;
        setConversationId(convId);
      }

      // Generate system prompt with profile information
      const systemPrompt = generateSystemPrompt();

      // Prepare full context for display
      const fullContext = JSON.stringify({
        system: systemPrompt,
        model: selectedModel,
        max_tokens: 4096,
        conversation_history: messages.length,
        attachments: {
          context_docs: selectedContextDocs.length,
          file: fileInput?.name || null,
          url: urlInput.trim() || null,
        },
      }, null, 2);

      // Add user message to database with context (store original message)
      const userMsg = await messagesAPI.add(convId, 'user', userMessage, 0);
      const userMsgWithContext: MessageWithContext = {
        ...userMsg,
        systemPrompt,
        fullContext,
      };
      setMessages((prev) => [...prev, userMsgWithContext]);

      // Prepare messages for API (include full context in the last message)
      const chatMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: fullUserMessage },
      ];

      // Clear attachments after sending
      setSelectedContextDocs([]);
      setFileInput(null);
      setUrlInput('');
      setShowAttachments(false);

      // Call Python sidecar streaming endpoint
      console.log('Sending request to Python sidecar:', {
        url: 'http://127.0.0.1:8001/chat/stream',
        model: selectedModel,
        messageCount: chatMessages.length,
        hasApiKey: !!apiKey,
      });

      const response = await fetch('http://127.0.0.1:8001/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          messages: chatMessages,
          conversation_id: convId,
          api_key: apiKey,
          model: selectedModel,
          provider: selectedProvider,
          max_tokens: 4096,
          system: systemPrompt,
        }),
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let totalTokens = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let cost = 0;

      console.log('Starting to read stream...');

      if (reader) {
        let chunkCount = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream done. Total chunks:', chunkCount, 'Content length:', assistantContent.length);
            break;
          }

          chunkCount++;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              try {
                const event: ChatStreamEvent = JSON.parse(data);
                console.log('Stream event:', event.type, event);

                if (event.type === 'content_block_delta' && event.delta?.text) {
                  assistantContent += event.delta.text;
                  setStreamingMessage(assistantContent);
                } else if (event.type === 'message_stop' && event.usage) {
                  inputTokens = event.usage.input_tokens;
                  outputTokens = event.usage.output_tokens;
                  totalTokens = inputTokens + outputTokens;
                  cost = event.cost || 0;
                  console.log('Message complete. Tokens:', totalTokens, 'Cost:', cost);
                } else if (event.type === 'error') {
                  console.error('Stream error:', event.error);
                  throw new Error(event.error);
                }
              } catch (e) {
                // Ignore JSON parse errors for incomplete chunks
                if (data.trim()) {
                  console.warn('Failed to parse event:', data.substring(0, 100));
                }
              }
            }
          }
        }
      } else {
        console.error('No reader available from response');
      }

      // Add assistant message to database
      console.log('Saving assistant message. Content length:', assistantContent.length);
      const assistantMsg = await messagesAPI.add(
        convId,
        'assistant',
        assistantContent,
        totalTokens
      );
      console.log('Assistant message saved:', assistantMsg.id);
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingMessage('');

      // Update conversation stats and record token usage
      await Promise.all([
        conversationsAPI.updateStats(convId, totalTokens, cost),
        tokenUsageAPI.record(convId, selectedModel, inputTokens, outputTokens, cost, selectedProvider)
      ]);
      console.log('Conversation stats updated successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
      let errorMessage: string;

      if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Load failed'))) {
        errorMessage = 'Cannot connect to AI server. The server may still be starting — please wait a few seconds and try again.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = 'Failed to connect to AI server. The server may still be starting — please wait a few seconds and try again.';
      }

      if (errorMessage.includes('tokens exceed') || errorMessage.includes('token limit')) {
        errorMessage = 'Context is too large! Try removing some documents or using a shorter message. Consider using GPT-5 instead of GPT-5-nano for larger contexts.';
      }

      setError(errorMessage);
      emitError(errorMessage);
      setFallbackProvider(null);

      try {
        const providers = await settingsAPI.getAvailableProviders();
        const configured = providers.filter(p => p.configured && p.id !== selectedProvider);
        if (configured.length > 0) {
          setFallbackProvider(configured[0].id);
        }
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(msg);
  };

  const togglePromptExpansion = (messageId: string) => {
    setExpandedPrompts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="bg-codex-bg">
        {messages.length === 0 && !streamingMessage && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-2xl px-8">
              <div className="flex justify-center mb-5">
                <svg className="w-12 h-12 text-codex-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-codex-text-primary mb-1">
                Let's build
              </h2>
              <p className="text-sm text-codex-text-secondary">
                Ask questions about your project, apply PM frameworks, or brainstorm ideas.
              </p>
            </div>
          </div>
        )}

        <div className="py-4">
          {messages.map((message) => (
            <div key={message.id} className="w-full">
              <div className="max-w-3xl mx-auto px-6 py-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                      message.role === 'user'
                        ? 'bg-codex-surface text-codex-text-secondary'
                        : 'bg-codex-text-primary text-codex-bg'
                    }`}>
                      {message.role === 'user' ? 'U' : 'AI'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-codex-text-muted mb-1.5">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div className="text-sm text-codex-text-primary leading-relaxed">
                      <MarkdownRenderer content={message.content} />
                    </div>
                    {message.role === 'user' && message.fullContext && (
                      <div className="mt-2">
                        <button
                          onClick={() => togglePromptExpansion(message.id)}
                          className="text-[10px] text-codex-text-muted hover:text-codex-text-secondary transition-colors"
                        >
                          {expandedPrompts.has(message.id) ? '▼ Hide' : '▶ View'} prompt details
                        </button>
                        {expandedPrompts.has(message.id) && (
                          <pre className="text-[10px] text-codex-text-muted mt-2 p-3 bg-codex-surface rounded border border-codex-border overflow-x-auto">
                            {message.fullContext}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Streaming Message */}
          {streamingMessage && (
            <div className="w-full">
              <div className="max-w-3xl mx-auto px-6 py-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold bg-codex-text-primary text-codex-bg">
                      AI
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-codex-text-muted mb-1.5">
                      Assistant
                    </div>
                    <div className="text-sm text-codex-text-primary leading-relaxed">
                      <MarkdownRenderer content={streamingMessage} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && !streamingMessage && (
            <div className="w-full">
              <div className="max-w-3xl mx-auto px-6 py-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold bg-codex-accent text-white animate-pulse">
                      AI
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-codex-text-muted mb-1.5">
                      Assistant
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-codex-accent rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
                        <div className="w-2 h-2 bg-codex-accent rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></div>
                        <div className="w-2 h-2 bg-codex-accent rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></div>
                      </div>
                      <span className="text-xs text-codex-text-muted animate-pulse">Thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="w-full">
              <div className="max-w-3xl mx-auto px-6 py-4">
                <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                  <div className="text-xs font-medium text-red-400 mb-1">Error</div>
                  <div className="text-sm text-red-300">{error}</div>
                  <button
                    onClick={() => { setError(null); setFallbackProvider(null); }}
                    className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                  >
                    Dismiss
                  </button>
                </div>
                {fallbackProvider && (
                  <div className="mt-2 p-3 bg-codex-accent/10 border border-codex-accent/30 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-codex-text-secondary">
                      Try with {fallbackProvider === 'openai' ? 'OpenAI' : fallbackProvider === 'anthropic' ? 'Anthropic' : fallbackProvider === 'google' ? 'Google' : 'Ollama'}?
                    </span>
                    <button
                      onClick={() => {
                        const fallbackModels: Record<string, string> = { openai: 'gpt-5', anthropic: 'claude-sonnet-4-5-20250514', google: 'gemini-2.5-pro', ollama: 'llama3' };
                        setSelectedProvider(fallbackProvider);
                        setSelectedModel(fallbackModels[fallbackProvider] || 'gpt-5');
                        setError(null);
                        setFallbackProvider(null);
                      }}
                      className="px-3 py-1.5 text-xs bg-codex-accent hover:bg-codex-accent-hover text-white rounded transition-colors"
                    >
                      Switch Provider
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ flexShrink: 0 }} className="bg-codex-bg px-6 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* Attachments Panel */}
          {showAttachments && (
            <div className="mb-3 p-3 bg-codex-surface border border-codex-border rounded-lg space-y-3">
              {availableDocs.length > 0 && (
                <div>
                  <div className="text-[10px] text-codex-text-muted mb-2 uppercase font-medium">Context Documents</div>
                  <div className="flex flex-wrap gap-2">
                    {availableDocs.map(doc => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          if (selectedContextDocs.includes(doc.id)) {
                            setSelectedContextDocs(prev => prev.filter(id => id !== doc.id));
                          } else {
                            setSelectedContextDocs(prev => [...prev, doc.id]);
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          selectedContextDocs.includes(doc.id)
                            ? 'bg-codex-accent text-white'
                            : 'bg-codex-bg text-codex-text-secondary hover:bg-codex-surface-hover'
                        }`}
                      >
                        {doc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[10px] text-codex-text-muted mb-2 uppercase font-medium">Upload File</div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setFileInput(file);
                    }}
                    className="text-xs text-codex-text-secondary file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-codex-bg file:text-codex-text-secondary hover:file:bg-codex-surface-hover file:cursor-pointer"
                  />
                  {fileInput && (
                    <button onClick={() => setFileInput(null)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-codex-text-muted mb-2 uppercase font-medium">Fetch URL</div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/document"
                    className="flex-1 px-3 py-1.5 bg-codex-bg border border-codex-border rounded text-codex-text-primary text-xs placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                  {urlInput.trim() && (
                    <button onClick={() => setUrlInput('')} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Selected Attachments Chips */}
          {(selectedContextDocs.length > 0 || fileInput || urlInput.trim()) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedContextDocs.map(docId => {
                const doc = availableDocs.find(d => d.id === docId);
                return doc ? (
                  <span key={docId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-codex-surface border border-codex-border rounded text-[10px] text-codex-text-secondary">
                    {doc.name}
                  </span>
                ) : null;
              })}
              {fileInput && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-codex-surface border border-codex-border rounded text-[10px] text-codex-text-secondary">
                  {fileInput.name}
                </span>
              )}
              {urlInput.trim() && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-codex-surface border border-codex-border rounded text-[10px] text-codex-text-secondary">
                  {urlInput.substring(0, 30)}...
                </span>
              )}
            </div>
          )}

          {/* Input Box */}
          <div className="relative bg-codex-surface border border-codex-border rounded-lg">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything, @ to add context, / for commands"
              disabled={loading}
              className="w-full px-4 py-3 pr-12 bg-transparent text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '200px' }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => setShowAttachments(!showAttachments)}
                className="w-7 h-7 flex items-center justify-center text-codex-text-muted hover:text-codex-text-secondary rounded transition-colors"
                title="Add context"
                disabled={loading}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
              </button>
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="w-7 h-7 flex items-center justify-center bg-codex-text-primary text-codex-bg disabled:bg-codex-surface disabled:text-codex-text-muted disabled:cursor-not-allowed rounded-md transition-colors"
                title="Send message"
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-codex-bg border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Model selector + info row below input */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-3">
              <ModelSelector
                selectedProvider={selectedProvider}
                selectedModel={selectedModel}
                onSelect={(provider, model) => {
                  setSelectedProvider(provider);
                  setSelectedModel(model);
                }}
                compact
              />
            </div>
            <div className="text-[10px] text-codex-text-muted">
              Enter to send
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
