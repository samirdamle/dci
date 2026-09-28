import { VERSION as CORE_VERSION } from '@dci/core';
import { VERSION as PROTOCOL_VERSION } from '@dci/protocol';
import { VERSION as REACT_VERSION } from '@dci/react';
import { VERSION as SERVER_VERSION } from '@dci/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const packages = [
  { name: '@dci/protocol', version: PROTOCOL_VERSION },
  { name: '@dci/core', version: CORE_VERSION },
  { name: '@dci/react', version: REACT_VERSION },
  { name: '@dci/server', version: SERVER_VERSION },
];

export function App() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>DCI Demo</CardTitle>
          <CardDescription>Direct Contextual Intelligence: workspace packages</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" aria-label="Package versions">
            {packages.map((pkg) => (
              <li
                key={pkg.name}
                className="flex items-center justify-between py-2 text-sm"
                data-testid="package-version"
              >
                <code className="font-mono">{pkg.name}</code>
                <span className="text-muted-foreground">v{pkg.version}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
