// JWalt Army play counter: a Cloudflare Worker backed by a D1 database (binding name: DB).
//
// POST /hit?g=jwaltle&e=start&d=2026-10-29        add one to that day's count
// POST /hit?g=morefewer&e=correct&v=7&d=...       add v (0 to 10) instead of one
// GET  /                                          tables of the last 30 days
// GET  /stats.json                                the same as JSON
//
// Set a STATS_KEY secret to make the stats pages need ?key=<your key>.
// Table (run once in the D1 console):
//   CREATE TABLE plays (day TEXT NOT NULL, game TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, game, event));

const SITE = "https://jwaltfanarmy.co.uk";
// Each game's events, in the order the stats table shows them, with their column headings
const GAMES = {
  jwaltle: { title: "JWaltle", events: { start: "Started", win: "Won", loss: "Lost or gave up" } },
  journeyman: { title: "Journeyman", events: { start: "Started", win: "Won", loss: "Lost or gave up" } },
  link: { title: "The Missing Link", events: { start: "Started", win: "Linked", loss: "No link" } },
  morefewer: { title: "More or Fewer", events: { start: "Started", finish: "Finished", correct: "Correct answers" } },
  teamsheet: { title: "Team Sheet quizzes finished", events: { clubs: "Every Badge", gaffers: "The Gaffers", wembley: "Wembley 2011", euro12: "Poznań Bound", euro16: "Bordeaux Bound", shootout: "Shootout" } },
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const cors = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/hit" && request.method === "POST") {
      const g = url.searchParams.get("g"), e = url.searchParams.get("e"), d = url.searchParams.get("d");
      if (!GAMES[g] || !(e in GAMES[g].events) || !DAY.test(d || "")) return new Response("bad request", { status: 400, headers: cors });
      // Players' own dates can differ from UTC by a day either way; ignore anything further out
      const diff = Math.abs(Date.parse(d + "T12:00:00Z") - Date.now()) / 864e5;
      if (!(diff <= 2)) return new Response("bad date", { status: 400, headers: cors });
      let add = 1;
      if (url.searchParams.has("v")) {
        add = Number(url.searchParams.get("v"));
        if (!Number.isInteger(add) || add < 0 || add > 10) return new Response("bad value", { status: 400, headers: cors });
        if (add === 0) return new Response(null, { status: 204, headers: cors });
      }
      await env.DB.prepare("INSERT INTO plays (day, game, event, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (day, game, event) DO UPDATE SET n = n + ?4")
        .bind(d, g, e, add).run();
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/stats.json")) {
      if (env.STATS_KEY && url.searchParams.get("key") !== env.STATS_KEY) return new Response("Add ?key=… to see the stats.", { status: 401 });
      const { results } = await env.DB.prepare("SELECT day, game, event, n FROM plays WHERE day >= date('now', '-30 days') ORDER BY day DESC").all();
      const rows = {};
      for (const r of results) ((rows[r.game] ||= {})[r.day] ||= {})[r.event] = r.n;
      if (url.pathname === "/stats.json") return Response.json(rows);

      const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
      const extra = { jwaltle: ["Win rate", d => pct(d.win, d.start)], journeyman: ["Win rate", d => pct(d.win, d.start)], link: ["Link rate", d => pct(d.win, d.start)],
        morefewer: ["Average score", d => (d.finish ? (d.correct / d.finish).toFixed(1) + "/10" : "–")] };
      const pct = (a, b) => (b ? Math.round(((a || 0) / b) * 100) + "%" : "–");
      const tables = Object.entries(GAMES).map(([g, def]) => {
        const days = Object.entries(rows[g] || {});
        const cols = Object.entries(def.events), ex = extra[g];
        const head = `<tr><th>Day</th>${cols.map(([, h]) => `<th>${esc(h)}</th>`).join("")}${ex ? `<th>${ex[0]}</th>` : ""}</tr>`;
        const body = days.map(([day, d]) => `<tr><td>${esc(day)}</td>${cols.map(([e]) => `<td>${d[e] || 0}</td>`).join("")}${ex ? `<td>${ex[1](d)}</td>` : ""}</tr>`).join("");
        return `<h2>${esc(def.title)}</h2><table>${head}${body || `<tr><td colspan="${cols.length + 2}">No plays yet.</td></tr>`}</table>`;
      }).join("");
      return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JWalt Army plays</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#1a1620;background:#f5f2ee}h2{margin:28px 0 8px}table{border-collapse:collapse;background:#fff}th,td{padding:6px 12px;border-bottom:1px solid #e2d9d6;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#1a1620;color:#fff}</style>
<h1>JWalt Army plays, last 30 days</h1><p>Daily games count once per browser per day, and practice rounds are left out. Started means the first guess or answer. Team Sheet counts every quiz finished, replays included.</p>${tables}`, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  },
};
