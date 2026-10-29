// JWalt Army play counter: a Cloudflare Worker backed by a D1 database (binding name: DB).
//
// POST /hit?g=jwaltle&e=start&d=2026-10-29   add one to that day's count
// GET  /                                     table of the last 30 days
// GET  /stats.json                           the same as JSON
//
// Set a STATS_KEY secret to make the stats pages need ?key=<your key>.
// Table (run once in the D1 console):
//   CREATE TABLE plays (day TEXT NOT NULL, game TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, game, event));

const SITE = "https://jwaltfanarmy.co.uk";
const GAMES = { jwaltle: ["start", "win", "loss"] };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const cors = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/hit" && request.method === "POST") {
      const g = url.searchParams.get("g"), e = url.searchParams.get("e"), d = url.searchParams.get("d");
      if (!GAMES[g] || !GAMES[g].includes(e) || !DAY.test(d || "")) return new Response("bad request", { status: 400, headers: cors });
      // Players' own dates can differ from UTC by a day either way; ignore anything further out
      const diff = Math.abs(Date.parse(d + "T12:00:00Z") - Date.now()) / 864e5;
      if (!(diff <= 2)) return new Response("bad date", { status: 400, headers: cors });
      await env.DB.prepare("INSERT INTO plays (day, game, event, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (day, game, event) DO UPDATE SET n = n + 1")
        .bind(d, g, e).run();
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/stats.json")) {
      if (env.STATS_KEY && url.searchParams.get("key") !== env.STATS_KEY) return new Response("Add ?key=… to see the stats.", { status: 401 });
      const { results } = await env.DB.prepare("SELECT day, game, event, n FROM plays WHERE day >= date('now', '-30 days') ORDER BY day DESC").all();
      const days = {};
      for (const r of results) {
        const k = r.day + "|" + r.game;
        (days[k] ||= { day: r.day, game: r.game, start: 0, win: 0, loss: 0 })[r.event] = r.n;
      }
      const rows = Object.values(days);
      if (url.pathname === "/stats.json") return Response.json(rows);
      const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
      const body = rows.map(r => `<tr><td>${esc(r.day)}</td><td>${esc(r.game)}</td><td>${r.start}</td><td>${r.win}</td><td>${r.loss}</td><td>${r.start ? Math.round((r.win / r.start) * 100) + "%" : "–"}</td></tr>`).join("");
      return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JWalt Army plays</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#1a1620;background:#f5f2ee}table{border-collapse:collapse;background:#fff}th,td{padding:6px 12px;border-bottom:1px solid #e2d9d6;text-align:right}th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}th{background:#1a1620;color:#fff}</style>
<h1>JWalt Army plays, last 30 days</h1><p>Started = made a first guess. Each browser counts once per day.</p>
<table><tr><th>Day</th><th>Game</th><th>Started</th><th>Won</th><th>Lost or gave up</th><th>Win rate</th></tr>${body || '<tr><td colspan="6">No plays yet.</td></tr>'}</table>`, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  },
};
