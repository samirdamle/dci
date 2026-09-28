import { describe, expect, it } from 'vitest';
import { createDciTree } from '../src/tree';
import { mountFixture } from './test-utils';

const ids = (els: Element[]) => els.map((el) => el.id);

const TABLE = `
  <table id="t" data-dci='{"id":"t","type":"table"}'>
    <tbody>
      <tr id="r1" data-dci='{"id":"r1","type":"row"}'>
        <td id="c11" data-dci='{"id":"c11","type":"cell"}'><span id="text11">A</span></td>
        <td id="c12" data-dci='{"id":"c12","type":"cell"}'>B</td>
      </tr>
      <tr id="r2" data-dci='{"id":"r2","type":"row"}'>
        <td id="c21" data-dci='{"id":"c21","type":"cell"}'>C</td>
        <td id="c22" data-dci='{"id":"c22","type":"cell"}'>D</td>
      </tr>
      <tr id="r3" data-dci='{"id":"r3","type":"row"}'><td>unannotated</td></tr>
    </tbody>
  </table>`;

describe('createDciTree', () => {
  describe('table › row › cell', () => {
    it('finds the nearest node from any descendant', () => {
      const f = mountFixture(TABLE);
      const tree = createDciTree({ root: f.root });
      expect(tree.nearestNode(f.get('#text11'))?.id).toBe('c11');
      expect(tree.nearestNode(f.get('#c11'))?.id).toBe('c11');
      expect(tree.nearestNode(f.get('#r3 td'))?.id).toBe('r3');
      expect(tree.nearestNode(f.get('tbody'))?.id).toBe('t');
    });

    it('navigates parent, children and siblings', () => {
      const f = mountFixture(TABLE);
      const tree = createDciTree({ root: f.root });
      const [t, r1, r2, c11, c12] = ['#t', '#r1', '#r2', '#c11', '#c12'].map((s) => f.get(s));

      expect(tree.parentNode(c11!)).toBe(r1);
      expect(tree.parentNode(r1!)).toBe(t);
      expect(tree.parentNode(t!)).toBeNull();

      expect(ids(tree.childNodes(t!))).toEqual(['r1', 'r2', 'r3']);
      expect(ids(tree.childNodes(r1!))).toEqual(['c11', 'c12']);
      expect(tree.childNodes(f.get('#r3'))).toEqual([]);
      expect(tree.firstChildNode(r2!)?.id).toBe('c21');
      expect(tree.firstChildNode(f.get('#r3'))).toBeNull();

      expect(ids(tree.siblingNodes(r2!))).toEqual(['r1', 'r3']);
      expect(tree.prevSibling(c12!)).toBe(c11);
      expect(tree.nextSibling(c11!)).toBe(c12);
      expect(tree.prevSibling(c11!)).toBeNull();
      expect(tree.nextSibling(c12!)).toBeNull();
    });

    it('returns same-type siblings including the node', () => {
      const f = mountFixture(`
        <ul data-dci="list">
          <li id="a" data-dci='{"type":"invoice"}'></li>
          <li id="b" data-dci='{"type":"quote"}'></li>
          <li id="c" data-dci='{"type":"invoice"}'></li>
          <li id="d" data-dci="untyped"></li>
        </ul>`);
      const tree = createDciTree({ root: f.root });
      expect(ids(tree.sameTypeSiblings(f.get('#c')))).toEqual(['a', 'c']);
      expect(ids(tree.sameTypeSiblings(f.get('#d')))).toEqual(['d']);
    });

    it('builds the root→node path', () => {
      const f = mountFixture(TABLE);
      const tree = createDciTree({ root: f.root });
      expect(ids(tree.pathTo(f.get('#c12')))).toEqual(['t', 'r1', 'c12']);
    });
  });

  it('skips unannotated wrappers in a nested card grid', () => {
    const f = mountFixture(`
      <section id="grid" data-dci="grid">
        <div class="row"><div class="col">
          <article id="card1" data-dci="card1">
            <div><div><button id="btn1" data-dci="btn1">Go</button></div></div>
          </article>
        </div></div>
        <div class="row"><div class="col">
          <article id="card2" data-dci="card2"></article>
          <article id="card3" data-dci="card3"></article>
        </div></div>
      </section>`);
    const tree = createDciTree({ root: f.root });
    expect(ids(tree.childNodes(f.get('#grid')))).toEqual(['card1', 'card2', 'card3']);
    expect(tree.parentNode(f.get('#btn1'))?.id).toBe('card1');
    expect(ids(tree.siblingNodes(f.get('#card2')))).toEqual(['card1', 'card3']);
  });

  it('treats top-level nodes under the root as siblings', () => {
    const f = mountFixture(`
      <div><header id="h" data-dci="h"></header></div>
      <main id="m" data-dci="m"><p id="p" data-dci="p"></p></main>`);
    const tree = createDciTree({ root: f.root });
    expect(ids(tree.siblingNodes(f.get('#h')))).toEqual(['m']);
    expect(tree.nextSibling(f.get('#h'))?.id).toBe('m');
  });

  it('ignores nodes outside the root', () => {
    const f = mountFixture(`
      <div id="outside" data-dci="outside"><span id="in-out"></span></div>
      <div id="scope"><div id="inside" data-dci="inside"></div></div>`);
    const tree = createDciTree({ root: f.get('#scope') });
    expect(tree.nearestNode(f.get('#in-out'))).toBeNull();
    expect(tree.nearestNode(f.get('#inside'))?.id).toBe('inside');
    expect(ids(tree.siblingNodes(f.get('#inside')))).toEqual([]);
  });

  it('handles an annotated root', () => {
    const f = mountFixture(`<div id="app" data-dci="app"><p id="a" data-dci="a"></p></div>`);
    const app = f.get('#app');
    const tree = createDciTree({ root: app });
    expect(tree.parentNode(f.get('#a'))).toBe(app);
    expect(tree.siblingNodes(app)).toEqual([]);
    expect(ids(tree.pathTo(f.get('#a')))).toEqual(['app', 'a']);
  });

  it('defaults the root to document.body', () => {
    const f = mountFixture(`<div id="x" data-dci="x"><span id="s"></span></div>`);
    expect(createDciTree().nearestNode(f.get('#s'))?.id).toBe('x');
  });

  it('honours a custom attribute name', () => {
    const f = mountFixture(`
      <div id="p" data-ctx="p"><div id="c" data-ctx="c" data-dci="ignored"></div></div>`);
    const tree = createDciTree({ root: f.root, attribute: 'data-ctx' });
    expect(tree.parentNode(f.get('#c'))?.id).toBe('p');
    expect(ids(tree.childNodes(f.get('#p')))).toEqual(['c']);
  });

  describe('private nodes', () => {
    const PRIVATE = `
      <div id="acct" data-dci="acct">
        <div id="secret" data-dci='{"id":"secret","private":true}'>
          <span id="inner-text">ssn</span>
          <div id="note" data-dci="note"></div>
        </div>
        <div id="contact" data-dci="contact"></div>
      </div>`;

    it('skips private nodes when finding the nearest node', () => {
      const f = mountFixture(PRIVATE);
      const tree = createDciTree({ root: f.root });
      expect(tree.nearestNode(f.get('#inner-text'))?.id).toBe('acct');
      expect(tree.nearestNode(f.get('#note'))?.id).toBe('note');
    });

    it('is transparent for navigation', () => {
      const f = mountFixture(PRIVATE);
      const tree = createDciTree({ root: f.root });
      expect(ids(tree.childNodes(f.get('#acct')))).toEqual(['note', 'contact']);
      expect(tree.parentNode(f.get('#note'))?.id).toBe('acct');
    });

    it('stays in pathTo so context extraction can mark it', () => {
      const f = mountFixture(PRIVATE);
      const tree = createDciTree({ root: f.root });
      expect(ids(tree.pathTo(f.get('#note')))).toEqual(['acct', 'secret', 'note']);
    });
  });

  describe('open shadow roots', () => {
    function mountShadow() {
      const f = mountFixture(`
        <div id="list" data-dci="list">
          <div id="host"></div>
          <div id="light" data-dci="light"></div>
        </div>`);
      const shadow = f.get('#host').attachShadow({ mode: 'open' });
      shadow.innerHTML = `<div><div id="shadowed" data-dci="shadowed"><b id="deep">x</b></div></div>`;
      return { f, shadow };
    }

    it('walks up through the shadow host', () => {
      const { f, shadow } = mountShadow();
      const tree = createDciTree({ root: f.root });
      const deep = shadow.getElementById('deep')!;
      expect(tree.nearestNode(deep)?.id).toBe('shadowed');
      expect(tree.parentNode(shadow.getElementById('shadowed')!)?.id).toBe('list');
    });

    it('walks down into the shadow tree', () => {
      const { f } = mountShadow();
      const tree = createDciTree({ root: f.root });
      expect(ids(tree.childNodes(f.get('#list')))).toEqual(['shadowed', 'light']);
    });

    it('lists shadow children of an annotated host before its light children', () => {
      const f = mountFixture(`<div id="card" data-dci="card"><i id="l" data-dci="l"></i></div>`);
      const shadow = f.get('#card').attachShadow({ mode: 'open' });
      shadow.innerHTML = `<b id="s" data-dci="s"></b><slot></slot>`;
      const tree = createDciTree({ root: f.root });
      expect(ids(tree.childNodes(f.get('#card')))).toEqual(['s', 'l']);
    });

    it('includes shadow nodes in pathTo', () => {
      const { f, shadow } = mountShadow();
      const tree = createDciTree({ root: f.root });
      expect(ids(tree.pathTo(shadow.getElementById('deep')!))).toEqual(['list', 'shadowed']);
    });
  });

  describe('performance', () => {
    it('keeps childNodes and siblingNodes under 5 ms on a 10k-node fixture', () => {
      const rows = Array.from({ length: 100 }, (_, r) => {
        const cells = Array.from(
          { length: 100 },
          (_, c) => `<td data-dci="c${r}-${c}"><span>${c}</span></td>`,
        ).join('');
        return `<tr data-dci="r${r}">${cells}</tr>`;
      }).join('');
      const f = mountFixture(`<table id="big" data-dci="big"><tbody>${rows}</tbody></table>`);
      const tree = createDciTree({ root: f.root });
      const table = f.get('#big');
      const row = f.get('[data-dci="r50"]');
      const cell = f.get('[data-dci="c50-50"]');

      // Warm the parse cache and JIT, then take the best of several runs.
      const best = (fn: () => unknown) => {
        let min = Infinity;
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          fn();
          min = Math.min(min, performance.now() - start);
        }
        return min;
      };

      expect(tree.childNodes(table)).toHaveLength(100);
      expect(tree.siblingNodes(cell)).toHaveLength(99);
      expect(best(() => tree.childNodes(table))).toBeLessThan(5);
      expect(best(() => tree.childNodes(row))).toBeLessThan(5);
      expect(best(() => tree.siblingNodes(cell))).toBeLessThan(5);
    });
  });
});
