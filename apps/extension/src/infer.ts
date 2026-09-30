import type { InferAnnotation } from '@samirdamle/dci-core';

/**
 * Structure for pages that have no DCI annotations: turns the parts people
 * point at (table rows, list items, articles, headings, links, buttons,
 * images, form fields and page regions) into DCI nodes, without touching the
 * page. Alt+Click on a table cell then selects its row, with one field per
 * column, and Alt+Double-click selects every row.
 *
 * Runs for many elements during hover and window select, so each rule bails
 * out on the tag name first. Everything else falls back to DCI's fallback.
 */
export const inferAnnotation: InferAnnotation = (el) => {
  switch (el.tagName) {
    case 'TR':
      return tableRow(el as HTMLTableRowElement);
    case 'TABLE':
      return region('table', caption(el as HTMLTableElement));
    case 'LI':
      return listItem(el);
    case 'ARTICLE':
      return article(el);
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return heading(el);
    case 'A':
      return link(el as HTMLAnchorElement);
    case 'BUTTON':
      return named(el, 'button');
    case 'IMG':
      return image(el as HTMLImageElement);
    case 'INPUT':
    case 'SELECT':
    case 'TEXTAREA':
      return field(el as HTMLInputElement);
    case 'MAIN':
    case 'NAV':
    case 'ASIDE':
    case 'HEADER':
    case 'FOOTER':
    case 'FORM':
    case 'SECTION':
      return landmark(el);
    default:
      return byRole(el);
  }
};

const MAX_LABEL = 80;
const MAX_VALUE = 300;

/** Elements whose text reads as a separate line (textContent runs them together). */
const BLOCK =
  /^(P|DIV|LI|TD|TH|TR|H[1-6]|BR|DT|DD|SECTION|ARTICLE|HEADER|FOOTER|BLOCKQUOTE|PRE|FIGCAPTION)$/;

const HIDDEN = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/;

/** Visible-ish text, whitespace collapsed and capped; stops reading once it has enough. */
function text(el: Element | null | undefined, max = MAX_VALUE): string {
  if (!el) return '';
  let raw = '';
  const walker = el.ownerDocument.createTreeWalker(
    el,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    // Scripts, styles and hidden templates aren't text people see.
    (node) =>
      node.nodeType === Node.ELEMENT_NODE && HIDDEN.test((node as Element).tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  );
  let node = walker.nextNode();
  for (; node && raw.length <= max * 2; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) raw += node.nodeValue;
    else if (BLOCK.test((node as Element).tagName)) raw += ' ';
  }
  raw = raw.replace(/\s+/g, ' ').trim();
  // `node` is set when the walk stopped early, so there's more text than shown.
  return raw.length > max || node ? `${raw.slice(0, max - 1)}…` : raw;
}

/** The accessible name, roughly: aria-label, aria-labelledby, then text. */
function accessibleName(el: Element, max = MAX_LABEL): string {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria.slice(0, max);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const names = labelledBy
      .split(/\s+/)
      .map((id) => text(el.ownerDocument.getElementById(id), max))
      .filter(Boolean);
    if (names.length) return names.join(' ').slice(0, max);
  }
  return text(el, max);
}

// ── tables ──────────────────────────────────────────────────────────────

const headerCache = new WeakMap<HTMLTableElement, { at: number; headers: string[] }>();

/** Column names: the header row's cells (cached briefly per table). */
function columnHeaders(table: HTMLTableElement): string[] {
  const hit = headerCache.get(table);
  if (hit && performance.now() - hit.at < 1000) return hit.headers;
  const headerRow =
    table.tHead?.querySelector('tr') ??
    [...table.rows].find((r) => r.cells.length && [...r.cells].every((c) => c.tagName === 'TH'));
  const headers = headerRow ? [...headerRow.cells].map((c) => text(c, 40)) : [];
  headerCache.set(table, { at: performance.now(), headers });
  return headers;
}

