import { useEffect, useCallback } from 'react';

interface FocusModeProps {
  onExit: () => void;
  children: React.ReactNode;
}

export default function FocusMode({ onExit, children }: FocusModeProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onExit();
    }
  }, [onExit]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: '#0d1117', zIndex: 40 }}
    >
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full shadow-xl"
        style={{ backgroundColor: '#21262d', border: '1px solid #30363d' }}
      >
        <span className="text-[10px]" style={{ color: '#8b949e' }}>Focus Mode</span>
        <div className="w-px h-3" style={{ backgroundColor: '#30363d' }} />
        <button
          onClick={onExit}
          className="text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{ color: '#58a6ff' }}
        >
          ESC to exit
        </button>
      </div>
    </div>
  );
}
