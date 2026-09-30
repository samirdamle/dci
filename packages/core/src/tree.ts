import { DCI_UI_ATTRIBUTE } from './keys';
import { DEFAULT_ATTRIBUTE, readDci, type InferAnnotation } from './parse';

export interface TreeOptions {
  /** Attribute that marks DCI nodes. Defaults to `data-dci`. */
  attribute?: string;
  /** Annotations for elements without the attribute (see `DciConfig.infer`). */
  infer?: InferAnnotation;
  /** Scope root; nodes outside it are ignored. Defaults to `document.body`. */
  root?: Element;
}

/**
 * Queries over the DCI tree: the live DOM reduced to annotated elements.
 * Nothing is cached, so the host app can re-render freely.
 *
 * `private` nodes are transparent for navigation (never returned, their
 * annotated descendants belong to the nearest non-private ancestor) but are
 * kept in `pathTo`, so context extraction can mark them.
 */
export interface DciTree {
  /** Closest navigable ancestor-or-self of `el`, or `null`. */
  nearestNode(el: Element): Element | null;
  /** Nearest navigable ancestor of `node`, excluding `node` itself. */
  parentNode(node: Element): Element | null;
  /** Direct DCI children of `node`, in document order. */
  childNodes(node: Element): Element[];
  firstChildNode(node: Element): Element | null;
  /** Other DCI children of the same parent (top-level nodes when there is no parent). */
  siblingNodes(node: Element): Element[];
  prevSibling(node: Element): Element | null;
  nextSibling(node: Element): Element | null;
  /** Siblings sharing `node`'s `type`, including `node`. */
  sameTypeSiblings(node: Element): Element[];
  /** Annotated chain from the root down to `node` (inclusive), private nodes included. */
  pathTo(node: Element): Element[];
}

/** Parent across open shadow-root boundaries. */
function composedParent(node: Node): Element | null {
  if (node.parentElement) return node.parentElement;
  const parent = node.parentNode;
  return parent instanceof ShadowRoot ? parent.host : null;
}

export function createDciTree(options: TreeOptions = {}): DciTree {
  const attribute = options.attribute ?? DEFAULT_ATTRIBUTE;
  const source = { attribute, ...(options.infer ? { infer: options.infer } : {}) };
  const getRoot = () => options.root ?? document.body;

  const isAnnotated = (el: Element) => el.hasAttribute(attribute) || readDci(el, source) !== null;
  const isNavigable = (el: Element) => readDci(el, source)?.private === false;

  /** Ancestor-or-self chain of `el` up to the root, or `null` if `el` is outside it. */
  function chain(el: Element): Element[] | null {
    const root = getRoot();
    const out: Element[] = [];
    for (let cur: Element | null = el; cur; cur = composedParent(cur)) {
      out.push(cur);
      if (cur === root) return out;
    }
    return null;
  }

  function nearestNode(el: Element): Element | null {
    return chain(el)?.find(isNavigable) ?? null;
  }

  function parentNode(node: Element): Element | null {
    return chain(node)?.slice(1).find(isNavigable) ?? null;
  }

  /**
   * Navigable descendants of `container` that have no navigable node between
   * them and `container`. Subtrees below each hit are skipped, so the cost is
   * proportional to the part of the subtree above the next DCI level.
   */
  function directNodes(container: Element | ShadowRoot): Element[] {
    const out: Element[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as Element;
        // DCI's own UI (overlay, chat) is never part of the tree, even with `infer`.
        if (el.hasAttribute(DCI_UI_ATTRIBUTE)) return NodeFilter.FILTER_REJECT;
        if (isNavigable(el)) {
          out.push(el);
          return NodeFilter.FILTER_REJECT;
        }
        if (el.shadowRoot) out.push(...directNodes(el.shadowRoot));
        return NodeFilter.FILTER_SKIP;
      },
    });
    while (walker.nextNode());
    return out;
  }

  function childNodes(node: Element): Element[] {
    return node.shadowRoot
      ? [...directNodes(node.shadowRoot), ...directNodes(node)]
      : directNodes(node);
  }

  /** Every node that shares `node`'s DCI parent, including `node`. */
  function siblingsWithSelf(node: Element): Element[] {
    const parent = parentNode(node);
    if (parent) return childNodes(parent);
    const root = getRoot();
    return isNavigable(root) ? [root] : childNodes(root);
  }

  function siblingAt(node: Element, offset: number): Element | null {
    const all = siblingsWithSelf(node);
    const i = all.indexOf(node);
    return i < 0 ? null : (all[i + offset] ?? null);
  }

  return {
    nearestNode,
    parentNode,
    childNodes,
    firstChildNode: (node) => childNodes(node)[0] ?? null,
    siblingNodes: (node) => siblingsWithSelf(node).filter((el) => el !== node),
    prevSibling: (node) => siblingAt(node, -1),
    nextSibling: (node) => siblingAt(node, 1),
    sameTypeSiblings(node) {
      const type = readDci(node, source)?.type;
      if (type === undefined) return [node];
      return siblingsWithSelf(node).filter((el) => readDci(el, source)?.type === type);
    },
    pathTo(node) {
      return (chain(node) ?? []).filter(isAnnotated).reverse();
    },
  };
}
