# Vanguard Vault

**An AI shopping concierge for rare and archival clothing — that cannot buy anything.**

It secures. You decide.

A working proof of concept: a buyer describes a piece, an agent goes and looks
for it across the maker's own shop, the open web, and the resale marketplaces,
and reports back only what it could actually verify. Every purchase decision
stays a human tap. There is no checkout in this codebase and no way to add one
by accident.

Built by [Hardy Hyppolite](https://hardyh.com) — a designer, not an engineer.
The code was written with Claude Code; the product decisions, the interface, and
the constraints below are mine.

---

## The four rules

These were written before any code and are the reason the app looks the way it
does. Each one costs something, and that is the point.

**1. No purchase tool, ever. Approval is a human tap.**
The agent has thirteen tools. None of them buys. There is no payment
integration, no cart, no checkout, no stored card. Asked to buy something, the
concierge says plainly that it cannot. This is not a safety wrapper around a
purchasing agent — the capability was never built, which is a different and
stronger claim.

**2. Nothing is reported as available unless it was verified.**
Every candidate is fetched and read before it reaches the screen. If the page
states its availability in machine-readable form, that is what the card says. If
the shop refuses the read, the card says **"Stock not confirmed"** and the
concierge says so in words too. It is never allowed to infer availability from a
search snippet, a price, or a cached Google result.

**3. Every action is attributed.**
Anything the agent does is written to `decision_log` as `concierge`. Anything
the buyer does is written as `you`. The database enforces this: the client's
insert policy only permits rows where `actor = 'you'`, so the app physically
cannot write an entry claiming the agent did something.

**4. Unverifiable means failed.**
A piece cannot be approved until four source checks pass — that it is a real
retailer, that the size is in stock, that the price is the posted one, and that
returns are possible. A check that cannot be verified from the store's own page
counts as failed, not passed. The Approve button stays locked and says why.

---

## What it does

**Onboarding** asks two things: which brands you care about, and your sizes. No
budget, no "where should I look" — the whole premise is that the agent does the
searching, so a form that makes you specify the search defeats it. Named brands
are a standing watch list, not a fence: you can ask for anything.

**The concierge** takes a request in plain language and works. It can also take
a description rather than a name — "the shoe with the gold swoosh from that
video" — and identification becomes the job: it says what it thinks the piece
is, how confident it is, and shows you one so you can confirm.

**Results are cards, not prose.** Photograph, price, seller, an availability
chip, and one line of reasoning. Nothing is added to your watchlist by the
agent. You tap.

**A watched piece gets a detail page** with its four source checks, the evidence
behind each, and the approval gate — locked, with the reason on it.

---

## How the searching actually works

Three sources, in order of how much they can be trusted:

| Source | What it is | Availability |
|---|---|---|
| `search_shop` | The brand's own Shopify catalogue, via the public `/search/suggest.json` endpoint every Shopify store exposes | **Real.** The merchant's own inventory flag |
| `web_search` | Anthropic's server-side search, for everything a maker doesn't sell directly | Unknown — candidates only |
| `google_search` | Google's Custom Search index of 15 resale marketplaces that refuse to be read directly | **Never.** Index is a snapshot |

Then `read_listing` fetches each candidate and parses its schema.org
`Product`/`Offer` data — the only machine-readable statement of whether
something can still be bought. It returns `true`, `false`, or `null`, and
`null` is a real answer that reaches the screen intact.

The third row is the interesting one. eBay, StockX, GOAT, Grailed and the rest
return 403 to automated reads, and their terms say not to. **The app does not
work around that** — no user-agent spoofing, no headless rendering, no scraping
service. Instead it reads Google's public index of those pages, which yields
the photograph and often a price. What it never yields is stock, because a crawl
is weeks old, so those cards say "Stock not confirmed" and the reply says so.

A confident wrong answer is worse than an unconfirmed one. That sentence is in
the system prompt, and this table is what it looks like implemented.

---

## Architecture

```
React + TypeScript (Vite)          One Supabase edge function        Postgres
─────────────────────────          ──────────────────────────        ────────
src/App.tsx      routes            concierge/index.ts                RLS on
src/Piece.tsx    detail + gate       ├── system prompt               every
src/Profile.tsx  account            └── 13 tools, none of            table
src/Onboarding.tsx                      which purchases
src/ui.tsx       shared
src/lib/api.ts   ← the only file that touches the network
```

- **No router.** The route is a union in state. At six screens, a router is
  ceremony.
- **One network file.** `src/lib/api.ts` is the only module that calls Supabase
  or the concierge. Screens import from it and nothing else.
- **The agent loop lives server-side**, in a Supabase edge function, so the
  Anthropic key is never in the browser. The model is Claude Opus 5 with
  adaptive thinking — the loop is a planning problem, and the part that needs
  judgement is throwing away the near-misses.
- **RLS and GRANTs are separate layers.** Migration `0003` exists because the
  first version enabled row-level security and wrote policies without granting
  the table privileges those policies sit on top of. A rejected policy returns
  zero rows silently; a missing grant refuses the statement outright. They fail
  differently and both have to be right.

---

## Honest limitations

Stated plainly, because the whole project is an argument about not overclaiming:

- **The four source checks are a stub.** They mark themselves passed with
  evidence that says, in the row itself, `POC stub — not read from a live page.
  Do not trust in production.` The contract and the gate are real; the reads
  behind them are not built.
- **"Continuously monitored" is not real.** There is no background worker.
  Watching a piece records intent; nothing wakes up to check for a restock.
- **No marketplace API.** Availability on eBay and the rest needs the official
  eBay Browse API. Until then, those pieces are honestly marked unconfirmed.
- **Photo upload for identification** is designed for but not built. The
  architecture supports it — the model is multimodal.
- **One buyer.** Multi-user works via RLS, but nothing has been load-tested.

---

## Running it

```bash
npm install
npm run dev
```

The app expects a Supabase project with the migrations in `supabase/migrations/`
applied, and an edge function deployed from `supabase/functions/concierge/`.
That function needs three secrets set on the project: `ANTHROPIC_API_KEY`, and
`GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX` for a Google Programmable Search engine
scoped to the resale marketplaces.

---

## Design

Playfair Display and Inter, on cream. Bronze carries the brand and every link;
violet is reserved exclusively for actions only a human can take — the approval
gate, the human-decision markers. A colour that means "you, not the agent" is a
small thing that does a lot of work in an app whose entire proposition is where
the boundary sits.
