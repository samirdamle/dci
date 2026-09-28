import { describe, expect, it } from 'vitest';
import { cssPath, toContextNode, truncateText } from '../src/context';
import { mountFixture } from './test-utils';

const INVOICES = `
  <main data-dci='{"id":"dash","type":"page","label":"Dashboard","owner":"ops"}'>
    <table class="invoices striped" data-dci='{"id":"inv","type":"table","label":"Invoices"}'>
      <tbody>
        <tr id="row" data-dci='{"id":"inv_123","type":"invoice","label":"Invoice #123","amount":420}'>
          <td id="cell" data-dci='{"id":"inv_123.amount","type":"cell"}'>$420</td>
          <td id="plain">  Acme
             Corp  </td>
        </tr>
      </tbody>
    </table>
  </main>`;

describe('toContextNode', () => {
  it('extracts an annotated node with compact ancestors', () => {
    const f = mountFixture(INVOICES);
    expect(toContextNode(f.get('#row'), { root: f.root })).toMatchInlineSnapshot(`
      {
        "ancestors": [
          {
            "id": "dash",
            "label": "Dashboard",
            "type": "page",
          },
          {
            "id": "inv",
            "label": "Invoices",
            "type": "table",
          },
        ],
        "data": {
          "amount": 420,
        },
        "id": "inv_123",
        "label": "Invoice #123",
        "source": "annotated",
        "type": "invoice",
      }
    `);
  });

  it('includes ancestor data in full mode', () => {
    const f = mountFixture(INVOICES);
    expect(toContextNode(f.get('#cell'), { root: f.root, ancestorData: 'full' }))
      .toMatchInlineSnapshot(`
      {
        "ancestors": [
          {
            "data": {
              "owner": "ops",
            },
            "id": "dash",
            "label": "Dashboard",
            "type": "page",
          },
          {
            "data": {},
            "id": "inv",
            "label": "Invoices",
            "type": "table",
          },
          {
            "data": {
              "amount": 420,
            },
            "id": "inv_123",
            "label": "Invoice #123",
            "type": "invoice",
          },
        ],
        "data": {},
        "id": "inv_123.amount",
        "source": "annotated",
        "type": "cell",
      }
    `);
  });

  it('omits ancestors when includeAncestors is false', () => {
    const f = mountFixture(INVOICES);
    expect(toContextNode(f.get('#row'), { root: f.root, includeAncestors: false })).toEqual({
      id: 'inv_123',
      type: 'invoice',
      label: 'Invoice #123',
      data: { amount: 420 },
      source: 'annotated',
    });
  });

  it('describes an unannotated element as a fallback node', () => {
    const f = mountFixture(INVOICES);
    expect(toContextNode(f.get('#plain'), { root: f.root })).toMatchInlineSnapshot(`
      {
        "ancestors": [
          {
            "id": "dash",
            "label": "Dashboard",
            "type": "page",
          },
          {
            "id": "inv",
            "label": "Invoices",
            "type": "table",
          },
          {
            "id": "inv_123",
            "label": "Invoice #123",
            "type": "invoice",
          },
        ],
        "data": {},
        "fallback": {
          "path": "#plain",
          "tagName": "td",
          "text": "Acme Corp",
        },
        "source": "fallback",
      }
    `);
  });

  it('returns null for unannotated elements when fallback is off', () => {
    const f = mountFixture(INVOICES);
    expect(toContextNode(f.get('#plain'), { root: f.root, fallback: false })).toBeNull();
  });

  it('captures link, image and aria attributes', () => {
    const f = mountFixture(`
      <nav>
        <a id="link" href="/reports?q=1" title="Open reports" aria-label="Reports">Reports</a>
        <img id="img" alt="Revenue chart" src="chart.png" />
      </nav>`);
    expect(toContextNode(f.get('#link'), { root: f.root })).toMatchInlineSnapshot(`
      {
        "ancestors": [],
        "data": {},
        "fallback": {
          "ariaLabel": "Reports",
          "href": "/reports?q=1",
          "path": "#link",
          "tagName": "a",
          "text": "Reports",
          "title": "Open reports",
        },
        "source": "fallback",
      }
    `);
    expect(toContextNode(f.get('#img'), { root: f.root })?.fallback).toMatchInlineSnapshot(`
      {
        "alt": "Revenue chart",
        "path": "#img",
        "tagName": "img",
      }
    `);
  });

  describe('form fields', () => {
    it('reads text, textarea and select values', () => {
      const f = mountFixture(`
        <form>
          <input id="name" value="Ada" />
          <textarea id="notes">Call back</textarea>
          <select id="stage"><option>Open</option><option selected>Won</option></select>
        </form>`);
      const value = (sel: string) => toContextNode(f.get(sel), { root: f.root })?.fallback?.value;
      expect(value('#name')).toBe('Ada');
      expect(value('#notes')).toBe('Call back');
      expect(value('#stage')).toBe('Won');
    });

    it('never reads password inputs', () => {
      const f = mountFixture(`<form><input id="pw" type="password" value="hunter2" /></form>`);
      const node = toContextNode(f.get('#pw'), { root: f.root });
      expect(node?.fallback).toMatchInlineSnapshot(`
        {
          "path": "#pw",
          "tagName": "input",
        }
      `);
      expect(JSON.stringify(node)).not.toContain('hunter2');
    });
  });

  describe('privacy', () => {
    const PRIVATE = `
      <section data-dci='{"id":"acct","type":"account"}'>
        <div id="secret" data-dci='{"id":"ssn","type":"field","private":true,"value":"123-45-6789"}'>
          <span id="inside">123-45-6789</span>
          <div id="note" data-dci='{"id":"note","type":"note"}'>Hi</div>
        </div>
      </section>`;

    it('never extracts a private node', () => {
      const f = mountFixture(PRIVATE);
      expect(toContextNode(f.get('#secret'), { root: f.root })).toBeNull();
    });

    it('never describes unannotated content inside a private node', () => {
      const f = mountFixture(PRIVATE);
      expect(toContextNode(f.get('#inside'), { root: f.root })).toBeNull();
    });

    it('reduces private ancestors to a marker', () => {
      const f = mountFixture(PRIVATE);
      const node = toContextNode(f.get('#note'), { root: f.root, ancestorData: 'full' });
      expect(node).toMatchInlineSnapshot(`
        {
          "ancestors": [
            {
              "data": {},
              "id": "acct",
              "type": "account",
            },
            {
              "private": true,
            },
          ],
          "data": {},
          "id": "note",
          "source": "annotated",
          "type": "note",
        }
      `);
      expect(JSON.stringify(node)).not.toContain('ssn');
    });
  });

  it('is deterministic', () => {
    const f = mountFixture(INVOICES);
    const a = toContextNode(f.get('#plain'), { root: f.root });
    const b = toContextNode(f.get('#plain'), { root: f.root });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('does not share data objects with the parse cache', () => {
    const f = mountFixture(INVOICES);
    const node = toContextNode(f.get('#row'), { root: f.root })!;
    node.data.amount = 0;
    expect(toContextNode(f.get('#row'), { root: f.root })?.data.amount).toBe(420);
  });
});

describe('truncateText', () => {
  it('collapses whitespace', () => {
    expect(truncateText('  a \n\t b  ', 10)).toBe('a b');
  });

  it('truncates with an ellipsis marker', () => {
    expect(truncateText('abcdefghij', 4)).toBe('abcd…');
    expect(truncateText('abcd', 4)).toBe('abcd');
  });

  it('respects maxTextLength in fallback nodes', () => {
    const f = mountFixture(`<p id="p">${'word '.repeat(50)}</p>`);
    const text = toContextNode(f.get('#p'), { root: f.root, maxTextLength: 12 })?.fallback?.text;
    expect(text).toBe('word word wo…');
  });
});

describe('cssPath', () => {
  it('uses tags, safe classes and nth-child only where ambiguous', () => {
    const f = mountFixture(`
      <main><table class="invoices md:flex"><tbody>
        <tr></tr><tr></tr><tr id-x><td></td></tr>
      </tbody></table></main>`);
    expect(cssPath(f.get('tr:nth-child(3)'), f.root)).toBe(
      'main > table.invoices > tbody > tr:nth-child(3)',
    );
  });

  it('stops at an element with an id', () => {
    const f = mountFixture(`<div id="app"><ul><li><b id-x>x</b></li></ul></div>`);
    expect(cssPath(f.get('b'), f.root)).toBe('#app > ul > li > b');
  });

  it('caps the depth at five segments', () => {
    const f = mountFixture(`<a><b><i><u><s><em><span></span></em></s></u></i></b></a>`);
    expect(cssPath(f.get('span'), f.root)).toBe('i > u > s > em > span');
  });
});
