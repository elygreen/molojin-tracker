# The Ranked Grind

An op.gg-style tracker for League of Legends **ranked solo/duo** games, built with
Angular and hosted on GitHub Pages.

## How it works

GitHub Pages only serves static files, and Riot's API key must never ship to the
browser. So the data is fetched ahead of time:

1. `.github/workflows/update-and-deploy.yml` runs every ~15 minutes (and on every
   push to `main`).
2. It runs `scripts/fetch-matches.mjs` with the `RIOT_API_KEY` repository secret.
   The script pulls rank + queue-420 (ranked solo) matches for everyone in
   `public/players.json` and commits the result to `public/data/<id>.json`.
3. The Angular site is built and deployed to Pages; it just reads those JSON files.

## Setup

1. **Settings → Secrets and variables → Actions → New repository secret**:
   name `RIOT_API_KEY`, value your key from https://developer.riotgames.com.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Update matches & deploy → Run workflow**.

> Development keys expire every 24 hours. For a tracker that keeps updating on
> its own, register a *Personal API Key* on the Riot developer portal and put
> that in the secret instead.

## Adding a friend

Add an entry to `public/players.json` and push — a new tab appears once the
next workflow run fetches their games:

```json
{ "id": "friend", "gameName": "Name", "tagLine": "NA1", "platform": "na1", "region": "americas" }
```

`id` becomes the URL (`#/friend`). `platform`/`region` are Riot routing values
(`na1`/`americas`, `euw1`/`europe`, `kr`/`asia`, …).

## Local development

```bash
npm install
npm start                                         # http://localhost:4200
RIOT_API_KEY=... node scripts/fetch-matches.mjs   # refresh data locally
```

Never commit the API key — it lives only in the Actions secret.

## Notes

- LP per game isn't in Riot's API. It's inferred when exactly one game was
  played between two workflow runs, so some games show no LP change.
- The first run fetches up to 90 matches (dev-key rate limits); later runs keep
  backfilling up to 300.
