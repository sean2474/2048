import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function publicHealth(base: string) {
  try {
    const response = await fetch(new URL('/health', base), { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return { responding: response.ok && (await response.json()).ok === true, checkedAt: new Date().toISOString() };
  } catch { return { responding: false, checkedAt: new Date().toISOString() }; }
}

export async function GET() {
  let health: Awaited<ReturnType<typeof publicHealth>> | null = null;
  const reply = (status: number, error: string) => NextResponse.json({ error, health }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isSupabaseConfigured()) return reply(503, 'not_configured');
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || user.is_anonymous) return reply(401, 'authentication_required');
    const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== 'aal2') return reply(403, 'mfa_required');

    const role = await client.rpc('is_game_admin');
    const base = process.env.ADMIN_SOCKET_URL;
    if (role.error) {
      if (base) health = await publicHealth(base);
      return reply(503, 'admin_verification_unavailable');
    }
    if (role.data !== true) return reply(403, 'admin_access_required');
    if (!base) return reply(503, 'socket_not_configured');
    const { data: { session } } = await client.auth.getSession();
    if (!session) return reply(401, 'authentication_required');

    // The socket independently verifies this user token and current DB membership.
    const [status, details] = await Promise.allSettled([
      publicHealth(base),
      fetch(new URL('/admin/operations', base), {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      }),
    ]);
    if (status.status === 'fulfilled') health = status.value;
    if (details.status === 'rejected') return reply(503, 'socket_unreachable');
    const response = details.value;
    if (!response.ok) return reply(
      response.status === 401 || response.status === 403 ? response.status : 503,
      response.status === 403 ? 'admin_access_required' : 'socket_verification_unavailable',
    );
    return NextResponse.json({ ...await response.json(), health }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return reply(503, 'socket_unreachable'); }
}
