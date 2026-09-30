import { dci } from '@samirdamle/dci-react';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/crm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { segmentAnnotation } from '@/lib/annotations';
import { count, useOrg } from '@/lib/org';

export function SegmentsPage() {
  const org = useOrg();
  return (
    <div className="space-y-6">
      <PageHeader title="Audience segments" hint="Alt+Click a segment and ask who is in it." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {org.Segment.map((s) => (
          <Card key={s.Id} className="gap-2" {...dci(segmentAnnotation(s))}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1">
                <Users className="size-3" /> {count(s.Size)} contacts
              </CardDescription>
              <CardTitle className="text-base">{s.Name}</CardTitle>
            </CardHeader>
            <CardContent>
              <code className="block rounded bg-muted p-2 text-xs">{s.Criteria}</code>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
