import { useState, useRef } from 'react';
import { Section, replaceSection, parseSections } from '../lib/markdown-sections';
import { settingsAPI } from '../lib/ipc';
import { LLMProvider } from '../lib/types';
import ModelSelector from './ModelSelector';

interface SectionRegeneratorProps {
  content: string;
  onContentUpdate: (newContent: string) => void;
}

const SIDECAR_URL = 'http://127.0.0.1:8001';

export default function SectionRegenerator({ content, onContentUpdate }: SectionRegeneratorProps) {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [instruction, setInstruction] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-5');
  const abortRef = useRef<AbortController | null>(null);

  const sections = parseSections(content);

  const handleRegenerate = async () => {
    if (!activeSection || !instruction.trim()) return;
    setIsRegenerating(true);

    try {
      const apiKey = await settingsAPI.getDecryptedKeyForProvider(selectedProvider);
      const settings = await settingsAPI.get();

      const abortController = new AbortController();
      abortRef.current = abortController;

      const response = await fetch(`${SIDECAR_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: `You are editing section '${activeSection.title}' of a document. Return ONLY the updated section content in markdown format. Keep the section header. Do not include any other sections.` },
            { role: 'user', content: `Here is the full document:\n\n${content}\n\n---\n\nPlease update the section "${activeSection.title}" with this instruction: ${instruction}` }
          ],
          model: selectedModel,
          api_key: apiKey || '',
          provider: selectedProvider,
          ollama_url: settings.ollama_base_url || undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let newSectionContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.substring(6));
              if (event.type === 'content_block_delta' && event.delta?.text) {
                newSectionContent += event.delta.text;
              } else if (event.type === 'error') {
                throw new Error(event.error);
              }
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e;
            }
          }
        }
      }

      if (newSectionContent.trim()) {
        const updated = replaceSection(content, activeSection.id, newSectionContent.trim());
        onContentUpdate(updated);
      }

      setActiveSection(null);
      setInstruction('');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Section regeneration failed:', err);
    } finally {
      setIsRegenerating(false);
      abortRef.current = null;
    }
  };

  if (sections.length <= 1 && sections[0]?.title === 'Content') {
    return null;
  }

  return (
    <div className="border-t border-codex-border bg-codex-surface/30">
      {/* Section list */}
      <div className="px-4 py-2 flex items-center gap-1 overflow-x-auto">
        <span className="text-[10px] text-codex-text-muted font-medium mr-1">Sections:</span>
        {sections.map(section => (
          <button
            key={section.id}
            onMouseEnter={() => setHoveredSection(section.id)}
            onMouseLeave={() => setHoveredSection(null)}
            onClick={() => setActiveSection(activeSection?.id === section.id ? null : section)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors ${
              activeSection?.id === section.id
                ? 'bg-codex-accent/20 text-codex-accent border border-codex-accent/30'
                : hoveredSection === section.id
                  ? 'bg-codex-surface text-codex-text-primary'
                  : 'text-codex-text-secondary hover:bg-codex-surface/50'
            }`}
          >
            <span className="truncate max-w-32">{section.title}</span>
            {(hoveredSection === section.id || activeSection?.id === section.id) && (
              <span className="text-[10px]">✨</span>
            )}
          </button>
        ))}
      </div>

      {/* Regeneration prompt */}
      {activeSection && (
        <div className="px-4 pb-3 border-t border-codex-border/50">
          <div className="flex items-center gap-2 mt-2 mb-2">
            <span className="text-[10px] text-codex-text-muted">Regenerating:</span>
            <span className="text-[11px] text-codex-accent font-medium">{activeSection.title}</span>
            <div className="ml-auto">
              <ModelSelector
                selectedProvider={selectedProvider}
                selectedModel={selectedModel}
                onSelect={(p, m) => { setSelectedProvider(p); setSelectedModel(m); }}
                compact
              />
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRegenerate()}
              placeholder="How should this section change?"
              className="flex-1 px-3 py-1.5 bg-codex-bg border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
              disabled={isRegenerating}
            />
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating || !instruction.trim()}
              className="px-3 py-1.5 text-xs bg-codex-accent hover:bg-codex-accent-hover disabled:opacity-50 text-white rounded transition-colors"
            >
              {isRegenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
            <button
              onClick={() => { setActiveSection(null); setInstruction(''); if (abortRef.current) abortRef.current.abort(); }}
              className="px-2 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
