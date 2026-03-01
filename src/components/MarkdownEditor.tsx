import { useState, useRef, useCallback, useEffect } from 'react';
import { parseSections, Section } from '../lib/markdown-sections';
import MarkdownWithMermaid from './MarkdownWithMermaid';

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSectionClick?: (section: Section) => void;
  readOnly?: boolean;
}

export default function MarkdownEditor({ content, onChange, onSectionClick, readOnly = false }: MarkdownEditorProps) {
  const [mode, setMode] = useState<'preview' | 'edit' | 'split'>('preview');
  const [editContent, setEditContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEditContent(content);
  }, [content]);

  const handleChange = useCallback((value: string) => {
    setEditContent(value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onChange(value);
    }, 500);
  }, [onChange]);

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = editContent.slice(start, end);
    const newText = editContent.slice(0, start) + prefix + selected + suffix + editContent.slice(end);
    setEditContent(newText);
    onChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const sections = parseSections(editContent);

  const handleSectionGutterClick = (section: Section) => {
    if (onSectionClick) {
      onSectionClick(section);
    }
    if (mode === 'edit' || mode === 'split') {
      const textarea = textareaRef.current;
      if (textarea) {
        const lines = editContent.split('\n');
        let pos = 0;
        for (let i = 0; i < section.startLine; i++) {
          pos += lines[i].length + 1;
        }
        textarea.focus();
        textarea.setSelectionRange(pos, pos);
        textarea.scrollTop = (section.startLine / lines.length) * textarea.scrollHeight;
      }
    }
  };

  if (readOnly) {
    return (
      <div className="h-full overflow-y-auto">
        <MarkdownWithMermaid content={content} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-1 border-b border-codex-border bg-codex-surface/50 px-3 py-1.5">
        <div className="flex items-center gap-1 mr-3">
          {(['preview', 'edit', 'split'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                mode === m
                  ? 'bg-codex-accent text-white'
                  : 'text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface'
              }`}
            >
              {m === 'preview' ? 'Preview' : m === 'edit' ? 'Edit' : 'Split'}
            </button>
          ))}
        </div>

        {(mode === 'edit' || mode === 'split') && (
          <div className="flex items-center gap-1 border-l border-codex-border pl-3">
            <button onClick={() => insertMarkdown('**', '**')} className="px-1.5 py-1 text-xs font-bold text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface rounded" title="Bold">B</button>
            <button onClick={() => insertMarkdown('*', '*')} className="px-1.5 py-1 text-xs italic text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface rounded" title="Italic">I</button>
            <button onClick={() => insertMarkdown('## ')} className="px-1.5 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface rounded" title="Heading">H</button>
            <button onClick={() => insertMarkdown('```\n', '\n```')} className="px-1.5 py-1 text-xs font-mono text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface rounded" title="Code block">&lt;/&gt;</button>
            <button onClick={() => insertMarkdown('[', '](url)')} className="px-1.5 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface rounded" title="Link">🔗</button>
            <button onClick={() => insertMarkdown('- ')} className="px-1.5 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface rounded" title="List">•</button>
          </div>
        )}

        {/* Section markers */}
        {sections.length > 1 && (
          <div className="flex items-center gap-1 border-l border-codex-border pl-3 ml-auto overflow-x-auto">
            <span className="text-[10px] text-codex-text-muted mr-1">Sections:</span>
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => handleSectionGutterClick(section)}
                className="px-1.5 py-0.5 text-[10px] text-codex-text-secondary hover:text-codex-text-primary hover:bg-codex-surface rounded truncate max-w-24"
                title={section.title}
              >
                {'#'.repeat(section.level)} {section.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }} className="flex">
        {mode === 'preview' && (
          <div ref={previewRef} className="flex-1 overflow-y-auto p-6">
            <MarkdownWithMermaid content={editContent} />
          </div>
        )}

        {mode === 'edit' && (
          <div className="flex-1 overflow-hidden">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full h-full resize-none p-4 bg-codex-bg text-codex-text-primary text-sm font-mono leading-relaxed focus:outline-none"
              spellCheck={false}
            />
          </div>
        )}

        {mode === 'split' && (
          <>
            <div className="flex-1 overflow-hidden border-r border-codex-border">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => handleChange(e.target.value)}
                className="w-full h-full resize-none p-4 bg-codex-bg text-codex-text-primary text-sm font-mono leading-relaxed focus:outline-none"
                spellCheck={false}
              />
            </div>
            <div ref={previewRef} className="flex-1 overflow-y-auto p-6">
              <MarkdownWithMermaid content={editContent} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
