import { h } from './dom';

export interface MarkdownOptions {
  /** Syntax-highlighting hook for fenced code; return a node to replace the plain text. */
  highlightCode?: (code: string, lang: string) => Node;
  /** Label for the copy button on code blocks. Default `'Copy'`. */
  copyLabel?: string;
  copiedLabel?: string;
}

/** Replaces the default renderer. Must treat `text` as untrusted. */
export type RenderMarkdown = (text: string, options: MarkdownOptions) => Node;

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/** `url` if it is an absolute http(s)/mailto link, otherwise `null`. */
export function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

// `code`, **bold**, __bold__, *em*, _em_, [text](url)
const INLINE =
  /(`+)([^`]|[^`][\s\S]*?[^`])\1|\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__|\*(?=\S)([^*]*?\S)\*|\b_(?=\S)([^_]*?\S)_\b|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Inline markdown to DOM nodes. Text only ever becomes text nodes. */
export function renderInline(text: string): Node[] {
  const out: Node[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index;
    if (index > last) out.push(document.createTextNode(text.slice(last, index)));
    last = index + m[0].length;
    const [, , code, boldA, boldB, emA, emB, linkText, href] = m;
    const bold = boldA ?? boldB;
    const em = emA ?? emB;
    if (code !== undefined) out.push(h('code', {}, code));
    else if (bold !== undefined) out.push(h('strong', {}, ...renderInline(bold)));
    else if (em !== undefined) out.push(h('em', {}, ...renderInline(em)));
    else if (linkText !== undefined && href !== undefined) {
      const url = safeUrl(href);
      out.push(
        url
          ? h(
              'a',
              { href: url, target: '_blank', rel: 'noopener noreferrer' },
              ...renderInline(linkText),
            )
          : document.createTextNode(linkText),
      );
    }
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

function withBreaks(lines: string[]): Node[] {
  return lines.flatMap((line, i) =>
    i === 0 ? renderInline(line) : [h('br'), ...renderInline(line)],
  );
}

function codeBlock(code: string, lang: string, options: MarkdownOptions): HTMLElement {
  const body = options.highlightCode?.(code, lang) ?? document.createTextNode(code);
  const copy = h('button', { type: 'button', class: 'copy' }, options.copyLabel ?? 'Copy');
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(code).then(() => {
      copy.textContent = options.copiedLabel ?? 'Copied';
      setTimeout(() => (copy.textContent = options.copyLabel ?? 'Copy'), 1500);
    });
  });
  return h(
    'div',
    { class: 'code' },
    copy,
    h('pre', {}, h('code', lang ? { 'data-lang': lang } : {}, body)),
  );
}

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/**
 * Small, safe markdown subset for model output: paragraphs, headings,
 * lists, quotes, rules, fenced code and inline code/bold/italic/links.
 * It builds DOM nodes directly (never `innerHTML`), so raw HTML in the
 * input is shown as text, and links are limited to http(s) and mailto.
 * An unterminated fence renders as code, which suits streaming.
 */
export function renderMarkdown(text: string, options: MarkdownOptions = {}): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const isBlockStart = (line: string) =>
    FENCE.test(line) ||
    HEADING.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    RULE.test(line);

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(fence[1] ?? '```'))
        code.push(lines[i++] ?? '');
      i++;
      frag.appendChild(codeBlock(code.join('\n'), fence[2] ?? '', options));
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min((heading[1] ?? '#').length + 2, 6);
      frag.appendChild(h(`h${level}` as 'h3', {}, ...renderInline(heading[2] ?? '')));
      i++;
      continue;
    }
    if (RULE.test(line)) {
      frag.appendChild(h('hr'));
      i++;
      continue;
    }
    const listRe = BULLET.test(line) ? BULLET : ORDERED.test(line) ? ORDERED : null;
    if (listRe) {
      const list = h(listRe === BULLET ? 'ul' : 'ol');
      while (i < lines.length && listRe.test(lines[i] ?? '')) {
        list.appendChild(h('li', {}, ...renderInline(listRe.exec(lines[i] ?? '')?.[1] ?? '')));
        i++;
      }
      frag.appendChild(list);
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? ''))
        quoted.push(QUOTE.exec(lines[i++] ?? '')?.[1] ?? '');
      frag.appendChild(h('blockquote', {}, renderMarkdown(quoted.join('\n'), options)));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() && !isBlockStart(lines[i] ?? ''))
      para.push(lines[i++] ?? '');
    frag.appendChild(h('p', {}, ...withBreaks(para)));
  }
  return frag;
}
