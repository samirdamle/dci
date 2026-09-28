import { afterEach, describe, expect, it } from 'vitest';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import { wheelPixels } from '../src/wheel';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const alt = { altKey: true };

let dci: Interactions | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
});

async function setup(options: InteractionOptions = {}) {
  const f = mountFixture(`
    <section id="page" data-dci="page">
      <table id="t" data-dci="t"><tbody>
        <tr id="r" data-dci="r"><td id="c" data-dci="c"><b id="leaf">A</b></td><td id="c2" data-dci="c2"></td></tr>
      </tbody></table>
    </section>`);
  dci = createInteractions({ root: f.root, ...options });
  const hovers: string[] = [];
  dci.bus.on('hover', ({ node, depth }) => hovers.push(`${node?.id}:${depth}`));
  fakeKey('Alt', { altKey: true });
  fakePointer(f.get('#leaf'), { type: 'pointermove', ...alt });
  await frame();
  const wheel = (deltaY: number) => fakePointer(f.get('#leaf'), { type: 'wheel', deltaY, ...alt });
  return { f, dci, hovers, wheel };
}

describe('Mod+Wheel traversal', () => {
  it('steps up toward the root and back down toward the leaf', async () => {
    const { dci, wheel } = await setup();
    wheel(-40);
    expect(dci.hover.node()?.id).toBe('r');
    wheel(-40);
    expect(dci.hover.node()?.id).toBe('t');
    wheel(40);
    expect(dci.hover.node()?.id).toBe('r');
    expect(dci.hover.depth()).toBe(1);
  });

  it('clamps at the root and at the leaf', async () => {
    const { dci, wheel } = await setup();
    for (let i = 0; i < 10; i++) wheel(-40);
    expect(dci.hover.node()?.id).toBe('page');
    for (let i = 0; i < 10; i++) wheel(40);
    expect(dci.hover.node()?.id).toBe('c');
  });

  it('accumulates small trackpad deltas before stepping', async () => {
    const { dci, wheel } = await setup();
    wheel(-15);
    wheel(-15);
    expect(dci.hover.depth()).toBe(0);
    wheel(-15);
    expect(dci.hover.depth()).toBe(1);
    // The 5px remainder carries over.
    wheel(-35);
    expect(dci.hover.depth()).toBe(2);
  });

  it('moves several levels for one large delta', async () => {
    const { dci, wheel } = await setup();
    wheel(-120);
    expect(dci.hover.node()?.id).toBe('page');
  });

  it('resets the offset when the pointer moves to a different leaf', async () => {
    const { f, dci, wheel } = await setup();
    wheel(-40);
    expect(dci.hover.depth()).toBe(1);
    fakePointer(f.get('#c2'), { type: 'pointermove', ...alt });
    await frame();
    expect(dci.hover.node()?.id).toBe('c2');
    expect(dci.hover.depth()).toBe(0);
  });

  it('emits hover with the depth for the overlay label', async () => {
    const { hovers, wheel } = await setup();
    wheel(-40);
    expect(hovers).toEqual(['c:0', 'r:1']);
  });

  it('prevents page scrolling while armed', async () => {
    const { wheel } = await setup();
    expect(wheel(-40).defaultPrevented).toBe(true);
    expect(wheel(-5).defaultPrevented).toBe(true);
  });

  it('does nothing when disabled', async () => {
    const { dci, wheel } = await setup({ bindings: { wheelTraverse: false } });
    expect(wheel(-40).defaultPrevented).toBe(false);
    expect(dci.hover.depth()).toBe(0);
  });

  it('lets the page scroll when not armed', async () => {
    const { f, wheel } = await setup();
    fakeKey('Alt', { type: 'keyup' });
    expect(fakePointer(f.get('#leaf'), { type: 'wheel', deltaY: -40 }).defaultPrevented).toBe(
      false,
    );
    expect(wheel).toBeTypeOf('function');
  });
});

describe('wheelPixels', () => {
  it('normalizes line and page deltas', () => {
    expect(wheelPixels({ deltaY: 3, deltaMode: 0 })).toBe(3);
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelPixels({ deltaY: -1, deltaMode: 2 })).toBe(-800);
  });
});
