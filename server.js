const express = require("express");
const cors = require("cors");
const { fetchTasks, createLead } = require("./notion");

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 300000); // 5 Min
const ADD_PER_RUN = Number(process.env.ADD_PER_RUN || 0);
const USAGE_CAP   = Number(process.env.USAGE_CAP   || 200000);
const MODE        = String(process.env.MODE        || "production");
const PORT        = Number(process.env.PORT        || 3000);
const TZ          = "Europe/Berlin";

function parts(d = new Date(), opts = {}) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts })
    .formatToParts(d)
    .reduce((a, p) => (a[p.type] = p.value, a), {});
}
function stamp() {
  const p = parts(new Date(), {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
function todayISO() {
  const p = parts(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

let statusObj = { lastRun: "—", runs: 0, lastTask: { status: "—", result: { mode: MODE } } };
let usageObj  = { today: 0, date: todayISO() };
let cachedTasks = [];

function dailyReset() {
  const t = todayISO();
  if (usageObj.date !== t) { usageObj.today = 0; usageObj.date = t; }
}

async function performTask() {
  try { cachedTasks = await fetchTasks(100); return true; }
  catch (e) { console.error("[performTask]", e); return false; }
}

async function runOnce() {
  dailyReset();
  if (ADD_PER_RUN) usageObj.today = Math.max(0, Math.floor(usageObj.today + ADD_PER_RUN));
  const ok = await performTask();
  statusObj = {
    lastRun: stamp(),
    runs: (statusObj.runs || 0) + 1,
    lastTask: { status: ok ? "Done" : "Error", result: { mode: MODE } }
  };
  console.log(`[run] ${statusObj.lastRun} -> ${statusObj.lastTask.status} | runs=${statusObj.runs} | today=${usageObj.today}`);
  return ok;
}

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" })); // wichtig für POST /lead

function usageResponse() {
  dailyReset();
  const pct = Math.max(0, Math.min(100, Math.round((usageObj.today / USAGE_CAP) * 100)));
  return { today: usageObj.today, date: usageObj.date, cap: USAGE_CAP, pct };
}

/* ---------- Legacy ---------- */
app.get("/health", (req, res) => res.json({ ok: true, ts: stamp() }));
app.get("/status", (req, res) => res.json(statusObj));
app.get("/usage",  (req, res) => res.json(usageResponse()));
app.get("/content", (req, res) => {
  const items = (cachedTasks || []).map(t => ({ title: t.title, desc: `${t.status} • ${t.priority}`, category: "task" }));
  res.json({ items });
});

/* ---------- API Aliases ---------- */
app.get("/api/status",  (req, res) => res.json(statusObj));
app.get("/api/usage",   (req, res) => res.json(usageResponse()));
app.get("/api/content", (req, res) => {
  res.json({ items: (cachedTasks || []).map(t => ({ title: t.title, desc: `${t.status} • ${t.priority}`, category: "task" })) });
});

/* ---------- Refresh ---------- */
app.post("/refresh", async (req, res) => {
  try { const ok = await runOnce(); res.json({ ok, status: statusObj, usage: usageResponse() }); }
  catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});
app.get("/api/refresh", async (req, res) => {
  try { const ok = await runOnce(); res.json({ ok, status: statusObj, usage: usageResponse() }); }
  catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/* ---------- Leads ---------- */
// ==== FLEXIBLES /lead ENDPOINT ===========================================
const NOTION_KEY = process.env.NOTION_API_KEY;
const LEADS_DB   = process.env.NOTION_LEADS_DATABASE_ID;

const N_HEADERS = {
  'Authorization': `Bearer ${NOTION_KEY}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
};

async function notion(path, options={}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: options.method || 'GET',
    headers: { ...N_HEADERS, ...(options.headers||{}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw:text }; }
  if (!res.ok) {
    const msg = typeof json === 'object' ? JSON.stringify(json) : String(json);
    throw new Error(`Notion ${options.method||'GET'} ${path} -> ${res.status}: ${msg}`);
  }
  return json;
}

// Cache für Schema
let LEAD_SCHEMA = null;
async function getLeadSchema() {
  if (LEAD_SCHEMA) return LEAD_SCHEMA;
  if (!NOTION_KEY) throw new Error('NOTION_API_KEY missing');
  if (!LEADS_DB)   throw new Error('NOTION_LEADS_DATABASE_ID missing');

  const db = await notion(`/databases/${LEADS_DB}`);
  const props = db.properties || {};

  // Helper: ersten Key mit Typ finden
  const keyByType = (type) => Object.keys(props).find(k => props[k]?.type === type);

  const titleKey  = keyByType('title')   || 'Name';
  const emailKey  = keyByType('email');                          // email bevorzugt
  const noteKey   = keyByType('rich_text') || Object.keys(props).find(k => /note/i.test(k));
  const sourceKey = Object.keys(props).find(k => /source/i.test(k)) || keyByType('rich_text');

  // Status kann select ODER rich_text sein
  let statusKey   = Object.keys(props).find(k => /status/i.test(k));
  let statusType  = statusKey ? props[statusKey]?.type : null;
  if (!statusKey) {
    const sk = keyByType('select');
    const rt = keyByType('rich_text');
    statusKey  = sk || rt || null;
    statusType = sk ? 'select' : (rt ? 'rich_text' : null);
  }

  LEAD_SCHEMA = { titleKey, emailKey, noteKey, sourceKey, statusKey, statusType };
  return LEAD_SCHEMA;
}

app.get('/lead', (req,res) => {
  res.json({ ok:true, hint:'Use POST with JSON body {email,name,note,source}' });
});

app.post('/lead', express.json(), async (req,res) => {
  try {
    const { email, name, note, source } = req.body || {};
    if (!email) return res.status(400).json({ ok:false, error:'email required' });

    const s = await getLeadSchema();

    // Properties zusammenbauen – nur Keys setzen, die es wirklich gibt
    const properties = {};
    if (s.titleKey && name) {
      properties[s.titleKey] = { title: [{ text: { content: String(name) } }] };
    }
    if (s.emailKey) {
      properties[s.emailKey] = { email: String(email) };
    }
    if (s.noteKey && note) {
      properties[s.noteKey] = { rich_text: [{ text: { content: String(note) } }] };
    }
    if (s.sourceKey && source) {
      properties[s.sourceKey] = { rich_text: [{ text: { content: String(source) } }] };
    }
    if (s.statusKey) {
      properties[s.statusKey] =
        (s.statusType === 'select')
          ? { select: { name: 'New' } }
          : { rich_text: [{ text: { content: 'New' } }] };
    }

    const created = await notion('/pages', {
      method: 'POST',
      body: { parent: { database_id: LEADS_DB }, properties }
    });

    res.json({ ok:true, stored:'notion', id: created.id });
  } catch (err) {
    console.error('POST /lead error:', err?.message || err);
    res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
});


// POST-Aliase + GET-Hint
app.post(["/lead", "/api/lead"], handleLead);
app.get (["/lead", "/api/lead"], (req, res) => {
  res.json({ ok: true, hint: "Use POST with JSON body {email,name,note,source}" });
});

/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`[server] listening on ${PORT} | interval=${INTERVAL_MS} add=${ADD_PER_RUN} cap=${USAGE_CAP} mode=${MODE}`);
  runOnce().catch(console.error);
  setInterval(() => runOnce().catch(console.error), INTERVAL_MS);
});
