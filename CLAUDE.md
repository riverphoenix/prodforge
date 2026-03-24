# ProdForge Development Guide

## UI Conventions

### Modal/Popup Backdrops
All modal overlays MUST use a fully opaque black backdrop (`bg-black`). Never use translucent/semi-transparent backdrops (`bg-black/60`, `bg-black/50`, etc.) — they make content hard to read against the dark app background.

**Pattern for centered modals:**
```tsx
<div className="fixed inset-0 bg-black flex items-center justify-center z-50" onClick={onClose}>
  <div className="bg-codex-surface border border-codex-border rounded-lg shadow-xl" onClick={e => e.stopPropagation()}>
    {/* content */}
  </div>
</div>
```

**Pattern for side panels:**
```tsx
<div className="fixed inset-0 z-50">
  <div className="absolute inset-0 bg-black" onClick={onClose} />
  <div className="absolute right-0 top-0 bottom-0 w-[600px] bg-codex-sidebar border-l border-codex-border">
    {/* content */}
  </div>
</div>
```

Never use opacity modifiers on backdrop overlays (e.g., `bg-black/60`). Always use plain `bg-black`.

### Markdown Rendering
Always use `<MarkdownRenderer>` for AI-generated content. The component wraps content in a `.markdown-rendered` class that restores list styles stripped by Tailwind's preflight CSS.

### Copy Buttons
Use `<CopyButton text={content} />` for copy-to-clipboard actions. The component handles both `navigator.clipboard` and fallback `execCommand('copy')`.

## Architecture

### Sidecar
- Python FastAPI sidecar runs on port 8001
- Binary mode (PyInstaller) tried first, source mode fallback via `venv/bin/python`
- Watchdog thread auto-restarts crashed sidecar
- SSL: `verify=False` in frozen builds only (trusted first-party APIs)

### Terminal Sessions
- Claude Code tab keeps its terminal session alive when switching tabs
- The claude tab container in ProjectView MUST use `display: 'flex'` (not `'block'`) when active, with `flexDirection: 'column'`, `position: 'relative'`, `minHeight: 0`, `overflow: 'hidden'`
- ClaudeChat non-launched states MUST use `flex: 1` (not `height: 100%`) to fill the flex parent
- ClaudeChat launched state uses `position: absolute; inset: 0` for the terminal — this requires the parent to have `position: relative` and a computed height from flex
- Folder must be selected before launching a Claude session

### MarkdownRenderer
- Uses react-markdown v10 + remark-gfm + react-syntax-highlighter (Prism / vscDarkPlus)
- **CRITICAL**: Do NOT use `node?.position` to detect inline vs block code — unreliable in v10
- **CORRECT pattern**: Override `pre` to `return <>{children}</>`, then in `code` check if `text.includes('\n') || !!language` to detect block code
- Use inline `style={{}}` props for all visual properties (not Tailwind classes) — avoids Tailwind preflight specificity conflicts
- All heading levels use distinct colors: h1 `#e6edf3`, h2 `#79c0ff` + left border, h3 `#d2a8ff`, h4 `#ffa657`
