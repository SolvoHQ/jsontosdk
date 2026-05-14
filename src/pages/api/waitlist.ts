import type { APIRoute } from 'astro';
import { getClientIp } from '@/lib/rateLimit';
import { waitlistRateLimit } from '@/lib/waitlistRateLimit';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request.headers);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: 'Invalid email.' }, { status: 400 });
  }

  const rl = waitlistRateLimit(ip);
  if (!rl.ok) {
    const mins = Math.ceil(rl.resetIn / 60000);
    return Response.json(
      { error: `Rate limit hit (5/hr). Try again in ~${mins} min.` },
      { status: 429 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Server misconfigured: RESEND_API_KEY missing.' },
      { status: 500 },
    );
  }

  const ts = new Date().toISOString();
  const ua = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';
  const text = [
    `email: ${email}`,
    `timestamp: ${ts}`,
    `ip: ${ip}`,
    `user-agent: ${ua}`,
    `referer: ${referer}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: 'waitlist@west0n.top',
        to: ['agent+jsontosdk-waitlist@west0n.top'],
        subject: `jsontosdk waitlist: ${email}`,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return Response.json(
        { error: `Mail provider error (${res.status}): ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }
  } catch (e: any) {
    return Response.json(
      { error: 'Mail provider unreachable: ' + (e?.message || 'fetch failed') },
      { status: 502 },
    );
  }

  return Response.json(
    { ok: true },
    { headers: { 'x-ratelimit-remaining': String(rl.remaining) } },
  );
};
