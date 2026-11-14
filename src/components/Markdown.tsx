import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// "compact" is sized for chat bubbles and ticket cards: headings stay small, so a model's
// `# Title` doesn't outshout the screen it's on. "document" is for SPEC.md, read as a page.
const HEADINGS = {
  compact: {
    h1: ({ children }) => <p className="font-semibold">{children}</p>,
    h2: ({ children }) => <p className="font-semibold">{children}</p>,
    h3: ({ children }) => <p className="font-medium">{children}</p>,
  },
  document: {
    h1: ({ children }) => <h1 className="text-xl font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-3 text-base font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-1 font-semibold">{children}</h3>,
  },
} satisfies Record<string, Components>;

const shared: Components = {
  ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-black/5 px-1 font-mono text-[0.9em] dark:bg-white/10">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-black/5 p-3 dark:bg-white/10">{children}</pre>
  ),
};

interface MarkdownProps {
  text: string;
  variant?: keyof typeof HEADINGS;
}

/**
 * Markdown (chat replies, ticket descriptions, SPEC.md), rendered the way GitHub will show
 * it in issues. Raw HTML is dropped, and react-markdown's default URL filter removes unsafe
 * links such as `javascript:`.
 */
export function Markdown({ text, variant = "compact" }: MarkdownProps) {
  return (
    <div className="flex flex-col gap-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ ...shared, ...HEADINGS[variant] }}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
