import { describe, expect, it, vi } from 'vitest';
import { createActionRegistry, type ActionContext } from '../src/actions';
import type { Overlay } from '../src/overlay';
import { createSelectionStore } from '../src/selection';
import { mountFixture } from './test-utils';

const FIXTURE = `
  <div id="a" data-dci="inv_1"></div>
  <div id="b" data-dci='{"id":"inv_2","type":"invoice"}'></div>
  <div id="c" data-dci='{"id":"inv_2","type":"copy"}'></div>
  <div id="d" data-dci="inv_3"></div>`;

function setup(options: Partial<Parameters<typeof createActionRegistry>[0]> = {}) {
  const f = mountFixture(FIXTURE);
  const selection = createSelectionStore({ root: f.root });
  const overlay = { flash: vi.fn() } as unknown as Overlay;
  const warn = vi.fn();
  const registry = createActionRegistry({ selection, overlay, root: f.root, warn, ...options });
  return { f, selection, overlay, warn, registry };
}
const ids = (els: Element[]) => els.map((e) => e.id);

describe('createActionRegistry', () => {
  it('registers and unregisters handlers', async () => {
    const { registry } = setup();
    const handler = vi.fn();
    const off = registry.on('updateInvoice', handler);
    await registry.dispatch('updateInvoice', { id: 'inv_1', patch: { paid: true } });
    expect(handler).toHaveBeenCalledWith(
      { id: 'inv_1', patch: { paid: true } },
      expect.any(Object),
    );
    off();
    expect(registry.has('updateInvoice')).toBe(false);
  });

  it('awaits async handlers', async () => {
    const { registry } = setup();
    const order: string[] = [];
    registry.on('slow', async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('handler');
    });
    await registry.dispatch('slow');
    order.push('after');
    expect(order).toEqual(['handler', 'after']);
  });

  it('catches a throwing handler and reports it', async () => {
    const onError = vi.fn();
    const { registry, warn } = setup({ onError });
    registry.on('boom', () => {
      throw new Error('nope');
    });
    registry.on('asyncBoom', async () => Promise.reject('bad'));
    await expect(registry.dispatch('boom', { x: 1 })).resolves.toBeUndefined();
    await registry.dispatch('asyncBoom');
    expect(onError).toHaveBeenCalledWith({
      name: 'boom',
      args: { x: 1 },
      error: expect.any(Error),
    });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('Client action "boom" failed: nope');
  });

  it('warns and ignores unknown actions', async () => {
    const { registry, warn } = setup();
    await registry.dispatch('nothing');
    expect(warn).toHaveBeenCalledWith('No handler for client action "nothing".');
  });

  it('resolves ids in short and JSON form, caching per dispatch', async () => {
    const { registry, f } = setup();
    let ctx: ActionContext | undefined;
    registry.on('probe', (_args, c) => {
      ctx = c;
    });
    await registry.dispatch('probe');
    const spy = vi.spyOn(f.root, 'querySelectorAll');
    expect(ids(ctx!.resolve('inv_1'))).toEqual(['a']);
    expect(ids(ctx!.resolve('inv_2'))).toEqual(['b', 'c']);
    expect(ctx!.resolve('missing')).toEqual([]);
    expect(spy).toHaveBeenCalledOnce();
  });

  describe('built-ins', () => {
    it('highlight flashes every matching element', async () => {
      const { registry, overlay, f } = setup();
      await registry.dispatch('highlight', { ids: ['inv_1', 'inv_2'] });
      expect(
        (overlay.flash as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as Element).id),
      ).toEqual(['a', 'b', 'c']);
      expect(f.get('#a')).toBeTruthy();
    });

    it('select replaces or adds', async () => {
      const { registry, selection } = setup();
      await registry.dispatch('select', { ids: ['inv_1'] });
      expect(ids(selection.get())).toEqual(['a']);
      await registry.dispatch('select', { ids: ['inv_3'], mode: 'add' });
      expect(ids(selection.get())).toEqual(['a', 'd']);
      await registry.dispatch('select', { ids: ['inv_3'] });
      expect(ids(selection.get())).toEqual(['d']);
    });

    it('scrollTo centers the element smoothly', async () => {
      const { registry, f } = setup();
      const scroll = vi.fn();
      f.get('#d').scrollIntoView = scroll;
      await registry.dispatch('scrollTo', { id: 'inv_3' });
      expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    });

    it('can be overridden, and the override removed again', async () => {
      const { registry, overlay } = setup();
      const custom = vi.fn();
      const off = registry.on('highlight', custom);
      await registry.dispatch('highlight', { ids: ['inv_1'] });
      expect(custom).toHaveBeenCalledOnce();
      expect(overlay.flash).not.toHaveBeenCalled();
      off();
      await registry.dispatch('highlight', { ids: ['inv_1'] });
      expect(overlay.flash).toHaveBeenCalledOnce();
    });

    it('can be disabled entirely or selectively', () => {
      expect(setup({ builtins: false }).registry.has('highlight')).toBe(false);
      const partial = setup({ builtins: ['scrollTo'] }).registry;
      expect([partial.has('highlight'), partial.has('select'), partial.has('scrollTo')]).toEqual([
        false,
        false,
        true,
      ]);
    });
  });
});
