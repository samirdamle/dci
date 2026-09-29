import type { DciAncestor, DciContextNode } from '@dci/protocol';

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

function xml(context: DciContextNode[]): string {
  const nodes = context.map((node, i) => {
    const attrs = [
      `index="${i + 1}"`,
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
    const open = `  <node ${attrs.join(' ')}`;
    return children.length
      ? [`${open}>`, ...children.map((c) => `    ${c}`), '  </node>'].join('\n')
      : `${open} />`;
  });
  return ['<selected_context>', ...nodes, '</selected_context>'].join('\n');
}

function markdown(context: DciContextNode[]): string {
  const items = context.map((node, i) => {
    const meta = [node.type, node.id && `id \`${node.id}\``].filter(Boolean).join(', ');
    const lines = [`${i + 1}. **${nodeName(node)}**${meta ? ` (${meta})` : ''}`];
    if (node.ancestors?.length) lines.push(`   - Path: ${path(node)}`);
    if (hasData(node.data)) lines.push(`   - Data: \`${JSON.stringify(node.data)}\``);
    if (node.fallback) lines.push(`   - Element: \`${JSON.stringify(node.fallback)}\``);
    return lines.join('\n');
  });
  return ['## Selected context', '', ...items].join('\n');
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
