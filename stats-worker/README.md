# JWalt Army play counter

Counts JWaltle plays per day: how many people started (made a first guess), won, and lost or gave up. Each browser counts once per day, and practice rounds are not counted. Nothing personal is stored, only the three daily totals.

It runs on Cloudflare's free tier: one Worker and one D1 database.

## Set-up (about 10 minutes, all in the Cloudflare dashboard)

1. **Create the database.** Storage & Databases → D1 SQL Database → Create. Name it `jwalt-stats`.
2. **Create the table.** Open `jwalt-stats` → Console, paste this and run it:

   ```sql
   CREATE TABLE plays (day TEXT NOT NULL, game TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, game, event));
   ```

3. **Create the Worker.** Compute (Workers) → Workers & Pages → Create → Start with Hello World. Name it `jwalt-stats` and deploy.
4. **Paste the code.** Open the Worker → Edit code, replace everything with the contents of `worker.js` from this folder, then Deploy.
5. **Connect the database.** Worker → Bindings → Add binding → D1 database. Variable name `DB`, database `jwalt-stats`. Save.
6. **(Optional) Keep the numbers private.** Worker → Settings → Variables and Secrets → Add, type Secret, name `STATS_KEY`, any value you like. The stats page then needs `?key=<that value>` on the end.
7. **Send the Worker's address** (shown at the top, for example `https://jwalt-stats.<your-account>.workers.dev`) so it can be added to the site as `STATS_URL`.

## Reading the numbers

- `https://jwalt-stats.<your-account>.workers.dev/` shows a table of the last 30 days.
- `/stats.json` gives the same as JSON.

Add `?key=…` to either if you set `STATS_KEY`.

## Notes

- Days are the player's own date, the same day their JWaltle puzzle belongs to.
- The counter only accepts requests for JWaltle's three events and dates within two days of today. Anyone who finds the address could still add fake plays, which is fine for a fan site but worth knowing.
