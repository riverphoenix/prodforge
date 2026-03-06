import Editor, { OnMount } from '@monaco-editor/react';
import { useRef } from 'react';

interface PromptEditorProps {
  value: string;
  onChange?: (value: string) => void;
  height?: string;
  readOnly?: boolean;
  language?: string;
}

export default function PromptEditor({
  value,
  onChange,
  height = '300px',
  readOnly = false,
  language = 'markdown',
}: PromptEditorProps) {
  const editorRef = useRef<any>(null);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    monaco.editor.defineTheme('codex-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a6a6a' },
        { token: 'keyword', foreground: '569cd6' },
        { token: 'string', foreground: 'ce9178' },
        { token: 'number', foreground: 'b5cea8' },
        { token: 'type', foreground: '4ec9b0' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editor.lineHighlightBackground': '#161b22',
        'editor.selectionBackground': '#264f78',
        'editorCursor.foreground': '#8B5CF6',
        'editor.inactiveSelectionBackground': '#264f7840',
        'editorLineNumber.foreground': '#484f58',
        'editorLineNumber.activeForeground': '#858585',
        'editorWidget.background': '#1e1e1e',
        'editorWidget.border': '#3e3e42',
        'input.background': '#2d2d30',
        'input.border': '#3e3e42',
        'input.foreground': '#cccccc',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#3e3e4250',
        'scrollbarSlider.hoverBackground': '#3e3e4280',
        'scrollbarSlider.activeBackground': '#3e3e42a0',
      },
    });

    monaco.editor.setTheme('codex-dark');
  };

  return (
    <div className="rounded-md overflow-hidden border border-codex-border">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(val) => onChange?.(val || '')}
        onMount={handleEditorMount}
        theme="codex-dark"
        options={{
          readOnly,
          wordWrap: 'on',
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          fontSize: 12,
          fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace",
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'line',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          tabSize: 2,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
