import { devWarn, type Warn } from './env';
import type { Overlay } from './overlay';
import { DEFAULT_ATTRIBUTE, readDci } from './parse';
import type { SelectionStore } from './selection';

export interface ActionContext {
  selection: SelectionStore;
  overlay: Pick<Overlay, 'flash'> | null;
  /** Elements whose `data-dci` id is `id` (short or JSON form), under the root. */
  resolve(id: string): Element[];
}

export type ActionHandler = (
  args: Record<string, unknown>,
  ctx: ActionContext,
) => void | Promise<void>;

export interface ActionError {
  name: string;
  args: Record<string, unknown>;
  error: unknown;
}

export interface ActionRegistryOptions {
  selection: SelectionStore;
  /** Anything that can pulse an element, e.g. the overlay. */
  overlay?: Pick<Overlay, 'flash'> | null;
  /** Where ids are looked up. Default `document.body`. */
  root?: Element;
  attribute?: string;
  /**
   * Built-in actions to register: `true` (default) for all, `false` for none,
   * or a list such as `['highlight', 'scrollTo']`.
   */
  builtins?: boolean | BuiltinAction[];
  /** Called when a handler throws; the stream is never interrupted. */
  onError?: (error: ActionError) => void;
  warn?: Warn;
}

export type BuiltinAction = 'highlight' | 'select' | 'scrollTo';

export interface ActionRegistry {
  /**
   * Register a handler. The latest registration for a name wins (so a
   * built-in can be overridden); unsubscribing restores the previous one.
   */
  on(name: string, handler: ActionHandler): () => void;
  /** Run the handler for a `client-action` event. Never throws. */
  dispatch(name: string, args?: Record<string, unknown>): Promise<void>;
  has(name: string): boolean;
}

const idsOf = (args: Record<string, unknown>): string[] => {
  const ids = args.ids ?? (args.id !== undefined ? [args.id] : []);
  return Array.isArray(ids) ? ids.map(String) : [String(ids)];
};

export const BUILTIN_ACTIONS: Record<BuiltinAction, ActionHandler> = {
  highlight(args, ctx) {
    for (const id of idsOf(args)) for (const el of ctx.resolve(id)) ctx.overlay?.flash(el);
  },
  select(args, ctx) {
    const els = idsOf(args).flatMap((id) => ctx.resolve(id));
    if (args.mode === 'add') ctx.selection.add(els);
    else ctx.selection.set(els);
  },
  scrollTo(args, ctx) {
    const [el] = idsOf(args).flatMap((id) => ctx.resolve(id));
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  },
};

/** Handlers for `client-action` events: the agent asking the page to act. */
export function createActionRegistry(options: ActionRegistryOptions): ActionRegistry {
  const handlers = new Map<string, ActionHandler[]>();
  const attribute = options.attribute ?? DEFAULT_ATTRIBUTE;
  const warn = options.warn ?? devWarn;

  function on(name: string, handler: ActionHandler) {
    const stack = handlers.get(name) ?? [];
    stack.push(handler);
    handlers.set(name, stack);
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i >= 0) stack.splice(i, 1);
    };
  }

  const builtins = options.builtins ?? true;
  for (const name of Object.keys(BUILTIN_ACTIONS) as BuiltinAction[]) {
    if (builtins === true || (Array.isArray(builtins) && builtins.includes(name))) {
      on(name, BUILTIN_ACTIONS[name]);
    }
  }

  function context(): ActionContext {
    // `data-dci` may hold JSON, so ids can't be matched with a CSS selector:
    // scan once per dispatch and cache the result.
    let index: Map<string, Element[]> | null = null;
    return {
      selection: options.selection,
      overlay: options.overlay ?? null,
      resolve(id) {
        if (!index) {
          index = new Map();
          const root = options.root ?? document.body;
          for (const el of root.querySelectorAll(`[${attribute}]`)) {
            const found = readDci(el, { attribute })?.id;
            if (found === undefined) continue;
            const list = index.get(found) ?? [];
            list.push(el);
            index.set(found, list);
          }
        }
        return index.get(id) ?? [];
      },
    };
  }

  return {
    on,
    has: (name) => (handlers.get(name)?.length ?? 0) > 0,
    async dispatch(name, args = {}) {
      const stack = handlers.get(name);
      const handler = stack?.[stack.length - 1];
      if (!handler) {
        warn(`No handler for client action "${name}".`);
        return;
      }
      try {
        await handler(args, context());
      } catch (error) {
        warn(
          `Client action "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        options.onError?.({ name, args, error });
      }
    },
  };
}
