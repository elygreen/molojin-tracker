# Update Worker

A small Cloudflare Worker behind the site's **Update** button. It holds the
Riot API key (which can't live in the public site), fetches a player's latest
ranked solo games on demand, and returns them for the page to merge in.

- Only players listed in the site's `players.json` can be requested.
- Each player's result is cached for 60 seconds, so repeated clicks from anyone
  don't reach Riot.
- Only the site's origin (and `localhost`) may call it from a browser.
- Optional: with a GitHub token it also starts the "Update matches & deploy"
  workflow when it finds a new game, so the site's saved data catches up
  right away instead of on the next 15-minute run.

Cloudflare's free plan (100,000 requests/day) is plenty.

## Deploy

You need Node 22+ and a free Cloudflare account.

```bash
cd worker
npm install
npx wrangler login                     # opens a browser to sign in to Cloudflare
npx wrangler secret put RIOT_API_KEY   # paste the key, nothing else
npx wrangler deploy
```

`deploy` prints the Worker's URL, e.g.
`https://ranked-grind-update.<your-subdomain>.workers.dev`. Put it in
`public/config.json` at the repo root and push:

```json
{ "updateUrl": "https://ranked-grind-update.<your-subdomain>.workers.dev" }
```

### Optional: save new games to the site immediately

1. On GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**. Repository access: only this
   repo. Permissions: **Actions: Read and write**. Nothing else.
2. `npx wrangler secret put GITHUB_TOKEN` and paste it.

## Keeping it working

A Riot *development* key expires every 24 hours. Each time you renew it, update
it in both places: the GitHub `RIOT_API_KEY` repository secret and
`npx wrangler secret put RIOT_API_KEY`. A Riot *Personal API Key* doesn't expire.

If the site moves (a custom domain, or a renamed repo), update `SITE_URL` and
`ALLOWED_ORIGINS` in `wrangler.toml` and run `npx wrangler deploy` again.
