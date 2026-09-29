// app/api/dci/route.ts in a Next.js App Router project.
import { handler } from './shared';

export const runtime = 'nodejs'; // or 'edge': the handler only uses Web APIs
export const dynamic = 'force-dynamic';

export const POST = handler;
