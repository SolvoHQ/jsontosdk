# jsontosdk

Paste a JSON sample → production-grade TypeScript interfaces + Zod schema, in ~2 seconds.
LLM-named (no `_C`, `_C1`, `_C2`), no signup, the URL is shareable.

**Live:** https://jsontosdk.vercel.app

## Why

`quicktype` produces unreadable type names. ChatGPT works but the result lives
in a chat — there's no permanence and no shareable URL. OpenAPI codegen only
works when the upstream publishes a spec, which most small SaaS, partner APIs,
internal endpoints, and MCP-server resource shapes don't.

jsontosdk is the LLM-first take: paste → typed SDK, named like a human wrote it.

## How it works

1. Paste one JSON response (≤ 100 KB).
2. The server (Astro endpoint on Vercel) forwards it to Claude Haiku 4.5 with
   a strict system prompt that produces:
   - `types.ts` — `export interface` declarations, PascalCase, child-first
     ordered, with comment hints for ISO dates / URLs / emails.
   - `schema.ts` — matching Zod schema, mirrors the interfaces.
3. The result is rendered in two copy-buttoned panels.
4. The paste is encoded into `#payload=<base64>` so the URL is shareable.

## v1 limits

- One sample per call (multi-sample union inference is v2).
- TypeScript + Zod only (Pydantic / Go / Rust are v3+).
- 100 KB input cap, 20 generations / hour / IP.
- No signup, no account, no DB.

## Local dev

```sh
cd code
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

## Stack

- Astro 5 (server output) on Vercel serverless
- `@anthropic-ai/sdk` calling `claude-haiku-4-5`
- Vanilla JS, no framework on the page
- In-memory IP rate limit (resets per cold start — fine for v1)

## License

MIT
