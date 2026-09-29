import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown, safeUrl } from '../src/chat/ui/markdown';

function html(md: string, options = {}) {
  const div = document.createElement('div');
  div.append(renderMarkdown(md, options));
  return div;
}

describe('renderMarkdown', () => {
  it('renders paragraphs, headings, lists, quotes and rules', () => {
    const div = html(
      '# Title\n\nHello **bold** and *em* and `code`.\nNext line\n\n- a\n- b\n\n1. one\n2. two\n\n> quoted\n\n---',
    );
    expect(div.querySelector('h3')?.textContent).toBe('Title');
    expect(div.querySelector('p strong')?.textContent).toBe('bold');
    expect(div.querySelector('p em')?.textContent).toBe('em');
    expect(div.querySelector('p code')?.textContent).toBe('code');
    expect(div.querySelector('p br')).not.toBeNull();
    expect([...div.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(['a', 'b']);
    expect(div.querySelectorAll('ol li')).toHaveLength(2);
    expect(div.querySelector('blockquote p')?.textContent).toBe('quoted');
    expect(div.querySelector('hr')).not.toBeNull();
  });

  it('renders fenced code with a copy button and a highlight hook', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const highlightCode = vi.fn((code: string) => {
      const span = document.createElement('span');
      span.className = 'hl';
      span.textContent = code;
      return span;
    });
    const div = html('```ts\nconst a = 1 < 2;\n```', { highlightCode });
    expect(highlightCode).toHaveBeenCalledWith('const a = 1 < 2;', 'ts');
    expect(div.querySelector('pre code .hl')?.textContent).toBe('const a = 1 < 2;');
    div.querySelector<HTMLButtonElement>('.copy')!.click();
    expect(writeText).toHaveBeenCalledWith('const a = 1 < 2;');
  });

  it('treats an unterminated fence as code (streaming)', () => {
    expect(html('```\npartial').querySelector('pre')?.textContent).toBe('partial');
  });

  describe('security', () => {
    it('shows raw HTML as text', () => {
      const div = html('<img src=x onerror="alert(1)"> <script>alert(2)</script> <b>x</b>');
      expect(div.querySelector('img, script, b')).toBeNull();
      expect(div.textContent).toContain('<img src=x onerror="alert(1)">');
      expect(div.textContent).toContain('<script>');
    });

    it('drops javascript: and other unsafe links', () => {
      const div = html(
        '[a](javascript:alert(1)) [b](data:text/html,x) [c](//evil.test) [d](vbscript:x)',
      );
      expect(div.querySelector('a')).toBeNull();
      expect(div.textContent).toContain('a');
    });

    it('opens safe links in a new tab without an opener', () => {
      const a = html('[docs](https://example.com/x "t")').querySelector('a');
      // A title in the link target is not supported, so it stays text.
      expect(a).toBeNull();
      const link = html('see [docs](https://example.com/x)').querySelector('a')!;
      expect(link.getAttribute('href')).toBe('https://example.com/x');
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    });

    it('does not interpret markup inside code', () => {
      const div = html('`<img src=x onerror=alert(1)>`');
      expect(div.querySelector('img')).toBeNull();
      expect(div.querySelector('code')?.textContent).toBe('<img src=x onerror=alert(1)>');
    });
  });

  it('safeUrl allows only absolute http(s) and mailto', () => {
    expect(safeUrl('https://a.test')).toBe('https://a.test/');
    expect(safeUrl('mailto:x@a.test')).toBe('mailto:x@a.test');
    expect(safeUrl(' JavaScript:alert(1)')).toBeNull();
    expect(safeUrl('/relative')).toBeNull();
  });
});
