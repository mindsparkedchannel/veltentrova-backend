"use strict";

const express = require("express");
const cors = require("cors");
const notion = require("./notion"); // exportiert: createLead(...)

const app  = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// --- simple status/usage/content ---
let runs = 0;
let lastRun = null;
let lastTask = null;

const nowTs = () => new Date().toISOString().replace("T"," ").slice(0,19);
const statusObj  = () => ({ lastRun: lastRun || nowTs(), runs, lastTask });
const usageObj   = () => {
  const today = 3600, cap = 200000;
  return { today, date: new Date().toISOString().slice(0,10), cap, pct: Math.round(today*100/cap) };
};
const contentObj = () => ({
  items: [
    { title:"Token Budget Check",        desc:"To Do • Medium", category:"task" },
    { title:"Notion Sync Health",        desc:"To Do • Medium", category:"task" },
    { title:"Publish Status to Netlify", desc:"Done • Medium",  category:"task" },
    { title:"Daily Crawl & Summaries",   desc:"Doing • Medium", category:"task" },
    { title:"Initial Setup",             desc:"Done • Medium",  category:"task" },
  ]
});

// ---- health ----
app.get("/health", (req,res)=> res.json({ ok:true, ts: nowTs() }));

// ---- status / usage / content (+ Aliases /api/*) ----
const sendStatus  = (res)=> res.json(statusObj());
const sendUsage   = (res)=> res.json(usageObj());
const sendContent = (res)=> res.json(contentObj());

app.get("/status", sendStatus);
app.get("/usage", sendUsage);
app.get("/content", sendContent);

app.get("/api/status",  (req,res)=> sendStatus(res));
app.get("/api/usage",   (req,res)=> sendUsage(res));
app.get("/api/content", (req,res)=> sendContent(res));

// ---- refresh ----
app.post("/refresh", async (req,res)=>{
  runs += 1;
  lastRun  = nowTs();
  lastTask = { status:"Done", result:{ mode: process.env.NODE_ENV || "production" } };
  res.json({ ok:true, status: statusObj(), usage: usageObj() });
});

// ---- lead ----
app.get("/lead", (req,res)=>{
  res.json({ ok:true, hint:"Use POST with JSON body {email,name,note,source}" });
});

app.post("/lead", async (req,res)=>{
  try{
    const { email, name, note, source } = req.body || {};
    if (!email) return res.status(400).json({ ok:false, error:"email required" });

    const result = await notion.createLead({ email, name, note, source });
    res.json({ ok:true, stored:"notion", id: result.id, duplicate: !!result.duplicate });
  }catch(e){
    console.error("LEAD/ERR", e?.message || e);
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// ---- DIAG routes (vor etwaigen Catch-Alls einbinden!) ----
function mask(v){ if(!v) return null; const s=String(v); return {len:s.length, head:s.slice(0,6), tail:s.slice(-4)}; }

app.get("/diag/env", (req,res)=>{
  res.json({
    ok:true,
    NOTION_API_KEY:           mask(process.env.NOTION_API_KEY),
    NOTION_LEADS_DATABASE_ID: mask(process.env.NOTION_LEADS_DATABASE_ID),
    SMTP_HOST:  process.env.SMTP_HOST  || null,
    SMTP_PORT:  process.env.SMTP_PORT  || null,
    SMTP_USER:  process.env.SMTP_USER  || null,
    NOTIFY_FROM:process.env.NOTIFY_FROM|| null,
    NOTIFY_TO:  process.env.NOTIFY_TO  || null
  });
});

app.get("/diag/notion", async (req,res)=>{
  try{
    const tk = process.env.NOTION_API_KEY;
    const r  = await fetch("https://api.notion.com/v1/users/me", {
      headers: { "Authorization": `Bearer ${tk}`, "Notion-Version": "2022-06-28" }
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

app.get("/diag/smtp", async (req,res)=>{
  try{
    const { sendTestMail } = require("./notify"); // nur hier geladen → kein doppelter Import
    const out = await sendTestMail("SMTP debug", "If you see this, SMTP works.");
    res.json({ ok:true, out });
  }catch(e){
    console.error("MAIL/SMTP/ERR", e?.message || e);
    res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});

app.listen(PORT, ()=> console.log(`Server listening on ${PORT}`));
