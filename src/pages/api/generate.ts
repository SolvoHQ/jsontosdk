import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

export const prerender = false;

const MAX_BYTES = 100 * 1024;
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You convert a single JSON sample into production-grade TypeScript types and a matching Zod schema.

Rules:
- Infer a sensible PascalCase name for the root type from context (singular noun: "User" if the shape looks like one user, "Post" if it looks like a post). Default to "Root" only if no name is plausible.
- Each nested object MUST become a separately-named interface, named after its key in the parent (singular form: "posts": [...] → Post[]). Snake_case keys keep their casing in field names but interfaces are PascalCase.
- Arrays of objects: emit the element interface and use ElementName[].
- Detect: ISO 8601 dates → "string  // ISO 8601 date" (keep type as string), URLs → "string  // URL", emails → "string  // email", enums → string literal unions when the sample suggests them (rare from one sample — only if obvious).
- Numbers: use \`number\` (TS has no separate int/float).
- Null fields: emit \`field: T | null\`. Missing fields are not nullable.
- Arrays of mixed primitives → union element type. Empty arrays → \`unknown[]\` with a comment.
- The Zod schema must mirror the interfaces exactly (z.object, z.array, z.string(), z.number(), z.boolean(), z.nullable(...) for nullables). Export each schema and infer the matching type via z.infer where useful, but the primary types come from the interfaces file.
- Output is JSON only (no markdown fences, no commentary outside the JSON), with shape: {"types": "<typescript code as a single string>", "schema": "<typescript code that imports z from 'zod'>"}.
- "types" file: only \`export interface\` declarations, ordered child-first so each interface is defined before it is referenced.
- "schema" file: starts with \`import { z } from "zod";\`, then \`export const FooSchema = z.object({...});\` declarations, child-first ordering.
- No trailing newlines beyond what's natural. No \`any\`. No leading explanation comments.`;

type Out = { types: string; schema: string };

export const POST: APIRoute = async ({ request }) => {
  return await respond(await parseRequest(request));
};

async function parseRequest(request: Request): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; json: string; ip: string }
> {
  const ip = getClientIp(request.headers);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, status: 400, error: 'Body must be JSON.' };
  }
  if (!body || typeof body !== 'object' || typeof (body as any).json !== 'string') {
    return { ok: false, status: 400, error: 'Expected {"json": "<json string>"}.' };
  }
  const json = (body as any).json as string;
  const bytes = new TextEncoder().encode(json).length;
  if (bytes === 0) return { ok: false, status: 400, error: 'JSON input is empty.' };
  if (bytes > MAX_BYTES) {
    return { ok: false, status: 413, error: `JSON exceeds 100 KB (${bytes} bytes).` };
  }
  try {
    JSON.parse(json);
  } catch (e: any) {
    return { ok: false, status: 400, error: 'Invalid JSON: ' + (e?.message || 'parse error') };
  }
  return { ok: true, json, ip };
}

async function respond(
  parsed:
    | { ok: false; status: number; error: string }
    | { ok: true; json: string; ip: string },
): Promise<Response> {
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const rl = rateLimit(parsed.ip);
  if (!rl.ok) {
    const mins = Math.ceil(rl.resetIn / 60000);
    return Response.json(
      { error: `Rate limit hit (20/hr). Try again in ~${mins} min.` },
      { status: 429 },
    );
  }
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC;
  if (!apiKey) {
    return Response.json(
      { error: 'Server misconfigured: ANTHROPIC key missing.' },
      { status: 500 },
    );
  }
  try {
    const out = await runClaude(apiKey, parsed.json);
    return Response.json(out, {
      headers: { 'x-ratelimit-remaining': String(rl.remaining) },
    });
  } catch (e: any) {
    const msg = e?.message || 'LLM call failed';
    return Response.json({ error: msg }, { status: 502 });
  }
}

async function runClaude(apiKey: string, json: string): Promise<Out> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: 'JSON sample:\n\n```json\n' + json + '\n```\n\nReturn only the JSON object as specified.',
      },
    ],
  });
  const textBlock = msg.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text in model response.');
  }
  const raw = textBlock.text.trim();
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed.types !== 'string' || typeof parsed.schema !== 'string') {
    throw new Error('Model returned malformed payload.');
  }
  return { types: parsed.types.trim(), schema: parsed.schema.trim() };
}

function extractJson(text: string): { types?: unknown; schema?: unknown } | null {
  // Tolerate ```json fences even though we tell the model not to use them.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Last-ditch: find first { and last }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
