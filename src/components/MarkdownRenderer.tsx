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
          // Strip the default <pre> wrapper — let the code component handle everything
          pre({ children }) {
            return <>{children}</>;
          },

          code({ className, children }) {
            const language = /language-(\w+)/.exec(className || '')?.[1];
            const text = String(children).replace(/\n$/, '');
            const isBlock = text.includes('\n') || !!language;

            if (isBlock && language) {
              return (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: '0.75rem 0',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(99,110,123,0.3)',
                    fontSize: '0.8125rem',
                    lineHeight: '1.55',
                    padding: '1rem',
                  }}
                  codeTagProps={{ style: { fontFamily: "Menlo, Monaco, 'Courier New', monospace" } }}
                >
                  {text}
                </SyntaxHighlighter>
              );
            }

            if (isBlock) {
              return (
                <div
                  style={{
                    margin: '0.75rem 0',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(99,110,123,0.3)',
                    backgroundColor: '#1e1e1e',
                    padding: '1rem',
                    overflow: 'auto',
                  }}
                >
                  <code
                    style={{
                      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                      fontSize: '0.8125rem',
                      lineHeight: '1.55',
                      color: '#d4d4d4',
                    }}
                  >
                    {text}
                  </code>
                </div>
              );
            }

            return (
              <code
                style={{
                  padding: '0.15rem 0.4rem',
                  borderRadius: '0.25rem',
                  backgroundColor: '#1e1e1e',
                  color: '#ce9178',
                  fontSize: '0.8125rem',
                  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                  border: '1px solid rgba(99,110,123,0.3)',
                }}
              >
                {children}
              </code>
            );
          },

          p({ children }) {
            return <p style={{ marginBottom: '0.75rem', lineHeight: '1.65', color: '#cccccc' }}>{children}</p>;
          },

          h1({ children }) {
            return (
              <h1 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#e6edf3',
                marginTop: '1.5rem',
                marginBottom: '0.75rem',
                paddingBottom: '0.4rem',
                borderBottom: '1px solid #30363d',
              }}>
                {children}
              </h1>
            );
          },

          h2({ children }) {
            return (
              <h2 style={{
                fontSize: '1.05rem',
                fontWeight: 600,
                color: '#79c0ff',
                marginTop: '1.25rem',
                marginBottom: '0.5rem',
                paddingLeft: '0.6rem',
                borderLeft: '3px solid #388bfd',
              }}>
                {children}
              </h2>
            );
          },

          h3({ children }) {
            return (
              <h3 style={{
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: '#d2a8ff',
                marginTop: '1rem',
                marginBottom: '0.4rem',
              }}>
                {children}
              </h3>
            );
          },

          h4({ children }) {
            return (
              <h4 style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#ffa657',
                marginTop: '0.75rem',
                marginBottom: '0.35rem',
              }}>
                {children}
              </h4>
            );
          },

          ul({ children }) {
            return (
              <ul style={{
                marginBottom: '0.75rem',
                paddingLeft: '1.25rem',
                listStyleType: 'disc',
              }}>
                {children}
              </ul>
            );
          },

          ol({ children }) {
            return (
              <ol style={{
                marginBottom: '0.75rem',
                paddingLeft: '1.25rem',
                listStyleType: 'decimal',
              }}>
                {children}
              </ol>
            );
          },

          li({ children }) {
            return (
              <li style={{
                display: 'list-item',
                lineHeight: '1.65',
                marginBottom: '0.2rem',
                color: '#cccccc',
              }}>
                {children}
              </li>
            );
          },

          blockquote({ children }) {
            return (
              <blockquote style={{
                margin: '0.75rem 0',
                padding: '0.5rem 1rem',
                borderLeft: '3px solid #388bfd',
                backgroundColor: 'rgba(56,139,253,0.08)',
                borderRadius: '0 0.35rem 0.35rem 0',
                color: '#8b949e',
                fontStyle: 'italic',
              }}>
                {children}
              </blockquote>
            );
          },

          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', margin: '0.75rem 0', borderRadius: '0.5rem', border: '1px solid #30363d' }}>
                <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
                  {children}
                </table>
              </div>
            );
          },

          thead({ children }) {
            return <thead style={{ backgroundColor: '#161b22' }}>{children}</thead>;
          },

          tbody({ children }) {
            return <tbody>{children}</tbody>;
          },

          tr({ children }) {
            return (
              <tr style={{ borderBottom: '1px solid #30363d' }}>
                {children}
              </tr>
            );
          },

          th({ children }) {
            return (
              <th style={{
                padding: '0.5rem 0.75rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#8b949e',
                borderBottom: '1px solid #30363d',
              }}>
                {children}
              </th>
            );
          },

          td({ children }) {
            return (
              <td style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                color: '#cccccc',
                borderBottom: '1px solid #21262d',
              }}>
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
                style={{ color: '#79c0ff', textDecoration: 'underline', textDecorationColor: 'rgba(121,192,255,0.35)' }}
              >
                {children}
              </a>
            );
          },

          strong({ children }) {
            return <strong style={{ fontWeight: 600, color: '#e6edf3' }}>{children}</strong>;
          },

          em({ children }) {
            return <em style={{ fontStyle: 'italic', color: '#8b949e' }}>{children}</em>;
          },

          del({ children }) {
            return <del style={{ textDecoration: 'line-through', color: '#6e7681' }}>{children}</del>;
          },

          hr() {
            return <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #30363d' }} />;
          },

          input({ type, checked }) {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  style={{ marginRight: '0.4rem', accentColor: '#388bfd', verticalAlign: 'middle' }}
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
