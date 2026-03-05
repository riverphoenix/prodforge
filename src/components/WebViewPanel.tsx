import { useState } from 'react';

export interface PinnedApp {
  id: string;
  name: string;
  url: string;
  icon: string;
  enabled: boolean;
}

export const DEFAULT_PINNED_APPS: PinnedApp[] = [
  { id: 'jira', name: 'Jira', url: 'https://jira.atlassian.com', icon: 'J', enabled: false },
  { id: 'notion', name: 'Notion', url: 'https://notion.so', icon: 'N', enabled: false },
  { id: 'figma', name: 'Figma', url: 'https://figma.com', icon: 'F', enabled: false },
  { id: 'linear', name: 'Linear', url: 'https://linear.app', icon: 'L', enabled: false },
  { id: 'confluence', name: 'Confluence', url: 'https://confluence.atlassian.com', icon: 'C', enabled: false },
];

interface WebViewPanelProps {
  app: PinnedApp;
}

export default function WebViewPanel({ app }: WebViewPanelProps) {
  const [url, setUrl] = useState(app.url);
  const [inputUrl, setInputUrl] = useState(app.url);
  const [loading, setLoading] = useState(true);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#0d1117' }}>
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0"
        style={{ height: '30px', borderBottom: '1px solid #21262d', backgroundColor: '#010409' }}
      >
        <span
          className="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold"
          style={{ backgroundColor: '#21262d', color: '#8b949e' }}
        >
          {app.icon}
        </span>
        <span className="text-[11px] font-medium" style={{ color: '#c9d1d9' }}>{app.name}</span>
        <form
          onSubmit={(e) => { e.preventDefault(); setUrl(inputUrl); setLoading(true); }}
          className="flex-1 mx-2"
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="w-full px-2 py-0.5 rounded text-[10px]"
            style={{ backgroundColor: '#0d1117', border: '1px solid #21262d', color: '#c9d1d9' }}
          />
        </form>
        {loading && (
          <div className="w-3 h-3 border-2 border-[#58a6ff30] border-t-[#58a6ff] rounded-full animate-spin" />
        )}
        <button
          onClick={() => { setLoading(true); setUrl(url + ''); }}
          className="p-0.5"
          style={{ color: '#484f58' }}
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          src={url}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          title={app.name}
        />
      </div>
    </div>
  );
}
