// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dci, DciChat, DciProvider, useChat, useDci, useSelection } from '../src/index';

/** What a Next.js App Router page does on the server: render, with no window. */
function Page() {
  const instance = useDci();
  const { nodes } = useSelection();
  const chat = useChat();
  return (
    <main {...dci({ id: 'page', type: 'page' })}>
      {instance ? 'ready' : 'server'} · {nodes.length} selected · {chat.status}
      <DciChat render={(c) => <p>{c.messages.length} messages</p>} />
    </main>
  );
}

describe('server rendering', () => {
  it('renders without a DOM and creates nothing', () => {
    expect(typeof window).toBe('undefined');
    const html = renderToString(
      <DciProvider config={{ endpoint: '/api/dci' }}>
        <Page />
      </DciProvider>,
    );
    const text = html.replace(/<!-- -->/g, '');
    expect(text).toContain('server · 0 selected · idle');
    expect(text).toContain('0 messages');
    expect(html).toContain(
      'data-dci="{&quot;id&quot;:&quot;page&quot;,&quot;type&quot;:&quot;page&quot;}"',
    );
  });
});
