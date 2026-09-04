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
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are the Vanguard Vault concierge for one buyer.

It secures. You decide. "You" is the buyer, never you.

Rules that are not negotiable:
- You search only sources the buyer has named.
- A source check that cannot be verified from the store's own page is failed, not passed.
- You never claim an item is available unless stock_in_size passed.
- Holds require a named counterparty. No counterparty, no countdown.
- After request_approval, you wait. You have no way to purchase, and you say so plainly if asked.
- When the buyer returns, say first what happened, and that nothing was purchased.`;

// Tool schemas. Mirrors assistant-tools.ts. No purchase tool exists.
const TOOLS = [
  { name: 'get_brief', description: 'Read the standing brief.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'list_finds', description: 'List finds and their states. Lead with what was not purchased.', input_schema: { type: 'object', properties: { status: { type: 'string' } }, required: [] } },
  { name: 'record_find', description: 'Record a listing from a named source. Reasoning is shown verbatim.', input_schema: { type: 'object', properties: { source_id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, size_label: { type: 'string' }, price_cents: { type: 'integer' }, reasoning: { type: 'string' } }, required: ['source_id', 'title', 'url', 'reasoning'] } },
  { name: 'run_source_check', description: 'Run one source check. Unverifiable means failed. POC stub.', input_schema: { type: 'object', properties: { find_id: { type: 'string' }, kind: { type: 'string' } }, required: ['find_id', 'kind'] } },
  { name: 'start_hold', description: 'Hold a find. Needs a named counterparty and a real expiry.', input_schema: { type: 'object', properties: { find_id: { type: 'string' }, counterparty: { type: 'string' }, expires_at: { type: 'string' } }, required: ['find_id', 'counterparty', 'expires_at'] } },
  { name: 'request_approval', description: 'Move to awaiting_approval after all four checks pass, then stop.', input_schema: { type: 'object', properties: { find_id: { type: 'string' } }, required: ['find_id'] } },
  { name: 'release_hold', description: 'Let a piece go.', input_schema: { type: 'object', properties: { find_id: { type: 'string' }, reason: { type: 'string' } }, required: ['find_id', 'reason'] } },
  { name: 'notify', description: 'Push a factual notification. No manufactured urgency.', input_schema: { type: 'object', properties: { body: { type: 'string' }, find_id: { type: 'string' } }, required: ['body'] } },
];

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
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

  // Execute one tool call. Everything lands in decision_log first.
  async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
    const log = async (action: string, findId: string | null, detail: string) => {
      await supabase.from('decision_log').insert({
        profile_id: profileId, find_id: findId, actor: 'concierge', action, detail,
      });
    };

    switch (name) {
      case 'get_brief': {
        const { data } = await supabase.from('briefs')
          .select('body, ceiling_cents').eq('profile_id', profileId).eq('active', true);
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
          source_id: input.source_id,
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
  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
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

    if (data.stop_reason !== 'tool_use') {
      const text = data.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text).join('\n');
      return new Response(JSON.stringify({ reply: text }), {
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

  return new Response(JSON.stringify({ error: 'Tool loop exceeded 8 turns' }), {
    status: 500, headers: cors,
  });
});
