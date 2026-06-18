import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '@/lib/utils';

/**
 * Strict sanitize schema. Starts from rehype-sanitize's safe default (which
 * already drops event-handler attributes and `javascript:` URLs) and narrows the
 * element allow-list to standard markdown output. `img`, `script`, `iframe`,
 * `style`, `form`, `object`, and `embed` are absent from the allow-list, so they
 * are stripped. `input` is kept — limited to type/checked/disabled — for
 * display-only GFM task-list checkboxes.
 */
const schema = {
  ...defaultSchema,
  tagNames: [
    'h1', 'h2', 'h3', 'h4',
    'p', 'ul', 'ol', 'li',
    'a', 'code', 'pre', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'del', 'hr', 'br', 'input',
  ],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    input: ['type', 'checked', 'disabled'],
  },
};

interface MarkdownRendererProps {
  /** Raw markdown string to render. */
  content: string;
  /** Optional extra classes on the prose container. */
  className?: string;
}

/**
 * Renders sanitized GitHub-flavored markdown inside a scoped `.jw-prose`
 * container. Returns null for empty/whitespace-only content so the caller owns
 * the empty state.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  if (!content || !content.trim()) {
    return null;
  }

  return (
    <div className={cn('jw-prose', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          // Markdown links open in a new tab; rel hardens against tab-nabbing.
          a({ children, href, title }) {
            return (
              <a href={href} title={title} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
