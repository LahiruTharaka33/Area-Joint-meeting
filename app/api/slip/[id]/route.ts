import { getSession } from '@/lib/auth';
import { getSlip } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf',
};

/** GET /api/slip/<slip id> – visible to the organiser and to the member who uploaded it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response('Not allowed', { status: 403 });

  const slip = await getSlip(id);
  if (!slip) return new Response('No slip', { status: 404 });
  const allowed = session.role === 'admin' || (session.role === 'member' && session.id === slip.memberId);
  if (!allowed) return new Response('Not allowed', { status: 403 });

  return new Response(new Uint8Array(slip.data), {
    headers: {
      'Content-Type': slip.contentType,
      'Content-Disposition': `inline; filename="slip-${id.slice(0, 8)}${EXT[slip.contentType] ?? ''}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
