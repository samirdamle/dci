import { createDciTree } from '@samirdamle/dci-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { inferAnnotation } from '../src/infer';

const $ = (selector: string) => document.querySelector(selector)!;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('inferAnnotation', () => {
  it('turns table rows into records with one field per column', () => {
    document.body.innerHTML = `
      <table aria-label="Orders">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th></tr></thead>
        <tbody>
          <tr id="r1"><td>#1001</td><td> Ada
            Lovelace </td><td></td></tr>
        </tbody>
      </table>`;
    expect(inferAnnotation($('#r1'))).toEqual({
      type: 'row',
      label: '#1001',
      Order: '#1001',
      Customer: 'Ada Lovelace',
    });
    expect(inferAnnotation($('thead tr'))).toBeNull();
    expect(inferAnnotation($('table'))).toEqual({ type: 'table', label: 'Orders' });
  });

  it('names columns without headers by position, and keeps duplicate headers apart', () => {
    document.body.innerHTML = `
      <table>
        <tr><th>Name</th><th>Name</th></tr>
        <tr id="r"><td>a</td><td>b</td><td>c</td></tr>
      </table>`;
    expect(inferAnnotation($('#r'))).toEqual({
      type: 'row',
      label: 'a',
      Name: 'a',
      'Name (2)': 'b',
      'column 3': 'c',
    });
  });

  it('describes list items, articles and headings', () => {
    document.body.innerHTML = `
      <ul><li id="li">Milk<script>track()</script></li><li id="empty"> </li></ul>
      <article id="a"><h2>Launch notes</h2><p>We shipped.</p></article>
      <h3 id="h">Pricing</h3>`;
    expect(inferAnnotation($('#li'))).toEqual({ type: 'list item', label: 'Milk' });
    expect(inferAnnotation($('#empty'))).toBeNull();
    expect(inferAnnotation($('#a'))).toEqual({
      type: 'article',
      label: 'Launch notes',
      text: 'Launch notes We shipped.',
    });
    expect(inferAnnotation($('#h'))).toEqual({ type: 'heading', label: 'Pricing', level: 3 });
  });

  it('describes links, buttons and images, skipping decorative images', () => {
    document.body.innerHTML = `
      <a id="a" href="https://example.com/docs">Docs</a>
      <button id="b" aria-label="Close dialog">×</button>
      <img id="i" alt="Team photo" src="https://example.com/team.png">
      <img id="d" alt="" src="https://example.com/spacer.gif">`;
    expect(inferAnnotation($('#a'))).toEqual({
      type: 'link',
      label: 'Docs',
      href: 'https://example.com/docs',
    });
    expect(inferAnnotation($('#b'))).toEqual({ type: 'button', label: 'Close dialog' });
    expect(inferAnnotation($('#i'))).toMatchObject({ type: 'image', label: 'Team photo' });
    expect(inferAnnotation($('#d'))).toBeNull();
  });

  it('reads form fields, but never a password', () => {
    document.body.innerHTML = `
      <label for="e">Email</label><input id="e" value="ada@example.com">
      <label>Password <input id="p" type="password" value="hunter2"></label>
      <label><input id="c" type="checkbox" checked> Remember me</label>
      <select id="s" aria-label="Plan"><option>Free</option><option selected>Pro</option></select>
      <input id="h" type="hidden" value="token">`;
    expect(inferAnnotation($('#e'))).toEqual({
      type: 'field',
      label: 'Email',
      value: 'ada@example.com',
    });
    expect(inferAnnotation($('#p'))).toEqual({ type: 'password field', label: 'Password' });
    expect(JSON.stringify(inferAnnotation($('#p')))).not.toContain('hunter2');
    expect(inferAnnotation($('#c'))).toEqual({
      type: 'checkbox',
      label: 'Remember me',
      checked: true,
    });
    expect(inferAnnotation($('#s'))).toEqual({ type: 'field', label: 'Plan', value: 'Pro' });
    expect(inferAnnotation($('#h'))).toBeNull();
  });

  it('keeps landmarks, but leaves unnamed sections and plain elements alone', () => {
    document.body.innerHTML = `
      <nav id="n" aria-label="Primary"></nav>
      <main id="m"></main>
      <section id="s"><p id="p">text</p></section>
      <div id="r" role="row">Row text</div>`;
    expect(inferAnnotation($('#n'))).toEqual({ type: 'navigation', label: 'Primary' });
    expect(inferAnnotation($('#m'))).toEqual({ type: 'main content' });
    expect(inferAnnotation($('#s'))).toBeNull();
    expect(inferAnnotation($('#p'))).toBeNull();
    expect(inferAnnotation($('#r'))).toEqual({ type: 'row', label: 'Row text' });
  });

  it('gives a plain page a DCI tree: table › rows', () => {
    document.body.innerHTML = `
      <main><table><tr><th>Name</th></tr><tr><td>Ada</td></tr><tr><td>Alan</td></tr></table></main>`;
    const tree = createDciTree({ infer: inferAnnotation });
    const table = $('table');
    expect(tree.nearestNode($('td'))).toBe($('tr:nth-child(2)'));
    expect(tree.childNodes(table)).toHaveLength(2);
    expect(tree.nearestNode(table.parentElement!)).toBe($('main'));
  });
});
