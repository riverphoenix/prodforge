import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-rendered">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isBlock = node?.position && node.position.start.line !== node.position.end.line;
            if (isBlock && match) {
              return (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: '1rem 0',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(99,110,123,0.3)',
                    fontSize: '0.8125rem',
                    lineHeight: '1.5',
                  }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            if (isBlock) {
              return (
                <pre className="my-4 p-4 rounded-lg bg-[#1e1e1e] border border-codex-border/40 overflow-x-auto">
                  <code className="text-[0.8125rem] font-mono text-slate-200 leading-relaxed" {...props}>
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-[#1e1e1e] text-[#ce9178] text-[0.8125rem] font-mono border border-codex-border/40"
                {...props}
              >
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed text-codex-text-primary">{children}</p>;
          },
          h1({ children }) {
            return (
              <h1 className="text-xl font-bold mb-3 mt-6 first:mt-0 pb-2 border-b border-codex-border"
                style={{ color: '#c9d1d9' }}>
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="text-base font-semibold mb-2 mt-5 first:mt-0 pl-3"
                style={{ color: '#79c0ff', borderLeft: '3px solid #388bfd' }}>
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="text-sm font-semibold mb-2 mt-4 first:mt-0"
                style={{ color: '#d2a8ff' }}>
                {children}
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4 className="text-sm font-medium mb-1.5 mt-3 first:mt-0"
                style={{ color: '#ffa657' }}>
                {children}
              </h4>
            );
          },
          ul({ children }) {
            return (
              <ul className="mb-3 pl-5 space-y-1" style={{ listStyleType: 'disc' }}>
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="mb-3 pl-5 space-y-1" style={{ listStyleType: 'decimal' }}>
                {children}
              </ol>
            );
          },
          li({ children }) {
            return (
              <li className="leading-relaxed text-codex-text-primary pl-1" style={{ display: 'list-item' }}>
                {children}
              </li>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3 py-2 pr-4 pl-4 italic text-codex-text-secondary rounded-r"
                style={{ borderLeft: '3px solid #388bfd', backgroundColor: 'rgba(56,139,253,0.08)' }}>
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4 rounded-lg border border-codex-border">
                <table className="min-w-full">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead style={{ backgroundColor: '#161b22' }}>
                {children}
              </thead>
            );
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-codex-border">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="transition-colors hover:bg-codex-surface/40">{children}</tr>;
          },
          th({ children }) {
            return (
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-b border-codex-border"
                style={{ color: '#8b949e' }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-4 py-2.5 text-sm text-codex-text-primary">
                {children}
              </td>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors"
                style={{ color: '#79c0ff', textDecorationColor: 'rgba(121,192,255,0.4)' }}
              >
                {children}
              </a>
            );
          },
          strong({ children }) {
            return <strong className="font-semibold" style={{ color: '#e6edf3' }}>{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-codex-text-secondary">{children}</em>;
          },
          del({ children }) {
            return <del className="line-through text-codex-text-muted">{children}</del>;
          },
          hr() {
            return <hr className="my-5 border-codex-border" />;
          },
          input({ type, checked }) {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 rounded"
                  style={{ accentColor: '#388bfd' }}
                />
              );
            }
            return null;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
