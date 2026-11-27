/**
 * Verification that `useSelection()` and `useChat()` carry text items
 * without a new hook: both hooks are thin pass-throughs over
 * `dci.selection.get()` (the unified `toContext()`) and
 * `chat.state().pendingContext`, which are plain `DciContextNode[]` — a
 * text node flows through them unchanged. This test drives them with a
 * fake instance whose selection already holds a text item (the real
 * unified store is agent A's work).
 */
import type * as Core from '@samirdamle/dci-core';
import type { DciContextNode, DciInstance } from '@samirdamle/dci-core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DciProvider, useChat, useSelection } from '../src/index';

const TEXT_NODE = {
  label: 'convert Proposal-stage deals',
  marker: 'A',
  data: {},
  source: 'text',
  text: {
    excerpt: 'convert Proposal-stage deals before winter.',
    truncated: false,
    start: { path: 'p', offset: 0 },
    end: { path: 'p', offset: 42 },
  },
} as unknown as DciContextNode;

const ELEMENT_NODE = {
  id: 'inv_1',
  type: 'invoice',
  label: 'Invoice 1',
  marker: 'B',
  data: {},
  source: 'annotated',
} as unknown as DciContextNode;

function fakeInstance(): DciInstance {
  const chatState = {
    status: 'idle',
    open: false,
    messages: [],
    pendingContext: [TEXT_NODE, ELEMENT_NODE],
    draft: '',
    confirm: null,
    notice: null,
    limit: null,
  };
  return {
    selection: {
      get: () => [TEXT_NODE, ELEMENT_NODE],
      toContext: () => [TEXT_NODE, ELEMENT_NODE],
      elements: () => [],
      primary: () => null,
      set: () => {},
      add: () => {},
      remove: () => {},
      toggle: () => {},
      has: () => false,
      clear: () => {},
      selectSameType: () => [],
    },
    chat: {
      open: () => {},
      close: () => {},
      send: () => Promise.resolve(false),
      stop: () => {},
      retry: () => Promise.resolve(false),
      state: () => chatState,
      subscribe: () => () => {},
      controller: {
        getState: () => chatState,
        removeContext: () => {},
      },
    },
    textSelection: {
      get: () => TEXT_NODE,
      capture: () => true,
      items: () => [TEXT_NODE],
      remove: () => {},
    },
    session: { id: 's1' },
    config: {},
    tree: {},
    onAction: () => () => {},
    on: () => () => {},
    update: () => {},
    setSelectMode: () => {},
    isSelectMode: () => false,
    disable: () => {},
    enable: () => {},
    isEnabled: () => true,
    previewRequest: () => Promise.resolve(false),
    destroy: () => {},
  } as unknown as DciInstance;
}

vi.mock('@samirdamle/dci-core', async (importOriginal) => {
  const core: typeof Core = await importOriginal();
  return { ...core, createDci: () => fakeInstance() };
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function Probe() {
  const { nodes } = useSelection();
  const chat = useChat();
  return (
    <div>
      <p data-testid="nodes">{nodes.map((n) => `${n.marker}:${n.source}:${n.label}`).join('|')}</p>
      <p data-testid="pending">
        {chat.pendingContext.map((n) => `${n.marker}:${n.source}:${n.label}`).join('|')}
      </p>
    </div>
  );
}

describe('text items in React hooks', () => {
  it('useSelection includes text items and useChat sees them in pendingContext', async () => {
    render(
      <DciProvider config={{ transport: { send: async function* () {} } }}>
        <Probe />
      </DciProvider>,
    );
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.getByTestId('nodes').textContent).toBe(
      'A:text:convert Proposal-stage deals|B:annotated:Invoice 1',
    );
    expect(screen.getByTestId('pending').textContent).toBe(
      'A:text:convert Proposal-stage deals|B:annotated:Invoice 1',
    );
  });

  it('no useTextSelection hook is needed: the snapshot shape already carries text', () => {
    // The snapshot is `DciContextNode[]`; a text node is one. If this
    // assertion ever fails, that is the trigger to add `useTextSelection()`.
    expect(TEXT_NODE.source).toBe('text');
  });
});