function tableRow(row: HTMLTableRowElement) {
  const cells = [...row.cells];
  // Header rows are part of the table, not records.
  if (!cells.length || cells.every((c) => c.tagName === 'TH')) return null;
  const table = row.closest('table');
  const headers = table ? columnHeaders(table) : [];
  const fields: Record<string, string> = {};
  cells.forEach((cell, i) => {
    const value = text(cell);
    if (!value) return;
    const name = headers[i] || `column ${i + 1}`;
    fields[name in fields ? `${name} (${i + 1})` : name] = value;
  });
  const label = cells.map((c) => text(c, MAX_LABEL)).find(Boolean) ?? 'row';
  return { type: 'row', label, ...fields };
}

function caption(table: HTMLTableElement): string {
  return text(table.caption, MAX_LABEL) || table.getAttribute('aria-label') || '';
}

// ── lists, articles, headings ───────────────────────────────────────────

function listItem(el: Element) {
  const label = text(el, MAX_LABEL);
  if (!label) return null;
  const content = text(el);
  return content.length > label.length
    ? { type: 'list item', label, text: content }
    : { type: 'list item', label };
}

function article(el: Element) {
  const title = text(el.querySelector('h1, h2, h3, h4, h5, h6'), MAX_LABEL);
  const label = title || accessibleName(el);
  return label ? { type: 'article', label, text: text(el) } : null;
}

function heading(el: Element) {
  const label = text(el, MAX_LABEL);
  return label ? { type: 'heading', label, level: Number(el.tagName[1]) } : null;
}

// ── links, buttons, images, fields ──────────────────────────────────────

function link(el: HTMLAnchorElement) {
  const href = el.getAttribute('href');
  if (!href || href.startsWith('javascript:')) return named(el, 'link');
  const label = accessibleName(el) || el.querySelector('img')?.getAttribute('alt') || href;
  return { type: 'link', label, href: el.href };
}

function named(el: Element, type: string) {
  const label = accessibleName(el);
  return label ? { type, label } : null;
}

function image(el: HTMLImageElement) {
  const alt = el.getAttribute('alt')?.trim();
  if (alt === '') return null; // Decorative.
  const file = el.currentSrc || el.src;
  const label = alt || el.title || file.split('/').pop()?.split('?')[0] || 'image';
  return { type: 'image', label, src: file };
}

function fieldLabel(el: HTMLInputElement): string {
  const byFor = el.id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  return (
    el.getAttribute('aria-label') ||
    text(byFor ?? el.closest('label'), MAX_LABEL) ||
    el.getAttribute('placeholder') ||
    el.name ||
    'field'
  );
}

function field(el: HTMLInputElement) {
  const type = el.type;
  if (type === 'hidden') return null;
  const label = fieldLabel(el);
  // Never read what's typed into a password field.
  if (type === 'password') return { type: 'password field', label };
  if (type === 'checkbox' || type === 'radio') return { type, label, checked: el.checked };
  const value =
    el.tagName === 'SELECT'
      ? text((el as unknown as HTMLSelectElement).selectedOptions[0])
      : el.value;
  return { type: 'field', label, ...(value ? { value: value.slice(0, MAX_VALUE) } : {}) };
}

// ── regions ─────────────────────────────────────────────────────────────

const LANDMARK_TYPE: Record<string, string> = {
  MAIN: 'main content',
  NAV: 'navigation',
  ASIDE: 'sidebar',
  HEADER: 'header',
  FOOTER: 'footer',
  FORM: 'form',
  SECTION: 'section',
};

function landmark(el: Element) {
  const name =
    el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ? accessibleName(el) : '';
  // Unnamed sections and forms are often just layout; keep them transparent.
  if ((el.tagName === 'SECTION' || el.tagName === 'FORM') && !name) return null;
  return region(LANDMARK_TYPE[el.tagName]!, name);
}

function region(type: string, name: string) {
  return name ? { type, label: name } : { type };
}

const ROLE_TYPE: Record<string, string> = {
  listitem: 'list item',
  article: 'article',
  row: 'row',
  button: 'button',
  link: 'link',
  img: 'image',
};

/** ARIA roles on generic elements (e.g. `<div role="row">`). */
function byRole(el: Element) {
  const role = el.getAttribute('role');
  const type = role ? ROLE_TYPE[role] : undefined;
  if (!type) return null;
  const label = accessibleName(el);
  return label ? { type, label } : null;
}
