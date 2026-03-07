import { useState, useRef, useEffect } from 'react';
import TerminalTabs from './TerminalTabs';
import { onError, getBufferedErrors, clearBufferedErrors } from '../lib/errorBus';

interface BottomPanelProps {
  height: number;
  projectId: string | null;
  onClose: () => void;
  initialTab?: PanelTab;
}

type PanelTab = 'terminal' | 'errors' | 'tracing';

export default function BottomPanel({ height, projectId, onClose, initialTab }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab || 'terminal');
  const [errors, setErrors] = useState<string[]>([]);
  const errorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const origError = console.error;
    const origWarn = console.warn;

    console.error = (...args: unknown[]) => {
      origError.apply(console, args);
      const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      if (msg && !msg.includes('React') && !msg.includes('Warning:')) {
        setErrors(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${msg.slice(0, 500)}`]);
      }
    };

    console.warn = (...args: unknown[]) => {
      origWarn.apply(console, args);
      const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      if (msg && !msg.includes('React') && !msg.includes('Warning:')) {
        setErrors(prev => [...prev, `[${new Date().toLocaleTimeString()}] WARN: ${msg.slice(0, 500)}`]);
      }
    };

    const handleUnhandled = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason);
      setErrors(prev => [...prev, `[${new Date().toLocaleTimeString()}] UNHANDLED: ${msg.slice(0, 500)}`]);
    };

    window.addEventListener('unhandledrejection', handleUnhandled);

    return () => {
      console.error = origError;
      console.warn = origWarn;
      window.removeEventListener('unhandledrejection', handleUnhandled);
    };
  }, []);

  useEffect(() => {
    const buffered = getBufferedErrors();
    if (buffered.length > 0) {
      setErrors(prev => [...prev, ...buffered]);
      clearBufferedErrors();
    }
    const unsub = onError((msg) => {
      setErrors(prev => [...prev, msg]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (errorsRef.current && activeTab === 'errors') {
      errorsRef.current.scrollTop = errorsRef.current.scrollHeight;
    }
  }, [errors, activeTab]);

  const tabStyle = (tab: PanelTab) => ({
    color: activeTab === tab ? '#c9d1d9' : '#484f58',
    backgroundColor: activeTab === tab ? '#21262d' : 'transparent',
    fontSize: '11.5px',
  });

  return (
    <div
      style={{ height, flexShrink: 0, backgroundColor: '#0d1117' }}
      className="flex flex-col"
    >
      <div
        className="flex items-center px-3 gap-1 flex-shrink-0"
        style={{
          height: '30px',
          borderBottom: '1px solid #21262d',
          backgroundColor: '#010409',
        }}
      >
        {(['terminal', 'errors', 'tracing'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-2.5 py-1 text-xs rounded transition-all duration-150 hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-[0.96] flex items-center gap-1.5"
            style={tabStyle(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'errors' && errors.length > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: '#f8514930', color: '#f85149', minWidth: '18px', textAlign: 'center' }}
              >
                {errors.length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        {activeTab === 'errors' && errors.length > 0 && (
          <button
            onClick={() => { setErrors([]); clearBufferedErrors(); }}
            className="px-2 py-0.5 text-xs rounded transition-all duration-150 hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-95"
            style={{ color: '#484f58', fontSize: '11px' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c9d1d9')}
            onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
          >
            Clear
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded transition-all duration-150 hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-90"
          style={{ color: '#484f58' }}
          title="Close panel (⌘`)"
          onMouseEnter={e => (e.currentTarget.style.color = '#c9d1d9')}
          onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' ? (
          <TerminalTabs projectId={projectId} />
        ) : activeTab === 'tracing' ? (
          <div className="h-full flex items-center justify-center bg-codex-bg">
            <span style={{ color: '#484f58', fontSize: '12px' }}>Select an agent or team run to view traces</span>
          </div>
        ) : activeTab === 'errors' ? (
          <div
            ref={errorsRef}
            className="h-full overflow-y-auto px-3 py-2"
            style={{
              backgroundColor: '#0d1117',
              fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, monospace",
              fontSize: '12px',
              lineHeight: '1.6',
            }}
          >
            {errors.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <span style={{ color: '#484f58', fontSize: '12px' }}>No errors logged</span>
              </div>
            ) : (
              errors.map((err, i) => {
                const isError = err.includes('ERROR') || err.includes('UNHANDLED');
                const isWarn = err.includes('WARN');
                return (
                  <div
                    key={i}
                    className="py-0.5"
                    style={{
                      color: isError ? '#f85149' : isWarn ? '#e3b341' : '#8b949e',
                      borderLeft: `2px solid ${isError ? '#f8514940' : isWarn ? '#e3b34140' : '#30363d'}`,
                      paddingLeft: '8px',
                      marginBottom: '2px',
                    }}
                  >
                    <pre className="whitespace-pre-wrap" style={{ margin: 0, fontFamily: 'inherit' }}>{err}</pre>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
