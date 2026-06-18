import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';

afterEach(cleanup);

describe('MarkdownRenderer', () => {
  it('renders bold and italic', () => {
    const { container } = render(<MarkdownRenderer content="**bold** and *italic*" />);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('italic');
  });

  it('renders headings, lists, code, blockquotes, and tables', () => {
    const md = [
      '# Heading',
      '',
      '- one',
      '- two',
      '',
      '`inline code`',
      '',
      '> a quote',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
    ].join('\n');
    const { container } = render(<MarkdownRenderer content={md} />);
    expect(container.querySelector('h1')).toHaveTextContent('Heading');
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('code')).toHaveTextContent('inline code');
    expect(container.querySelector('blockquote')).toHaveTextContent('a quote');
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('renders strikethrough (GFM)', () => {
    const { container } = render(<MarkdownRenderer content="~~gone~~" />);
    expect(container.querySelector('del')).toHaveTextContent('gone');
  });

  it('renders links that open in a new tab', () => {
    const { container } = render(<MarkdownRenderer content="[link](https://example.com)" />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a).toHaveAttribute('href', 'https://example.com');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a?.getAttribute('rel') ?? '').toContain('noopener');
    expect(a?.getAttribute('rel') ?? '').toContain('noreferrer');
  });

  it('strips markdown images — no <img> is rendered (sanitizer)', () => {
    const { container } = render(
      <MarkdownRenderer content="![alt](https://example.com/x.png)" />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not render raw HTML <script> or <img> as elements', () => {
    const { container } = render(
      <MarkdownRenderer content={"<script>alert('xss')</script>\n\n<img src=x onerror=alert(1)>"} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('strips iframes, forms, and event-handler attributes', () => {
    const md = [
      '<iframe src="https://evil.example"></iframe>',
      '',
      '<form><input name="x" /></form>',
      '',
      '<a href="#" onclick="alert(1)">click</a>',
    ].join('\n');
    const { container } = render(<MarkdownRenderer content={md} />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
  });

  it('renders GFM task lists as display-only (disabled) checkboxes', () => {
    const { container } = render(<MarkdownRenderer content={'- [ ] todo\n- [x] done'} />);
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    boxes.forEach((b) => expect(b).toBeDisabled());
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('returns null for empty content', () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null for whitespace-only content', () => {
    const { container } = render(<MarkdownRenderer content="   " />);
    expect(container).toBeEmptyDOMElement();
  });
});
