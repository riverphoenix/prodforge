import { useState, useRef, useCallback, ReactNode } from 'react';
import { LayoutMode } from '../lib/layoutEngine';

interface SplitViewProps {
  mode: LayoutMode;
  children: ReactNode[];
  sizes: number[];
  onSizesChange: (sizes: number[]) => void;
}

export default function SplitView({ mode, children, sizes, onSizesChange }: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const handleMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(index);

    const container = containerRef.current;
    if (!container) return;

    const isHorizontal = mode === 'split-h' || mode === 'triple' || mode === 'quad';
    const totalSize = isHorizontal ? container.offsetWidth : container.offsetHeight;
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const startSizes = [...sizes];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
      const delta = ((currentPos - startPos) / totalSize) * 100;

      const newSizes = [...startSizes];
      const minSize = 15;

      newSizes[index] = Math.max(minSize, startSizes[index] + delta);
      newSizes[index + 1] = Math.max(minSize, startSizes[index + 1] - delta);

      const total = newSizes.reduce((a, b) => a + b, 0);
      const normalizedSizes = newSizes.map(s => (s / total) * 100);

      onSizesChange(normalizedSizes);
    };

    const handleMouseUp = () => {
      setDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [mode, sizes, onSizesChange]);

  if (mode === 'single' || children.length <= 1) {
    return <div className="flex-1 overflow-hidden">{children[0]}</div>;
  }

  if (mode === 'split-v') {
    return (
      <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden">
        <div style={{ height: `${sizes[0]}%`, minHeight: '100px' }} className="overflow-hidden">
          {children[0]}
        </div>
        <div
          className={`h-[3px] flex-shrink-0 cursor-row-resize hover:bg-[#58a6ff40] transition-colors ${dragging === 0 ? 'bg-[#58a6ff]' : ''}`}
          style={{ backgroundColor: dragging === 0 ? '#58a6ff' : '#21262d' }}
          onMouseDown={handleMouseDown(0)}
        />
        <div style={{ height: `${sizes[1]}%`, minHeight: '100px' }} className="overflow-hidden">
          {children[1]}
        </div>
      </div>
    );
  }

  if (mode === 'split-h') {
    return (
      <div ref={containerRef} className="flex flex-row flex-1 overflow-hidden">
        <div style={{ width: `${sizes[0]}%`, minWidth: '200px' }} className="overflow-hidden">
          {children[0]}
        </div>
        <div
          className={`w-[3px] flex-shrink-0 cursor-col-resize hover:bg-[#58a6ff40] transition-colors ${dragging === 0 ? 'bg-[#58a6ff]' : ''}`}
          style={{ backgroundColor: dragging === 0 ? '#58a6ff' : '#21262d' }}
          onMouseDown={handleMouseDown(0)}
        />
        <div style={{ width: `${sizes[1]}%`, minWidth: '200px' }} className="overflow-hidden">
          {children[1]}
        </div>
      </div>
    );
  }

  if (mode === 'triple') {
    return (
      <div ref={containerRef} className="flex flex-row flex-1 overflow-hidden">
        <div style={{ width: `${sizes[0]}%`, minWidth: '200px' }} className="overflow-hidden">
          {children[0]}
        </div>
        <div
          className="w-[3px] flex-shrink-0 cursor-col-resize hover:bg-[#58a6ff40] transition-colors"
          style={{ backgroundColor: dragging === 0 ? '#58a6ff' : '#21262d' }}
          onMouseDown={handleMouseDown(0)}
        />
        <div style={{ width: `${sizes[1]}%`, minWidth: '150px' }} className="overflow-hidden">
          {children[1]}
        </div>
        <div
          className="w-[3px] flex-shrink-0 cursor-col-resize hover:bg-[#58a6ff40] transition-colors"
          style={{ backgroundColor: dragging === 1 ? '#58a6ff' : '#21262d' }}
          onMouseDown={handleMouseDown(1)}
        />
        <div style={{ width: `${sizes[2]}%`, minWidth: '150px' }} className="overflow-hidden">
          {children[2]}
        </div>
      </div>
    );
  }

  if (mode === 'quad') {
    return (
      <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex flex-row flex-1 min-h-0" style={{ height: '50%' }}>
          <div style={{ width: `${sizes[0]}%`, minWidth: '200px' }} className="overflow-hidden">
            {children[0]}
          </div>
          <div
            className="w-[3px] flex-shrink-0 cursor-col-resize hover:bg-[#58a6ff40] transition-colors"
            style={{ backgroundColor: dragging === 0 ? '#58a6ff' : '#21262d' }}
            onMouseDown={handleMouseDown(0)}
          />
          <div style={{ width: `${sizes[1]}%`, minWidth: '200px' }} className="overflow-hidden">
            {children[1]}
          </div>
        </div>
        <div
          className="h-[3px] flex-shrink-0 cursor-row-resize hover:bg-[#58a6ff40] transition-colors"
          style={{ backgroundColor: '#21262d' }}
        />
        <div className="flex flex-row flex-1 min-h-0" style={{ height: '50%' }}>
          <div style={{ width: `${sizes[2]}%`, minWidth: '200px' }} className="overflow-hidden">
            {children[2]}
          </div>
          <div
            className="w-[3px] flex-shrink-0 cursor-col-resize hover:bg-[#58a6ff40] transition-colors"
            style={{ backgroundColor: '#21262d' }}
          />
          <div style={{ width: `${sizes[3]}%`, minWidth: '200px' }} className="overflow-hidden">
            {children[3]}
          </div>
        </div>
      </div>
    );
  }

  return <div className="flex-1 overflow-hidden">{children[0]}</div>;
}
