import { VERSION as CORE_VERSION } from '@dci/core';
import { VERSION as PROTOCOL_VERSION } from '@dci/protocol';
import { VERSION as REACT_VERSION } from '@dci/react';
import { VERSION as SERVER_VERSION } from '@dci/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Playground } from './Playground';

const packages = [
  { name: '@dci/protocol', version: PROTOCOL_VERSION },
  { name: '@dci/core', version: CORE_VERSION },
  { name: '@dci/react', version: REACT_VERSION },
  { name: '@dci/server', version: SERVER_VERSION },
];

export function App() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">DCI Demo</h1>
          <p className="text-muted-foreground">
            Direct Contextual Intelligence: hold <kbd>Alt</kbd> and click things to use them as AI
            context.
          </p>
        </div>
        <Card className="py-3">
          <CardHeader className="sr-only">
            <CardTitle>Packages</CardTitle>
            <CardDescription>Workspace package versions</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Package versions">
              {packages.map((pkg) => (
                <li key={pkg.name} data-testid="package-version">
                  <code className="font-mono">{pkg.name}</code>{' '}
                  <span className="text-muted-foreground">v{pkg.version}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </header>
      <Playground />
    </main>
  );
}
