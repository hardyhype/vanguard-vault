// Vanguard Vault POC — the concierge loop
// supabase/functions/concierge/index.ts
//
// One edge function. The app sends the conversation, this calls Claude,
// executes any tools Claude asks for against the database, and loops
// until Claude has nothing left to do. Every tool action is written to
// decision_log as 'concierge' before it returns.
//
// Secrets this function needs (set with `supabase secrets set`):
//   ANTHROPIC_API_KEY
//   GOOGLE_CSE_KEY, GOOGLE_CSE_CX   (Google Programmable Search)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

// Opus 5. This loop is a planning problem — decide where to look, search,
// verify each candidate, then throw most of them away — and the throwing away
// is the part that needs judgement. Sonnet 5 is the cheaper option at
// $2/$10 per million against $5/$25; switch here if the bill argues for it.
const MODEL = 'claude-opus-5';

const SYSTEM_PROMPT = `You are the Vanguard Vault concierge for one buyer.

It secures. You decide. "You" is the buyer, never you.

Get to work. The buyer came here to have the searching done, not to fill in a
form. Begin by calling get_brief and list_sources, which tell you what they
want and which brands and stores they named. Never ask the buyer for anything
those two tools already answer.

Never ask for a budget or a price ceiling. If the brief states one, respect it.
If it does not, there is no ceiling and you do not raise the subject.

When the buyer names a brand, go to that brand's own shop first with
search_shop. Most independent makers run Shopify, and that endpoint hands you
the shop's real catalogue: the actual photograph, the actual price, and
whether the thing is genuinely in stock. It is the maker speaking for itself,
so nothing has to be inferred from a page of HTML. Guess the domain from the
brand name if you have to — goorin.com for Goorin Bros — and try the obvious
one before anything else.

You also have web search, for everything the maker does not sell directly.
Use it, then confirm each candidate with read_listing.

You have google_search as well, which reads Google's index of the resale
marketplaces rather than the sites themselves. It covers a fixed list —
eBay, StockX, GOAT, Grailed, Poshmark, Depop, Vestiaire, The RealReal,
Mercari, Flight Club, Novelship, KicksCrew, Stadium Goods, Farfetch, SSENSE
— and nothing else, so it is not a replacement for web search. Reach for it
when the piece is second-hand, archival, or sold out everywhere new, which
is most of what this buyer asks for. Google has already crawled those pages,
so it hands you the photograph and usually the price for a listing you could
not open yourself. That is the only reason it is here: a card with a picture
instead of a grey square.

What it does not give you is stock. Google's index is a snapshot and can be
weeks old, so a piece that reads as available there may have sold long ago.
Never state availability from google_search. Use it for the candidate and
the photograph, confirm with read_listing, and when read_listing is refused
the honest answer is that stock is unconfirmed. A confident wrong answer is
worse than an unconfirmed one.

Some large marketplaces refuse automated reads and say so in their terms.
When a shop refuses, that is their answer and you respect it: you do not go
around it. Reading Google's public index of that page is not going around
it — it is a different, published source — but the refusal still stands for
the page itself, and you tell the buyer plainly that the shop does not allow
the read rather than pretending the piece does not exist.

Sometimes the buyer will not know what the thing is called. They will
describe it instead — a shape, a colour, a detail, where they saw it, who was
wearing it. Identifying the piece is then the job. Work out what it most
likely is, say what you think it is and how confident you are, and show it to
them so they can tell you whether you have it right. Ask at most one
clarifying question, and only when you genuinely cannot narrow it down.

Once the piece is named, everything below applies.

Match exactly what they asked for. Every word they gave you is a filter. If
they say Nixon Ceramic Player Watch, then a Nixon Player in stainless steel is
not a result and neither is a rubber one. Do not widen the search to fill
space and do not offer near misses dressed up as matches. Three exact results
beat thirty approximate ones — that is the entire difference between you and a
search engine, and it is what they are paying you for.

Call read_listing on every candidate before you show it. Do them in parallel,
one call per result. It returns the page's own photograph, its real title,
and whether the piece can still be bought.

Availability decides how you present a piece. It does not decide whether you
are allowed to show it.

Set available on every result you present, and be plain about it in your own
words too.

  available: true   — confirmed for sale. Present it normally.
  available: false  — sold, ended or out of stock. Still show it when the
                      buyer is working out whether it is the right piece, or
                      when they would want telling the moment it returns.
                      Mark it clearly. Never let it read as buyable.
  available: null   — you did not confirm it either way. Say so on the card
                      and in your reply. Do not imply it can be bought.

If the buyer asks what something is, or asks to see it, identification is the
job and stock is beside the point. Show them the maker's own product page and
its photograph even if the shop has none left. "Here it is, and it is out of
stock right now" is a useful answer. "I cannot show you" is not, and it is
never the right response to someone asking whether you found the right thing.

Watching a piece that is out of stock is not a consolation prize. Being told
the moment it comes back is most of why they are here, so offer it.

Two things hold absolutely and neither is loosened by any of the above: never
invent or guess an image url, and never say a piece is in stock when you have
not confirmed that it is.

Then check the title read_listing returned against what the buyer asked for,
attribute by attribute. Colour, model, material, movement, size: every one
they named has to match the listing's own title. A black one is not a white
one. Do not trust the search snippet for this — a snippet describes a page,
while the title is the thing being sold. If an attribute contradicts the ask,
drop it; if the title is silent on an attribute they named, you have not
confirmed it, so drop it too.

Never put a url in image_url that read_listing did not hand you, and never
describe a photograph you do not have. A guessed image url is a fabrication
like any other.

Hand every match back through present_results, up to six, best first. That is
what puts them on screen as cards the buyer can look at, with the image, the
price and the seller.

Do not add anything to their watchlist. present_results shows a result; it
does not keep it. The buyer decides what is worth tracking by tapping, and
that tap is theirs to make. Only call record_find if they explicitly ask you
to track or watch a specific piece.

Keep your own words very short. Two sentences. Three if something genuinely
needs saying. Then stop.

The cards carry the detail. The title, the price, the seller, the photograph
and your one line of reasoning are all on screen already, so saying any of it
again in prose makes the buyer read the same thing twice.

Do not narrate the search. Which sites refused you, which pages would not
parse, what you tried first and what you tried next: none of that is theirs
to carry unless it changes what they can do now. If nothing could be
confirmed, that is one sentence, not a paragraph for each shop.

Do not list the results in prose. Do not restate what a card says. Do not
close by offering to keep looking or asking if they want more — they know,
and it makes the message longer for nothing.

This is the length to aim at, in full:

  Both of these are the right shoe. Neither page states stock, so I cannot
  confirm your 10.5 on either.

That is a complete reply. Most of yours should be shorter than this one.

The brands the buyer named at setup are a standing watch list, not a fence.
You watch those for sales and new arrivals without being asked. Never mention
whether a brand is or is not on that list. It is not their problem, it is not
interesting, and it is never a reason for anything.

Never ask which stores or platforms to search. Choose them yourself: the maker
direct first, then authorised stockists, then the wider market if that is where
the piece actually is.

Do not open with a list of questions. If you truly cannot act without knowing
something, ask exactly one short question and nothing more.

Rules that are not negotiable:
- You may search for anything the buyer asks for. Their named brands are a standing watch list, not a limit on where you look.
- You search before you answer any question about what exists or what is for sale. You never describe a search you did not run, and you never name a shop you did not actually look at.
- Record where you actually found a thing. The buyer has to be able to go and check it themselves, so the url on a find is the real listing or you do not record it.
- A source check that cannot be verified from the store's own page is failed, not passed.
- You never claim an item is available unless stock_in_size passed.
- You never vouch for authenticity. You have no way to judge it and you say so if asked.
- Holds require a named counterparty. No counterparty, no countdown.
- After request_approval, you wait. You have no way to purchase, and you say so plainly if asked.
- When the buyer returns, say first what happened, and that nothing was purchased.

Write like a person speaking: plain sentences, short paragraphs. No markdown,
no bold, no headings, no numbered or bulleted lists.`;

