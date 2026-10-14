import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: '#38bdf8',
                marginTop: '20px',
                marginBottom: '12px',
                borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
                paddingBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#7dd3fc',
                marginTop: '18px',
                marginBottom: '10px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                paddingBottom: '4px',
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: '1.02rem',
                fontWeight: 700,
                color: '#f1f5f9',
                marginTop: '14px',
                marginBottom: '8px',
              }}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p
              style={{
                fontSize: '0.95rem',
                color: '#cbd5e1',
                lineHeight: 1.75,
                marginBottom: '12px',
              }}
            >
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong style={{ color: '#ffffff', fontWeight: 700 }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ color: '#93c5fd', fontStyle: 'italic' }}>{children}</em>
          ),
          ul: ({ children }) => (
            <ul style={{ paddingLeft: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ paddingLeft: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ color: '#cbd5e1', lineHeight: 1.6, fontSize: '0.95rem' }}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: '3px solid #38bdf8',
                paddingLeft: '14px',
                margin: '12px 0',
                color: '#94a3b8',
                background: 'rgba(56, 189, 248, 0.05)',
                borderRadius: '0 8px 8px 0',
                paddingTop: '8px',
                paddingBottom: '8px',
              }}
            >
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#34d399',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.88rem',
                fontFamily: 'monospace',
              }}
            >
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div
              style={{
                overflowX: 'auto',
                margin: '18px 0',
                borderRadius: '10px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                background: 'rgba(15, 23, 42, 0.65)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.88rem',
                  textAlign: 'left',
                }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead
              style={{
                background: 'rgba(30, 41, 59, 0.9)',
                borderBottom: '2px solid rgba(56, 189, 248, 0.35)',
              }}
            >
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr
              style={{
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                transition: 'background-color 0.15s ease',
              }}
            >
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th
              style={{
                padding: '10px 14px',
                color: '#38bdf8',
                fontWeight: 700,
                fontSize: '0.85rem',
                letterSpacing: '0.02em',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: '9px 14px',
                color: '#cbd5e1',
                lineHeight: 1.55,
                verticalAlign: 'top',
              }}
            >
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#38bdf8',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                wordBreak: 'break-all',
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <div style={{ margin: '16px 0', textAlign: 'center' }}>
              <img
                src={src}
                alt={alt || ''}
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  borderRadius: '8px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                }}
              />
              {alt && <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>{alt}</p>}
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
