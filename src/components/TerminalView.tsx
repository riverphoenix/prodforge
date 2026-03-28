import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { ptyAPI } from '../lib/ipc';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

interface TerminalViewProps {
  projectId: string | null;
  cwd?: string;
  command?: string;
  sessionId?: string;
  onSessionCreated?: (sessionId: string) => void;
  visible?: boolean;
}

/**
 * Convert a DOM KeyboardEvent to the terminal escape sequence / character string.
 *
 * This is the fallback input path used when xterm's hidden textarea does not
 * receive keyboard focus in production WKWebView builds (Safari/Tauri on macOS
 * refuses to programmatically focus off-screen / opacity:0 elements).
 */
function keyEventToTermData(e: KeyboardEvent): string | null {
  const { key, ctrlKey, altKey, shiftKey, metaKey } = e;

  // Never intercept browser/OS-level shortcuts (Cmd on Mac)
  if (metaKey) return null;

  // Ctrl combinations
  if (ctrlKey && !altKey) {
    const lower = key.toLowerCase();
    if (lower.length === 1 && lower >= 'a' && lower <= 'z') {
      return String.fromCharCode(lower.charCodeAt(0) - 96); // Ctrl+A=\x01 … Ctrl+Z=\x1a
    }
    if (key === ' ' || key === '@') return '\x00';
    if (key === '[') return '\x1b';
    if (key === '\\') return '\x1c';
    if (key === ']') return '\x1d';
    if (key === '^') return '\x1e';
    if (key === '_') return '\x1f';
    if (key === 'ArrowRight') return '\x1b[1;5C';
    if (key === 'ArrowLeft')  return '\x1b[1;5D';
    if (key === 'ArrowUp')    return '\x1b[1;5A';
    if (key === 'ArrowDown')  return '\x1b[1;5B';
    return null; // leave other Ctrl-combos to the browser
  }

  // Alt combinations
  if (altKey && !ctrlKey) {
    if (key.length === 1)     return '\x1b' + key;
    if (key === 'Backspace')  return '\x1b\x7f';
    if (key === 'Delete')     return '\x1b[3;3~';
    if (key === 'ArrowLeft')  return '\x1b[1;3D';
    if (key === 'ArrowRight') return '\x1b[1;3C';
    if (key === 'ArrowUp')    return '\x1b[1;3A';
    if (key === 'ArrowDown')  return '\x1b[1;3B';
  }

  // Special keys
  switch (key) {
    case 'Enter':     return '\r';
    case 'Backspace': return '\x7f';
    case 'Tab':       return shiftKey ? '\x1b[Z' : '\t';
    case 'Escape':    return '\x1b';
    case 'Delete':    return '\x1b[3~';
    case 'ArrowUp':   return '\x1b[A';
    case 'ArrowDown': return '\x1b[B';
    case 'ArrowRight':return '\x1b[C';
    case 'ArrowLeft': return '\x1b[D';
    case 'Home':      return '\x1b[H';
    case 'End':       return '\x1b[F';
    case 'PageUp':    return '\x1b[5~';
    case 'PageDown':  return '\x1b[6~';
    case 'Insert':    return '\x1b[2~';
    case 'F1':  return '\x1bOP';
    case 'F2':  return '\x1bOQ';
    case 'F3':  return '\x1bOR';
    case 'F4':  return '\x1bOS';
    case 'F5':  return '\x1b[15~';
    case 'F6':  return '\x1b[17~';
    case 'F7':  return '\x1b[18~';
    case 'F8':  return '\x1b[19~';
    case 'F9':  return '\x1b[20~';
    case 'F10': return '\x1b[21~';
    case 'F11': return '\x1b[23~';
    case 'F12': return '\x1b[24~';
  }

  // Printable characters
  if (key.length === 1 && !ctrlKey && !metaKey) return key;

  return null;
}

