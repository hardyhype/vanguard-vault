// Vanguard Vault POC — assistant tool definitions
//
// These go in the `tools` array of the Messages API call. Claude decides
// when to call them. Your backend executes them against Supabase with
// service_role and writes every action to decision_log as 'concierge'.
//
// THE RULE THAT SHAPES EVERYTHING:
// There is no complete_purchase tool. Not disabled. Absent.
// The assistant cannot buy because buying is not in its vocabulary.
// Approval happens in the UI, by your tap, logged as 'you'.

import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const assistantTools: Tool[] = [
  {
    name: 'get_brief',
    description:
      'Read the standing brief. Call before matching or recommending anything. ' +
      'Never infer taste beyond what the brief says.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  {
    name: 'list_finds',
    description:
      'List current finds and their states. Call when the buyer asks what happened ' +
      'while they were away. Lead the answer with what was NOT purchased.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['found', 'holding', 'confirming', 'awaiting_approval', 'approved', 'expired', 'released'],
          description: 'Optional filter.',
        },
      },
      required: [],
    },
  },

  {
    name: 'record_find',
    description:
      'Record a discovered listing. Reasoning is required and is shown to the buyer ' +
      'verbatim under "Why this piece?". Only record listings from named sources.',
    input_schema: {
      type: 'object',
      properties: {
        source_id: { type: 'string' },
        title: { type: 'string' },
        url: { type: 'string' },
        size_label: { type: 'string' },
        price_cents: { type: 'integer' },
        reasoning: {
          type: 'string',
          description: 'Why this matches the brief. Traceable to the brief, no invented benefits.',
        },
      },
      required: ['source_id', 'title', 'url', 'reasoning'],
    },
  },

  {
    name: 'run_source_check',
    description:
      'Run one of the four source checks for a find: retailer, stock_in_size, ' +
      'posted_price, returns. Evidence must be read from the store page, never assumed. ' +
      'If it cannot be verified, the result is failed, not passed. ' +
      '(POC: backend stubs this; the tool contract stays the same when it goes live.)',
    input_schema: {
      type: 'object',
      properties: {
        find_id: { type: 'string' },
        kind: { type: 'string', enum: ['retailer', 'stock_in_size', 'posted_price', 'returns'] },
      },
      required: ['find_id', 'kind'],
    },
  },

  {
    name: 'start_hold',
    description:
      'Place a hold on a find. Requires a named counterparty and a real expiry, ' +
      'or the database rejects it. Never invent a countdown.',
    input_schema: {
      type: 'object',
      properties: {
        find_id: { type: 'string' },
        counterparty: { type: 'string', description: 'Who is holding it. A name, not "the system".' },
        expires_at: { type: 'string', description: 'ISO timestamp of the actual supplier-side hold.' },
      },
      required: ['find_id', 'counterparty', 'expires_at'],
    },
  },

  {
    name: 'request_approval',
    description:
      'Move a find to awaiting_approval and notify the buyer. Only call after all four ' +
      'source checks pass. Then stop. The decision is not yours.',
    input_schema: {
      type: 'object',
      properties: { find_id: { type: 'string' } },
      required: ['find_id'],
    },
  },

  {
    name: 'release_hold',
    description: 'Let a piece go, at the buyer\'s instruction or when a hold lapses.',
    input_schema: {
      type: 'object',
      properties: {
        find_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['find_id', 'reason'],
    },
  },

  {
    name: 'notify',
    description:
      'Send the buyer a push notification. Use for a new find, a completed check set, ' +
      'or an expiring hold. Copy states facts, never manufactures urgency.',
    input_schema: {
      type: 'object',
      properties: {
        body: { type: 'string' },
        find_id: { type: 'string' },
      },
      required: ['body'],
    },
  },
];

// System prompt sketch for the assistant loop. The constraint lives here
// AND in the schema trigger AND in the missing tool. Three layers.
export const SYSTEM_PROMPT = `You are the Vanguard Vault concierge for one buyer.

It secures. You decide. "You" is the buyer, never you.

Rules that are not negotiable:
- You search only sources the buyer has named.
- A source check that cannot be verified from the store's own page is failed, not passed.
- You never claim an item is available unless stock_in_size passed.
- Holds require a named counterparty. No counterparty, no countdown.
- After request_approval, you wait. You have no way to purchase, and you say so plainly if asked.
- When the buyer returns, say first what happened, and that nothing was purchased.`;
