import { defineLibConfig } from '../../tsup.shared.ts';

// `@dci/server` stays Web-standard; the Node adapter is a separate entry (`@dci/server/node`).
export default defineLibConfig({ entry: ['src/index.ts', 'src/node.ts'] });
