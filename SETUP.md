# Vanguard Vault POC — Getting It Running

Written for you, not for a developer. No GitHub needed for now. A folder
on your Mac is fine. You did all of these moves once already on HMN,
so nothing here is new, just in a new order.

## 1. Make the folder

Create a folder anywhere, call it `vanguard-vault`. Inside it, make this
shape and drop the three files where shown.

```
vanguard-vault/
  supabase/
    migrations/
      0001_init.sql          ← the schema file
    functions/
      concierge/
        index.ts             ← the concierge loop (rename concierge-index.ts to index.ts)
  src/
    lib/
      assistant-tools.ts     ← the tool definitions (used by the app later)
```

## 2. Create the Supabase project

Go to supabase.com, new project, call it `vanguard-vault`. Free tier is
fine for a POC. Save the database password somewhere safe when it asks.

## 3. Run the schema

Easiest path, no terminal. In the Supabase dashboard, open **SQL Editor**,
paste the entire contents of `0001_init.sql`, hit Run. If it says success,
the whole data model exists. Check **Table Editor** and you should see
eight tables.

## 4. Get a Claude API key

console.anthropic.com, create an API key. This is separate from your
claude.ai login. It's pay-per-use and a POC costs pocket change.

## 5. Deploy the concierge

This part needs the terminal, same as HMN's edge function did.

```bash
npm install -g supabase          # once, if you don't have it
cd vanguard-vault
supabase login
supabase link --project-ref <your-project-ref>   # ref is in the dashboard URL
supabase secrets set ANTHROPIC_API_KEY=<your key>
supabase functions deploy concierge
```

## 6. Sanity check

In the dashboard, **Authentication**, add yourself as a user with an email
and password. Then in **Table Editor**, add one row to `briefs` with your
user id and a body like `archival outerwear, size 42, ceiling $2400`, and
one row to `sources` naming a retailer.

The concierge is now live at
`https://<project-ref>.supabase.co/functions/v1/concierge`
and the chat screen we build next will talk to it.

## What is deliberately fake right now

The `run_source_check` tool marks every check as passed and says so in its
evidence text. That's the parked retail work. Everything else, the state
chain, the approval gate, the decision log, the hold rules, is real and
enforced by the database.

## What you can't lose

Nothing in this folder is precious yet except these three files, and you
have them in this chat too. When the folder starts having real work in it,
that's when we set up backups, GitHub or otherwise. Not today's problem.
