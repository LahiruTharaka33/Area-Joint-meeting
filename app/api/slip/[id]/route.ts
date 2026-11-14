import { getSession } from '@/lib/auth';
import { getMember, getSlip } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf',
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const allowed = session && (session.role === 'admin' || (session.role === 'member' && session.id === id));
  if (!allowed) return new Response('Not allowed', { status: 403 });

  const [m, slip] = await Promise.all([getMember(id), getSlip(id)]);
  if (!m || !slip) return new Response('No slip', { status: 404 });

  return new Response(new Uint8Array(slip.data), {
    headers: {
      'Content-Type': slip.contentType,
      'Content-Disposition': `inline; filename="slip-${m.phone}${EXT[slip.contentType] ?? ''}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
