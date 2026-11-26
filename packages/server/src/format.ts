import type { DciAncestor, DciContextNode } from '@samirdamle/dci-protocol';

export type ContextStyle = 'xml' | 'json' | 'markdown';

export interface FormatOptions {
  /** Default `'xml'`: tagged sections, which work well with Claude. */
  style?: ContextStyle;
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

const ancestorName = (a: DciAncestor) =>
  a.private ? '(private)' : (a.label ?? a.id ?? a.type ?? '(unnamed)');

/** Human-readable name of a node: label, id, fallback tag, or type. */
function nodeName(node: DciContextNode): string {
  return (
    node.label ?? node.id ?? (node.fallback ? `<${node.fallback.tagName}>` : node.type) ?? 'node'
  );
}

function path(node: DciContextNode): string {
  return [...(node.ancestors ?? []).map(ancestorName), nodeName(node)].join(' › ');
}

const hasData = (data: Record<string, unknown>) => Object.keys(data).length > 0;

/** Tells the model what markers are, when the selection has them. */
const MARKER_NOTE =
  'Each item has a marker (such as A or 1) shown on the page; the user may refer to an item by its marker, as in "compare A and B".';
const hasMarkers = (context: DciContextNode[]) => context.some((n) => n.marker);

function xml(context: DciContextNode[]): string {
  const nodes = context.map((node, i) => {
    const attrs = [
      `index="${i + 1}"`,
      node.marker && `marker="${escapeAttr(node.marker)}"`,
      node.type && `type="${escapeAttr(node.type)}"`,
      node.id && `id="${escapeAttr(node.id)}"`,
      `source="${node.source}"`,
    ].filter(Boolean);
    const children: string[] = [];
    if (node.label) children.push(`<label>${escapeText(node.label)}</label>`);
    if (node.ancestors?.length) children.push(`<path>${escapeText(path(node))}</path>`);
    if (hasData(node.data)) children.push(`<data>${escapeText(JSON.stringify(node.data))}</data>`);
    if (node.fallback)
      children.push(`<element>${escapeText(JSON.stringify(node.fallback))}</element>`);
    if (node.text) {
      const note = node.text.truncated
        ? ` (excerpt truncated to ${node.text.excerpt.length} characters)`
        : '';
      children.push(`<text>${escapeText(node.text.excerpt)}${note}</text>`);
    }
    const open = `  <node ${attrs.join(' ')}`;
    return children.length
      ? [`${open}>`, ...children.map((c) => `    ${c}`), '  </node>'].join('\n')
      : `${open} />`;
  });
  const note = hasMarkers(context) ? [`  <note>${escapeText(MARKER_NOTE)}</note>`] : [];
  return ['<selected_context>', ...note, ...nodes, '</selected_context>'].join('\n');
}

function markdown(context: DciContextNode[]): string {
  const items = context.map((node, i) => {
    // A text item renders as a quoted block (spec §8.2): the marker, the
    // short excerpt as its label, the ancestor path, then the excerpt itself.
    // The serialized range endpoints are transport detail and never appear.
    if (node.source === 'text' && node.text) {
      const marker = node.marker ? ` ${node.marker}` : '';
      const ancestorPath = (node.ancestors ?? []).map(ancestorName).join(' › ');
      const label = node.label ?? node.text.excerpt;
      const heading = `${i + 1}. Selected text${marker} ("${label}"${ancestorPath ? ` in ${ancestorPath}` : ''}):`;
      const lines = [heading, `   > ${node.text.excerpt}`];
      if (node.text.truncated)
        lines.push(`   (excerpt truncated to ${node.text.excerpt.length} characters)`);
      return lines.join('\n');
    }
    const meta = [node.type, node.id && `id \`${node.id}\``].filter(Boolean).join(', ');
    const marker = node.marker ? `[${node.marker}] ` : '';
    const lines = [`${i + 1}. ${marker}**${nodeName(node)}**${meta ? ` (${meta})` : ''}`];
    if (node.ancestors?.length) lines.push(`   - Path: ${path(node)}`);
    if (hasData(node.data)) lines.push(`   - Data: \`${JSON.stringify(node.data)}\``);
    if (node.fallback) lines.push(`   - Element: \`${JSON.stringify(node.fallback)}\``);
    return lines.join('\n');
  });
  const note = hasMarkers(context) ? [MARKER_NOTE, ''] : [];
  return ['## Selected context', '', ...note, ...items].join('\n');
}

/**
 * Turn selected context into a block for an LLM prompt, using labels, types,
 * ancestor paths and data. Put it next to the user's question.
 */
export function formatContextForPrompt(
  context: DciContextNode[],
  { style = 'xml' }: FormatOptions = {},
): string {
  if (style === 'json') return JSON.stringify(context, null, 2);
  if (style === 'markdown') return markdown(context);
  return xml(context);
}
