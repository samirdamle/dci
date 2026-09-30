import { defineLibConfig } from '../../tsup.shared.ts';

// `@samirdamle/dci-server` stays Web-standard; the Node adapter is a separate entry (`@samirdamle/dci-server/node`).
export default defineLibConfig({ entry: ['src/index.ts', 'src/node.ts'] });
