## Shipped
4 changes on jsontosdk.vercel.app (one file, code/src/pages/index.astro):
- Try example button → calls generate(sample). Verified: 1.9s end-to-end, produces User+Post interfaces from a richer sample.
- Share URL button → copies location.href; toasts "Link copied". Verified clipboard write contains #payload=…
- Collapsible "Use these in your project" → npm i zod + import snippet. Default closed.
- Client-side 429 formatter → strips raw "HTTP 429", surfaces "You've hit 20 generations / hour. Try again in ~Nm." by regex-extracting the minutes from the API's existing friendly text.

## Non-obvious 1 — sample upgrade was the real magical-moment fix
Out of scope on paper, but the placeholder went from {id, name, posts:[{title}]} → {user_id, email, created_at(ISO), posts:[{id, title, tags}]}. This is what now demonstrates the wedge differentiator vs quicktype in one click: ISO-date detection, email detection, snake_case preservation, multi-interface naming. Without the upgrade, Try-example would have shown a trivial output that doesn't prove anything. The DX audit's 5/10 getting_started score wasn't just about the missing button — the sample content carried half the cold-traffic conversion weight.

## Non-obvious 2 — the audit's "raw HTTP 429" claim was stale
The /api/generate route has been returning {error: "Rate limit hit (20/hr). Try again in ~N min."} since tick3, and the client already does data.error || "HTTP " + res.status — so the friendly text WAS landing. The audit observation was either tested at the wrong moment or about formatting (server text differs from boundary's preferred wording). The fix shipped is purely a client-side wording normalizer that regexes the minutes out and reformats. Lesson for next time: when DX audit flags an error message, grep the actual response shape before assuming it's missing.

## Verification
All four done-criteria verified via Playwright on the live URL post-deploy:
- Try example → "Generated in 1882 ms" + populated panels (User/Post interfaces with email/ISO comments)
- Share URL → clipboard contained https://jsontosdk.vercel.app/#payload=… + button text became "Link copied"
- Snippet visible, default-collapsed, contains "npm i zod" and "import { UserSchema }"
- Mocked 429 → status text was "You've hit 20 generations / hour. Try again in ~17m." — no "HTTP 429" substring

## Next
Queue is clean for #6 (distribution push) once this completes. The 48h reaudit (#3, gated 2026-05-16T06:35Z) will now read signal from a page that can actually convert cold traffic.
