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

export default function TerminalView({ projectId, cwd, command, sessionId: externalSessionId, onSessionCreated, visible = true }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(externalSessionId || null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
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

    setTimeout(() => fitAddon.fit(), 50);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const initPty = async () => {
      try {
        const cols = term.cols;
        const rows = term.rows;
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
        setTimeout(() => term.focus(), 150);
      } catch (err) {
        term.writeln(`\x1b[31mFailed to create terminal session: ${err}\x1b[0m`);
      }
    };

    initPty();

    term.onData((data) => {
      if (sessionIdRef.current) {
        ptyAPI.write(sessionIdRef.current, data).catch(() => {});
      }
    });

    // Focus terminal on click anywhere in the container
    const handleClick = () => term.focus();
    terminalRef.current.addEventListener('click', handleClick);

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

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    const containerEl = terminalRef.current;
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      containerEl?.removeEventListener('click', handleClick);
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      if (sessionIdRef.current && !externalSessionId) {
        ptyAPI.close(sessionIdRef.current).catch(() => {});
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
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
