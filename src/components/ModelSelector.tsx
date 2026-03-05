import { useState, useEffect, useRef, useCallback } from 'react';
import { LLMProvider, ProviderInfo } from '../lib/types';
import { settingsAPI } from '../lib/ipc';

interface ModelSelectorProps {
  selectedProvider: LLMProvider;
  selectedModel: string;
  onSelect: (provider: LLMProvider, model: string) => void;
  compact?: boolean;
}

const PROVIDER_COLORS: Record<LLMProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d4a574',
  google: '#4285f4',
  ollama: '#ffffff',
};

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  ollama: 'Ollama',
};

function getModelLabel(model: string): string {
  const lower = model.toLowerCase();
  if (lower === 'gpt-5') return 'GPT-5';
  if (lower === 'gpt-5-mini') return 'GPT-5 Mini';
  if (lower === 'gpt-5-nano') return 'GPT-5 Nano';
  if (lower.startsWith('gpt-4o-mini')) return 'GPT-4o Mini';
  if (lower.startsWith('gpt-4o')) return 'GPT-4o';
  if (lower.startsWith('gpt-4-turbo')) return 'GPT-4 Turbo';
  if (lower.startsWith('gpt-4')) return 'GPT-4';
  if (lower.startsWith('gpt-3.5')) return 'GPT-3.5 Turbo';
  if (lower.includes('o4-mini')) return 'o4-mini';
  if (lower.includes('o3-mini')) return 'o3-mini';
  if (lower.startsWith('o3')) return 'o3';
  if (lower.includes('o1-mini')) return 'o1-mini';
  if (lower.startsWith('o1')) return 'o1';
  if (lower.includes('claude-opus-4')) return 'Claude Opus 4';
  if (lower.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
  if (lower.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
  if (lower.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
  if (lower.includes('claude-haiku-4')) return 'Claude Haiku 4';
  if (lower.includes('claude-sonnet-3-5')) return 'Claude Sonnet 3.5';
  if (lower.includes('claude-opus-3')) return 'Claude Opus 3';
  if (lower.includes('claude-haiku-3')) return 'Claude Haiku 3';
  if (lower.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (lower.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (lower.includes('gemini-2.0')) return 'Gemini 2.0';
  if (lower.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
  if (lower.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash';
  return model;
}

function ProviderIcon({ provider, size = 14 }: { provider: LLMProvider; size?: number }) {
  const color = PROVIDER_COLORS[provider];

  if (provider === 'openai') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4091-.6765zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0974-2.3616l2.603-1.5019 2.6032 1.5019v3.0039l-2.6032 1.5019-2.603-1.5019z" />
      </svg>
    );
  }

  if (provider === 'anthropic') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm.924 10.68h3.876l-1.938-5-1.938 5z" />
      </svg>
    );
  }

  if (provider === 'google') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 11v2.4h5.76c-.24 1.44-1.8 4.2-5.76 4.2-3.48 0-6.3-2.88-6.3-6.6s2.82-6.6 6.3-6.6c1.98 0 3.3.84 4.08 1.56l2.76-2.64C17.16 1.8 14.76.6 12 .6 5.76.6.6 5.76.6 12s5.16 11.4 11.4 11.4c6.6 0 10.92-4.62 10.92-11.16 0-.72-.12-1.32-.24-1.86H12v-.38z" fill="#4285F4" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export { ProviderIcon, PROVIDER_LABELS, PROVIDER_COLORS, getModelLabel };

export default function ModelSelector({ selectedProvider, selectedModel, onSelect, compact }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [enabledModels, setEnabledModels] = useState<Record<string, string[]>>({});
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    settingsAPI.getAvailableProviders().then(setProviders).catch(() => {});
    loadEnabledModels();
  }, []);

  const loadEnabledModels = async () => {
    try {
      const s = await settingsAPI.get();
      if (s.enabled_models) {
        const parsed = JSON.parse(s.enabled_models);
        setEnabledModels(parsed);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (open) {
      loadEnabledModels();
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleSelect = useCallback((provider: LLMProvider, model: string) => {
    onSelect(provider, model);
    setOpen(false);
  }, [onSelect]);

  const configuredProviders = providers.filter(p => p.configured);

  const getModelsForProvider = (provider: ProviderInfo): string[] => {
    const enabled = enabledModels[provider.id];
    if (enabled && enabled.length > 0) return enabled;
    return provider.models;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setOpenUpward(rect.bottom + 400 > window.innerHeight);
          }
          setOpen(!open);
        }}
        className={`flex items-center gap-1.5 rounded transition-colors ${
          compact
            ? 'px-2 py-1 text-[11px]'
            : 'px-2.5 py-1.5 text-xs'
        }`}
        style={{
          backgroundColor: open ? '#2d2d2d' : '#1e1e1e',
          color: '#999',
          border: '1px solid #333',
        }}
        title={`${PROVIDER_LABELS[selectedProvider]} / ${getModelLabel(selectedModel)}`}
      >
        <ProviderIcon provider={selectedProvider} size={compact ? 12 : 14} />
        <span style={{ color: '#ccc' }}>{getModelLabel(selectedModel)}</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 rounded-md shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#252526',
            border: '1px solid #3c3c3c',
            minWidth: '240px',
            maxHeight: '400px',
            overflowY: 'auto',
            left: 0,
            ...(openUpward ? { bottom: '100%', marginBottom: '4px' } : { top: '100%', marginTop: '4px' }),
          }}
        >
          {configuredProviders.length === 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: '#666' }}>
              No providers configured. Add API keys in Settings.
            </div>
          ) : (
            configuredProviders.map(provider => {
              const models = getModelsForProvider(provider);
              return (
                <div key={provider.id}>
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium"
                    style={{ color: '#888', borderBottom: '1px solid #333' }}
                  >
                    <ProviderIcon provider={provider.id as LLMProvider} size={12} />
                    {provider.name}
                  </div>
                  {models.map(model => (
                    <button
                      key={model}
                      onClick={() => handleSelect(provider.id as LLMProvider, model)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                      style={{
                        color: selectedProvider === provider.id && selectedModel === model ? '#fff' : '#ccc',
                        backgroundColor: selectedProvider === provider.id && selectedModel === model ? '#094771' : 'transparent',
                      }}
                      onMouseEnter={e => {
                        if (!(selectedProvider === provider.id && selectedModel === model)) {
                          (e.target as HTMLElement).style.backgroundColor = '#2a2d2e';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!(selectedProvider === provider.id && selectedModel === model)) {
                          (e.target as HTMLElement).style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <span className="w-3 text-center">
                        {selectedProvider === provider.id && selectedModel === model ? '\u2713' : ''}
                      </span>
                      {getModelLabel(model)}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
