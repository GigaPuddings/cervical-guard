import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-2 mt-0 text-base font-black text-foreground">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-4 first:mt-0 text-sm font-black text-foreground">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-xs font-extrabold text-foreground">{children}</h3>,
        p: ({ children }) => <p className="my-2 leading-5">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        a: ({ children, href }) => (
          <a className="font-bold text-accent underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ children }) => <code className="rounded bg-edge-soft px-1 py-0.5 font-mono text-[9px] text-foreground">{children}</code>,
        blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-accent/45 pl-3 text-subtle">{children}</blockquote>,
        hr: () => <hr className="my-3 border-edge" />
      }}
    >
      {markdown}
    </ReactMarkdown>
  )
}