export default function TerminalView({ projectId, cwd, command, sessionId: externalSessionId, onSessionCreated, visible = true }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(externalSessionId || null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  // Tracks whether the terminal area is the "active" keyboard target.
  // Set true on mousedown inside terminal, false on mousedown elsewhere.
  const terminalActiveRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#aeafad',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        selectionForeground: '#ffffff',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    term.focus();

    requestAnimationFrame(() => {
      fitAddon.fit();
      term.focus();
      setTimeout(() => { fitAddon.fit(); term.focus(); }, 200);
      setTimeout(() => { fitAddon.fit(); term.focus(); }, 600);
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // ── Primary input path (works when xterm's textarea gets focus, e.g. in dev) ──
    term.onData((data) => {
      if (sessionIdRef.current) {
        ptyAPI.write(sessionIdRef.current, data).catch(() => {});
      }
    });

    const initPty = async () => {
      try {
        fitAddon.fit();
        const cols = term.cols || 80;
        const rows = term.rows || 24;
        const workingDir = cwd || undefined;

        const sid = externalSessionId || await ptyAPI.create(cols, rows, workingDir, command);
        sessionIdRef.current = sid;

        if (onSessionCreated && !externalSessionId) {
          onSessionCreated(sid);
        }

        const unlisten = await listen<string>(`pty-output-${sid}`, (event) => {
          term.write(event.payload);
        });
        unlistenRef.current = unlisten;

        setReady(true);
        setTimeout(() => { fitAddon.fit(); term.focus(); }, 150);
      } catch (err) {
        term.writeln(`\x1b[31mFailed to create terminal session: ${err}\x1b[0m`);
      }
    };

    initPty();

    // ── Track whether terminal area is the intended keyboard target ──
    // Use capture phase so xterm's internal stopPropagation can't block this.
    const handleDocMouseDown = (e: MouseEvent) => {
      if (terminalRef.current?.contains(e.target as Node)) {
        terminalActiveRef.current = true;
        term.focus();
      } else {
        terminalActiveRef.current = false;
      }
    };
    document.addEventListener('mousedown', handleDocMouseDown, true);

    // ── Fallback input path (production WKWebView: xterm textarea never gets focus) ──
    // Intercepts keydown at the window level when terminal is active.
    // Skips if xterm's own textarea already has focus (primary path handles it).
    const handleFallbackKeyDown = (e: KeyboardEvent) => {
      if (!terminalActiveRef.current || !sessionIdRef.current) return;

      // If xterm's hidden textarea has focus, onData will handle this — skip.
      if (
        e.target instanceof HTMLTextAreaElement &&
        (e.target as HTMLTextAreaElement).classList.contains('xterm-helper-textarea')
      ) return;

      // Don't intercept when user is in a real app input/textarea
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;

      const data = keyEventToTermData(e);
      if (data !== null) {
        e.preventDefault();
        e.stopPropagation();
        ptyAPI.write(sessionIdRef.current, data).catch(() => {});
      }
    };
    window.addEventListener('keydown', handleFallbackKeyDown, true);

    // ── Paste support for the fallback path ──
    const handlePaste = (e: ClipboardEvent) => {
      if (!terminalActiveRef.current || !sessionIdRef.current) return;
      const text = e.clipboardData?.getData('text');
      if (text) {
        e.preventDefault();
        ptyAPI.write(sessionIdRef.current, text).catch(() => {});
      }
    };
    window.addEventListener('paste', handlePaste, true);

    const handleResize = () => {
      setTimeout(() => {
        fitAddon.fit();
        if (sessionIdRef.current) {
          ptyAPI.resize(sessionIdRef.current, term.cols, term.rows).catch(() => {});
        }
      }, 50);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(() => {
        fitAddon.fit();
        if (sessionIdRef.current) {
          ptyAPI.resize(sessionIdRef.current, term.cols, term.rows).catch(() => {});
        }
      }, 50);
    });
    if (terminalRef.current) resizeObserver.observe(terminalRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleFallbackKeyDown, true);
      window.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('mousedown', handleDocMouseDown, true);
      resizeObserver.disconnect();
      if (unlistenRef.current) unlistenRef.current();
      if (sessionIdRef.current && !externalSessionId) {
        ptyAPI.close(sessionIdRef.current).catch(() => {});
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      terminalActiveRef.current = false;
    };
  }, [projectId, cwd, command, externalSessionId]);

  useEffect(() => {
    if (fitAddonRef.current && ready) {
      setTimeout(() => fitAddonRef.current?.fit(), 100);
    }
  }, [ready]);

  useEffect(() => {
    if (visible && fitAddonRef.current && xtermRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (sessionIdRef.current && xtermRef.current) {
          ptyAPI.resize(sessionIdRef.current, xtermRef.current.cols, xtermRef.current.rows).catch(() => {});
        }
        xtermRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  if (!projectId && !cwd) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--color-codex-bg, #1e1e1e)' }}>
        <span className="text-xs" style={{ color: '#484f58' }}>Select a project to use the terminal</span>
      </div>
    );
  }

  return (
    <div
      ref={terminalRef}
      style={{ position: 'absolute', inset: 0, backgroundColor: 'var(--color-codex-bg, #1e1e1e)', padding: '4px' }}
    />
  );
}