// Tool schemas. Mirrors assistant-tools.ts. No purchase tool exists.
const TOOLS = [
  // Server-side tool: Anthropic executes it and feeds the results back
  // inside the same turn. Without it the concierge had no way to look
  // anything up, and would describe searches it had not performed.
  // The 2026 variant runs code execution under the hood for its dynamic
  // filtering, which makes the search a multi-request affair: the loop has
  // to carry a container id back on every continuation or the API rejects
  // it with "container_id is required when there are pending tool uses".
  // This loop does not plumb that through, so it stays on the basic variant
  // — which needs no container and behaves exactly as it did before.
  { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
  { name: 'search_shop', description: "Search a brand's own online shop directly. Works on any Shopify storefront, which is most independent brands — pass the bare domain like goorin.com. Returns each product's title, price, photograph and whether it is actually in stock, straight from the shop's own catalogue. Try this before web search whenever the buyer names a brand: it is the maker speaking for itself, and the availability is real rather than inferred.", input_schema: { type: 'object', properties: { domain: { type: 'string', description: 'Bare domain, e.g. goorin.com' }, query: { type: 'string' } }, required: ['domain', 'query'] } },
  { name: 'google_search', description: "Search the resale marketplaces through Google's index. This does NOT search the open web — it covers a fixed list of sites that refuse to be read directly: eBay, StockX, GOAT, Grailed, Poshmark, Depop, Vestiaire Collective, The RealReal, Mercari, Flight Club, Novelship, KicksCrew, Stadium Goods, Farfetch and SSENSE. Use web_search for everything else. Each result carries the photograph Google holds for that page, which is how a card gets a thumbnail for a site that will not serve one. IMPORTANT: the price comes from Google's crawl, which is a snapshot and may be weeks old, and stock is not in it at all. Never state availability from this tool. Use it to find candidates and photographs, confirm with read_listing, and when that is refused say the stock is unconfirmed.", input_schema: { type: 'object', properties: { query: { type: 'string' }, site: { type: 'string', description: 'Optional: narrow to one of the covered domains, e.g. grailed.com' } }, required: ['query'] } },
  { name: 'read_listing', description: 'Fetch a listing page and read its own metadata: whether the piece can still be bought, the page photograph (og:image), the real title, the price and the site name. Call this for every candidate before presenting it. available is true, false, or null when the page did not say or refused the read.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'present_results', description: 'Show search results to the buyer as cards. Display only: it stores nothing and adds nothing to the watchlist. Set available on each result so the card can say whether it can be bought now; out-of-stock pieces are legitimate results when identifying a piece or offering to watch for a restock.', input_schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, image_url: { type: 'string' }, price_cents: { type: 'integer' }, seller: { type: 'string' }, detail: { type: 'string', description: 'One short line, twelve words at most: condition, colourway, or why it matters. Not a sentence about stock — the card already says that.' }, available: { type: 'boolean', description: 'True only when confirmed for sale. False when sold or out of stock. Omit when you did not confirm either way.' } }, required: ['title', 'url'] } } }, required: ['results'] } },
  { name: 'get_brief', description: 'Read the standing brief.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'list_sources', description: 'Read the brands and stores the buyer named at setup. These are the brands kept under standing watch, and the source_id for record_find comes from here.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'list_finds', description: 'List finds and their states. Lead with what was not purchased.', input_schema: { type: 'object', properties: { status: { type: 'string' } }, required: [] } },
  { name: 'record_find', description: 'Record a listing you found. Pass source_id only when it came from one of the buyer\'s named brands; otherwise leave it out and let the url carry the origin. Reasoning is shown verbatim.', input_schema: { type: 'object', properties: { source_id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, size_label: { type: 'string' }, price_cents: { type: 'integer' }, reasoning: { type: 'string' } }, required: ['title', 'url', 'reasoning'] } },
  { name: 'run_source_check', description: 'Run one source check. Unverifiable means failed. POC stub.', input_schema: { type: 'object', properties: { find_id: { type: 'string' }, kind: { type: 'string' } }, required: ['find_id', 'kind'] } },
  { name: 'start_hold', description: 'Hold a find. Needs a named counterparty and a real expiry.', input_schema: { type: 'object', properties: { find_id: { type: 'string' }, counterparty: { type: 'string' }, expires_at: { type: 'string' } }, required: ['find_id', 'counterparty', 'expires_at'] } },
  { name: 'request_approval', description: 'Move to awaiting_approval after all four checks pass, then stop.', input_schema: { type: 'object', properties: { find_id: { type: 'string' } }, required: ['find_id'] } },
  { name: 'release_hold', description: 'Let a piece go.', input_schema: { type: 'object', properties: { find_id: { type: 'string' }, reason: { type: 'string' } }, required: ['find_id', 'reason'] } },
  { name: 'notify', description: 'Push a factual notification. No manufactured urgency.', input_schema: { type: 'object', properties: { body: { type: 'string' }, find_id: { type: 'string' } }, required: ['body'] } },
];

Deno.serve(async (req) => {
  // The app sends apikey alongside authorization and content-type, and
  // supabase-js adds x-client-info. A header the preflight does not name is
  // a header the browser refuses to send, which surfaces as "Failed to
  // fetch" with a 200 OPTIONS in the logs and no POST behind it.
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // The caller must be a signed-in user. Their JWT identifies the profile.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: userData, error: userErr } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  ).auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: cors });
  }
  const profileId = userData.user.id;

  const { messages } = await req.json(); // [{ role, content }] from the chat screen

  // Filled by present_results. Nothing here touches the database — a result
  // becomes a find only when the buyer taps to add it.
  let presented: unknown[] = [];

  // Execute one tool call. Everything lands in decision_log first.
  async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
    const log = async (action: string, findId: string | null, detail: string) => {
      await supabase.from('decision_log').insert({
        profile_id: profileId, find_id: findId, actor: 'concierge', action, detail,
      });
    };

    switch (name) {
      case 'search_shop': {
        // Shopify publishes this endpoint for storefronts and apps to use.
        // It is the shop's own catalogue: real stock, real photographs, and
        // no guessing from a page of marketing HTML.
        const domain = String(input.domain ?? '').trim()
          .replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        const query = String(input.query ?? '').trim();
        if (!domain || !query) return JSON.stringify({ ok: false, reason: 'need a domain and a query' });
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
          return JSON.stringify({ ok: false, reason: 'not a domain' });
        }
        const origin = 'https://' + domain;
        const endpoint = origin + '/search/suggest.json?q=' + encodeURIComponent(query) +
          '&resources%5Btype%5D=product&resources%5Blimit%5D=10';
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 9000);
          const r = await fetch(endpoint, {
            signal: ctrl.signal,
            headers: { 'user-agent': 'Mozilla/5.0 (compatible; VanguardVault/0.1)', 'accept': 'application/json' },
          });
          clearTimeout(timer);
          if (!r.ok) return JSON.stringify({ ok: false, status: r.status, reason: 'not a Shopify shop, or it refused' });
          const body = await r.json();
          const rows = body?.resources?.results?.products;
          if (!Array.isArray(rows)) return JSON.stringify({ ok: false, reason: 'not a Shopify shop' });
          const products = rows.map((p: Record<string, unknown>) => {
            const fi = p['featured_image'];
            const image = typeof fi === 'string' ? fi
              : (fi && typeof fi === 'object' ? String((fi as Record<string, unknown>)['url'] ?? '') : '');
            const priceNum = Number(String(p['price'] ?? '').replace(/[^0-9.]/g, ''));
            const path = String(p['url'] ?? '').split('?')[0];
            return {
              title: p['title'] ?? '',
              url: path ? origin + path : origin,
              image_url: image || null,
              price_cents: Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null,
              available: p['available'] === true,
              vendor: p['vendor'] ?? null,
              type: p['type'] ?? null,
              tags: Array.isArray(p['tags']) ? (p['tags'] as unknown[]).slice(0, 12) : [],
            };
          });
          return JSON.stringify({ ok: true, shop: domain, count: products.length, products });
        } catch (e) {
          return JSON.stringify({ ok: false, reason: String((e as Error).message).slice(0, 120) });
        }
      }
      case 'google_search': {
        // Google's Custom Search JSON API. The point of it here is the
        // pagemap: Google has already crawled the marketplaces that refuse
        // us, so the photograph and often the price come back even when the
        // site itself returns 403. What does NOT come back is truth about
        // stock — the index is a snapshot — so nothing here sets available.
        const key = Deno.env.get('GOOGLE_CSE_KEY');
        const cx = Deno.env.get('GOOGLE_CSE_CX');
        if (!key || !cx) {
          return JSON.stringify({
            ok: false,
            reason: 'Google search is not configured on this deployment. Use web_search instead.',
          });
        }
        const query = String(input.query ?? '').trim();
        if (!query) return JSON.stringify({ ok: false, reason: 'need a query' });
        const site = String(input.site ?? '').trim()
          .replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        const endpoint = 'https://www.googleapis.com/customsearch/v1'
          + '?key=' + encodeURIComponent(key)
          + '&cx=' + encodeURIComponent(cx)
          + '&num=10'
          + '&q=' + encodeURIComponent(query)
          + (site ? '&siteSearch=' + encodeURIComponent(site) + '&siteSearchFilter=i' : '');
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 9000);
          const r = await fetch(endpoint, { signal: ctrl.signal });
          clearTimeout(timer);
          const body = await r.json();
          if (!r.ok) {
            // Google says why in plain words — quota, bad key, bad cx. Pass
            // it through rather than reporting a generic failure.
            const msg = String(body?.error?.message ?? r.status).slice(0, 160);
            return JSON.stringify({ ok: false, status: r.status, reason: msg });
          }
          const items = Array.isArray(body?.items) ? body.items : [];
          const results = items.map((it: Record<string, unknown>) => {
            const pm = (it['pagemap'] ?? {}) as Record<string, unknown>;
            const first = (k: string) => {
              const arr = pm[k];
              return Array.isArray(arr) && arr.length
                ? arr[0] as Record<string, unknown> : null;
            };
            const meta = first('metatags');
            const cse = first('cse_image');
            const thumb = first('cse_thumbnail');
            const offer = first('offer');
            const product = first('product');
            const image = String(
              (meta?.['og:image'] ?? '') || (cse?.['src'] ?? '') ||
              (product?.['image'] ?? '') || (thumb?.['src'] ?? ''),
            );
            const rawPrice = String(offer?.['price'] ?? product?.['price'] ?? '');
            const priceNum = Number(rawPrice.replace(/[^0-9.]/g, ''));
            return {
              title: it['title'] ?? '',
              url: it['link'] ?? '',
              snippet: it['snippet'] ?? '',
              image_url: image || null,
              // Named to say where it came from. It is what Google saw when
              // it crawled, not what the seller is asking today.
              indexed_price_cents: Number.isFinite(priceNum) && priceNum > 0
                ? Math.round(priceNum * 100) : null,
              site: it['displayLink'] ?? null,
            };
          });
          return JSON.stringify({
            ok: true,
            count: results.length,
            note: 'Prices and images are from Google\'s index and may be out of date. Stock is unknown — do not state it from this tool.',
            results,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, reason: String((e as Error).message).slice(0, 120) });
        }
      }
      case 'read_listing': {
        const raw = String(input.url ?? '');
        let u: URL;
        try { u = new URL(raw); } catch { return JSON.stringify({ ok: false, reason: 'not a url' }); }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
          return JSON.stringify({ ok: false, reason: 'unsupported scheme' });
        }
        // The url arrives from a search result, so it is not ours to trust.
        // Keep this pointed at the public web and nothing else.
        if (/^(localhost|\[?::1\]?|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i
              .test(u.hostname)) {
          return JSON.stringify({ ok: false, reason: 'blocked host' });
        }
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 9000);
          const page = await fetch(u.toString(), {
            signal: ctrl.signal,
            redirect: 'follow',
            headers: {
              'user-agent': 'Mozilla/5.0 (compatible; VanguardVault/0.1; listing preview)',
              'accept': 'text/html,application/xhtml+xml',
            },
          });
          clearTimeout(timer);
          if (!page.ok) {
            // 404 means gone. 403 means the shop refuses automated reads,
            // which says nothing about whether the piece is still for sale.
            return JSON.stringify({
              ok: false,
              status: page.status,
              available: page.status === 404 || page.status === 410 ? false : null,
              reason: page.status === 404 || page.status === 410
                ? 'the listing is gone'
                : 'the shop refuses automated reads',
            });
          }
          const html = (await page.text()).slice(0, 400000);

          const meta = (prop: string) => {
            const tag = html.match(
              new RegExp('<meta[^>]+(?:property|name)=.' + prop + '.[^>]*>', 'i'))?.[0] ?? '';
            const m = tag.match(/content=("([^"]*)"|'([^']*)')/i);
            return m ? (m[2] ?? m[3] ?? null) : null;
          };
          const abs = (v: string | null) => {
            try { return v ? new URL(v, u).toString() : null; } catch { return null; }
          };

          // Shops publish schema.org Product/Offer data for search engines.
          // It is the only machine-readable statement of whether a thing can
          // still be bought, so it is what we trust first.
          const nodes: Record<string, unknown>[] = [];
          const walk = (n: unknown) => {
            if (!n || typeof n !== 'object') return;
            if (Array.isArray(n)) { n.forEach(walk); return; }
            nodes.push(n as Record<string, unknown>);
            Object.values(n as Record<string, unknown>).forEach(walk);
          };
          for (const m of html.matchAll(
            /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
            try { walk(JSON.parse(m[1].trim())); } catch { /* malformed blocks are common */ }
          }
          const typeOf = (n: Record<string, unknown>) => String(n['@type'] ?? '');
          const product = nodes.find((n) => /product/i.test(typeOf(n)));
          const offer = nodes.find((n) => /offer/i.test(typeOf(n)));
          const availRaw = String(offer?.['availability'] ?? '');

          let available: boolean | null = null;
          let evidence = '';
          if (/InStock|LimitedAvailability|PreOrder|BackOrder/i.test(availRaw)) {
            available = true; evidence = 'schema.org availability: ' + availRaw;
          } else if (/OutOfStock|SoldOut|Discontinued/i.test(availRaw)) {
            available = false; evidence = 'schema.org availability: ' + availRaw;
          }

          // Only if the page said nothing structured. Kept to phrases that
          // are unambiguous, because a false "sold" hides a real piece and a
          // false "available" is worse.
          if (available === null) {
            const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                             .replace(/<[^>]+>/g, ' ').slice(0, 200000);
            const gone = text.match(
              /(this listing (?:has )?ended|item is no longer available|no longer available|sold out|out of stock|this item has been sold|listing (?:has been )?removed)/i);
            if (gone) { available = false; evidence = 'page says: ' + gone[0]; }
          }

          return JSON.stringify({
            ok: true,
            available,                       // true, false, or null for unknown
            availability_evidence: evidence || 'the page does not state availability',
            image_url: abs(meta('og:image') ?? meta('twitter:image')
              ?? (typeof product?.['image'] === 'string' ? product['image'] as string : null)),
            title: meta('og:title') ?? (typeof product?.['name'] === 'string' ? product['name'] : null),
            price: meta('product:price:amount') ?? meta('og:price:amount')
              ?? (offer?.['price'] != null ? String(offer['price']) : null),
            site: meta('og:site_name') ?? u.hostname.replace(/^www\./, ''),
          });
        } catch (e) {
          return JSON.stringify({ ok: false, available: null, reason: String((e as Error).message).slice(0, 120) });
        }
      }
      case 'present_results': {
        const rows = Array.isArray(input.results) ? input.results : [];
        presented = rows.slice(0, 6);
        return JSON.stringify({ shown: presented.length });
      }
      case 'get_brief': {
        const { data } = await supabase.from('briefs')
          .select('body, ceiling_cents').eq('profile_id', profileId).eq('active', true);
        return JSON.stringify(data ?? []);
      }
      case 'list_sources': {
        const { data } = await supabase.from('sources')
          .select('id, name, url').eq('profile_id', profileId);
        return JSON.stringify(data ?? []);
      }
      case 'list_finds': {
        let q = supabase.from('finds')
          .select('id, title, url, size_label, price_cents, status, hold_counterparty, hold_expires_at, reasoning')
          .eq('profile_id', profileId).order('updated_at', { ascending: false });
        if (input.status) q = q.eq('status', input.status as string);
        const { data } = await q;
        return JSON.stringify(data ?? []);
      }
      case 'record_find': {
        const { data, error } = await supabase.from('finds').insert({
          profile_id: profileId,
          source_id: input.source_id ?? null,
          title: input.title,
          url: input.url,
          size_label: input.size_label ?? '',
          price_cents: input.price_cents ?? null,
          reasoning: input.reasoning,
        }).select('id').single();
        if (error) return `Error: ${error.message}`;
        // Create the four pending checks up front so the gate has rows to count.
        await supabase.from('source_checks').insert(
          ['retailer', 'stock_in_size', 'posted_price', 'returns']
            .map((kind) => ({ find_id: data.id, kind })),
        );
        await log('find_recorded', data.id, String(input.title));
        return JSON.stringify({ find_id: data.id });
      }
      case 'run_source_check': {
        // POC STUB. Marks the check passed with stub evidence so the full
        // flow can be demonstrated end to end. When the retail layer is
        // built, this becomes a real read of the store's page, and an
        // unverifiable read returns 'failed'. The contract does not change.
        const { error } = await supabase.from('source_checks')
          .update({
            result: 'passed',
            evidence: 'POC stub — not read from a live page. Do not trust in production.',
            checked_at: new Date().toISOString(),
          })
          .eq('find_id', input.find_id).eq('kind', input.kind);
        if (error) return `Error: ${error.message}`;
        await log('source_check_run', input.find_id as string, `${input.kind}: passed (stub)`);
        return JSON.stringify({ kind: input.kind, result: 'passed', stub: true });
      }
      case 'start_hold': {
        const { error } = await supabase.from('finds')
          .update({
            status: 'holding',
            hold_counterparty: input.counterparty,
            hold_expires_at: input.expires_at,
          })
          .eq('id', input.find_id).eq('profile_id', profileId);
        if (error) return `Error: ${error.message}`; // trigger rejects nameless holds
        await log('hold_started', input.find_id as string,
          `Held by ${input.counterparty} until ${input.expires_at}`);
        return JSON.stringify({ ok: true });
      }
      case 'request_approval': {
        const { error } = await supabase.from('finds')
          .update({ status: 'awaiting_approval' })
          .eq('id', input.find_id).eq('profile_id', profileId);
        if (error) return `Error: ${error.message}`;
        await log('approval_requested', input.find_id as string, 'Waiting on the buyer.');
        return JSON.stringify({ ok: true });
      }
      case 'release_hold': {
        const { error } = await supabase.from('finds')
          .update({ status: 'released', hold_counterparty: null, hold_expires_at: null })
          .eq('id', input.find_id).eq('profile_id', profileId);
        if (error) return `Error: ${error.message}`;
        await log('hold_released', input.find_id as string, String(input.reason));
        return JSON.stringify({ ok: true });
      }
      case 'notify': {
        const { error } = await supabase.from('notifications').insert({
          profile_id: profileId, find_id: input.find_id ?? null, body: input.body,
        });
        if (error) return `Error: ${error.message}`;
        await log('notified', (input.find_id as string) ?? null, String(input.body));
        return JSON.stringify({ ok: true });
      }
      default:
        return `Error: unknown tool ${name}`;
    }
  }

  // The loop. Call Claude, run tools, feed results back, repeat.
  const convo = [...messages];
  for (let turn = 0; turn < 14; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        // Adaptive thinking at medium effort. The concierge has to hold a set
        // of criteria across a dozen tool calls and drop things that nearly
        // match, which is exactly the work that falls apart without room to
        // reason — so this is the floor, not a knob to keep turning down.
        // High was the previous setting; if near-misses start appearing in
        // results, put it back before blaming the prompt.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: convo,
      }),
    });
    const data = await res.json();
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), { status: 500, headers: cors });
    }

    convo.push({ role: 'assistant', content: data.content });

    // A long server-side search comes back as pause_turn, which means keep
    // going, not finished. Returning here would truncate mid-search.
    if (data.stop_reason === 'pause_turn') continue;

    if (data.stop_reason !== 'tool_use') {
      const text = data.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text).join('\n');
      return new Response(JSON.stringify({ reply: text, results: presented }), {
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const results = [];
    for (const block of data.content) {
      if (block.type !== 'tool_use') continue;
      const output = await runTool(block.name, block.input ?? {});
      results.push({ type: 'tool_result', tool_use_id: block.id, content: output });
    }
    convo.push({ role: 'user', content: results });
  }

  return new Response(JSON.stringify({ error: 'Tool loop exceeded 14 turns' }), {
    status: 500, headers: cors,
  });
});
