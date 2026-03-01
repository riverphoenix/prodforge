# Scrolling Fix Instructions

## Files that need `overflow-hidden` changed to `min-h-0`:

1. **ProjectView.tsx** - Line 208: `<div className="flex-1 overflow-hidden">` → `<div className="flex-1 min-h-0">`

2. **OutputsLibrary.tsx** - Line 117: `<div className="flex-1 flex flex-col bg-codex-bg overflow-hidden">` → `<div className="flex-1 flex flex-col bg-codex-bg min-h-0">`

3. **FrameworksHome.tsx** - Line 35: `<div className="flex-1 flex flex-col bg-codex-bg overflow-hidden">` → `<div className="flex-1 flex flex-col bg-codex-bg min-h-0">`

4. **ContextManager.tsx** - Line 243: `<div className="flex-1 flex flex-col bg-codex-bg overflow-hidden">` → `<div className="flex-1 flex flex-col bg-codex-bg min-h-0">`

## UI Updates for Codex Style:

### ProjectView.tsx
- Top bar: Reduce height from h-12 to h-10
- Remove project description from top bar
- Tabs: Remove emojis, make more compact (px-2 py-1.5 instead of px-3 py-2)
- Tab height: Change from h-10 to h-8

### FrameworksHome.tsx
- Header: Make more compact with smaller padding (px-4 py-3 instead of px-6 py-4)
- Title: Reduce from text-xl to text-sm
- Stats: Make smaller text ([10px] instead of xs)
- Search bar: Smaller padding (px-3 py-1.5 instead of px-4 py-2)
- Content padding: Reduce from p-6 to p-4

### ContextManager.tsx
- Header: Make more compact (px-4 py-3 instead of px-6 py-4)
- Title: Reduce from text-xl to text-sm
- Button: Smaller (px-3 py-1.5 instead of px-4 py-2)
- Stats: Use text-[10px] instead of text-xs
- Content padding: Reduce from p-6 to p-4
