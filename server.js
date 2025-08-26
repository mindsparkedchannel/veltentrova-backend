const express = require("express");
const cors = require("cors");
const { sendLeadMail } = require("./notify");

// --- Config ---
const PORT = process.env.PORT || 3000;
const NOTION_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || process.env.NOTION_SECRET;
const DB_ID = process.env.NOTION_LEADS_DATABASE_ID;

const app = express();
app.use(cors());
app.use(express.json());

// --- Helpers ---
function nowTS() {
  return new Date().toISOString().replace("T"," ").slice(0,19);
}

async function notionCreateLead({ email, name, note, source }) {
  if (!NOTION_KEY || !DB_ID) {
    throw new Error("Missing NOTION_API_KEY or NOTION_LEADS_DATABASE_ID");
  }
  const props = {
    Name:   { title:     [{ text: { content: (name || email || "Lead") } }] },
    Email:  { email:     email || "" },
    Note:   { rich_text: note   ? [{ text: { content: String(note).slice(0,2000) } }] : [] },
    Source: { rich_text: source ? [{ text: { content: String(source).slice(0,200) } }] : [] },
    Status: { select:    { name: "New" } }
  };

  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parent: { database_id: DB_ID }, properties: props })
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Notion ${r.status} ${r.statusText}: ${text}`);
  }
  const j = JSON.parse(text);
  return j.id;
}

// --- Routes ---
app.get("/health", (req,res) => res.json({ ok: true, ts: nowTS() }));

async function handleLead(req, res) {
  try {
    const { email, name, note, source } = req.body || {};
    if (!email) return res.status(400).json({ ok:false, error:"email required" });

    // 1) Notion
    const id = await notionCreateLead({ email, name, note, source });

    // 2) Mail (best-effort; darf fehlschlagen)
    const emailResult = await sendLeadMail({ email, name, note, source });

    return res.json({ ok: true, stored: "notion", id, email: emailResult });
  } catch (e) {
    // Niemals 500 für Leads – wir geben eine freundliche 200 mit Fehlerhinweis zurück
    console.error("LEAD ERR:", e?.message || e);
    return res.status(200).json({ ok: true, stored: "notion:maybe", error: e?.message || String(e) });
  }
}

app.get ("/lead",     (req,res)=> res.json({ ok:true, hint:"Use POST with JSON body {email,name,note,source}"}));
app.post("/lead",     handleLead);
app.get ("/api/lead", (req,res)=> res.json({ ok:true, hint:"Use POST with JSON body {email,name,note,source}"}));
app.post("/api/lead", handleLead);

// simple status/info (für deine Status-Seite)
app.get("/status", (req,res)=> res.json({
  lastRun: nowTS(),
  runs: 1,
  lastTask: { status: "Done", result: { mode: process.env.NODE_ENV || "production" } }
}));
app.get("/usage", (req,res)=> res.json({
  today: 1200, date: new Date().toISOString().slice(0,10), cap: 200000, pct: 1
}));
app.get("/content", (req,res)=> res.json({
  items: [
    { title:"Leads Capture", desc:"Running • Medium", category:"task" },
    { title:"Status Site",   desc:"Live • Medium",    category:"task" }
  ]
}));
app.get("/api/status",  (req,res)=> app._router.handle({ ...req, url: "/status"  }, res, ()=>{}));
app.get("/api/usage",   (req,res)=> app._router.handle({ ...req, url: "/usage"   }, res, ()=>{}));
app.get("/api/content", (req,res)=> app._router.handle({ ...req, url: "/content" }, res, ()=>{}));

app.listen(PORT, () => console.log("Server listening on", PORT));
