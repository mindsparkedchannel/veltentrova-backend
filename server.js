const express = require("express");
const cors = require("cors");
const { fetchTasks } = require("./notion");

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 300000); // 5 min
const ADD_PER_RUN = Number(process.env.ADD_PER_RUN || 0);
const USAGE_CAP   = Number(process.env.USAGE_CAP   || 200000);
const MODE        = String(process.env.MODE        || "production");
const PORT        = Number(process.env.PORT        || 3000);
const TZ          = "Europe/Berlin";

function parts(d = new Date(), opts = {}){
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts })
    .formatToParts(d).reduce((a,p)=> (a[p.type]=p.value, a), {});
}
function stamp(){
  const p = parts(new Date(), { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
function todayISO(){
  const p = parts(new Date(), { year:"numeric", month:"2-digit", day:"2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

let statusObj = { lastRun: "—", runs: 0, lastTask: { status: "—", result: { mode: MODE } } };
let usageObj  = { today: 0, date: todayISO() };
let cachedTasks = [];

function dailyReset(){
  const t = todayISO();
  if(usageObj.date !== t){ usageObj.today = 0; usageObj.date = t; }
}

async function performTask(){
  try{
    cachedTasks = await fetchTasks(100);
    return true;
  }catch(e){
    console.error("[performTask]", e);
    return false;
  }
}

async function runOnce(){
  dailyReset();
  if (ADD_PER_RUN){ usageObj.today = Math.max(0, Math.floor(usageObj.today + ADD_PER_RUN)); }
  const ok = await performTask();
  statusObj = { lastRun: stamp(), runs: (statusObj.runs||0)+1, lastTask: { status: ok ? "Done" : "Error", result: { mode: MODE } } };
  console.log(`[run] ${statusObj.lastRun} -> ${statusObj.lastTask.status} | runs=${statusObj.runs} | today=${usageObj.today}`);
  return ok;
}

const app = express();
app.disable("x-powered-by");
app.use(cors());

function usageResponse(){
  dailyReset();
  const pct = Math.max(0, Math.min(100, Math.round((usageObj.today/USAGE_CAP)*100)));
  return { today: usageObj.today, date: usageObj.date, cap: USAGE_CAP, pct };
}

// --- legacy routes (bereits genutzt vom Frontend)
app.get("/health", (req,res)=> res.json({ ok: true, ts: stamp() }));
app.get("/status", (req,res)=> res.json(statusObj));
app.get("/usage",  (req,res)=> res.json(usageResponse()));
app.get("/content", (req,res)=> {
  const items = (cachedTasks || []).map(t => ({
    title: t.title, desc: `${t.status} • ${t.priority}`, category: "task"
  }));
  res.json({ items });
});

// --- neue Aliases unter /api/*
app.get("/api/status",  (req,res)=> res.json(statusObj));
app.get("/api/usage",   (req,res)=> res.json(usageResponse()));
app.get("/api/content", (req,res)=> res.json({ items: (cachedTasks || []).map(t => ({
  title: t.title, desc: `${t.status} • ${t.priority}`, category: "task"
}))}));

// --- Refresh Trigger
app.post("/refresh", async (req,res)=>{
  try { const ok = await runOnce(); res.json({ ok, status: statusObj, usage: usageResponse() }); }
  catch (e) { res.status(500).json({ ok:false, error: e?.message || String(e) }); }
});
// optional GET-Variante, falls POST blockiert ist
app.get("/api/refresh", async (req,res)=>{
  try { const ok = await runOnce(); res.json({ ok, status: statusObj, usage: usageResponse() }); }
  catch (e) { res.status(500).json({ ok:false, error: e?.message || String(e) }); }
});

app.listen(PORT, ()=>{
  console.log(`[server] listening on ${PORT} | interval=${INTERVAL_MS} add=${ADD_PER_RUN} cap=${USAGE_CAP} mode=${MODE}`);
  runOnce().catch(console.error);
  setInterval(()=> runOnce().catch(console.error), INTERVAL_MS);
});
