const express = require("express");
const cors = require("cors");
const app = express();
const { createLead } = require("./notion");

const allow = process.env.ALLOW_ORIGIN;
if (allow) app.use(cors({ origin: allow }));
app.use(express.json());
/* --- DIAG ROUTES START --- */
app.get('/diag/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/diag/env', (req, res) => {
  const k = process.env.NOTION_API_KEY || '';
  res.json({
    ok: true,
    which: 'NOTION_API_KEY',
    NOTION_API_KEY: k ? { len: k.length, head: k.slice(0,8), tail: k.slice(-4) } : null,
    NOTION_TOKEN: process.env.NOTION_TOKEN || null,
    NOTION_SECRET: process.env.NOTION_SECRET || null,
    NOTION_LEADS_DATABASE_ID: process.env.NOTION_LEADS_DATABASE_ID || null
  });
});

// Safe Demo-Lead (keine externen Calls)
app.get('/diag/lead', (req, res) => {
  res.json({ ok: true, sample: { name: 'Test Lead', email: 'test@example.com' } });
});
/* --- DIAG ROUTES END --- */

app.get("/health", (req,res)=>{
  const ts = new Date().toISOString().replace("T"," ").slice(0,19);
  res.json({ ok:true, ts });
});

function mask(s){ if(!s) return null; const t=String(s); return {len:t.length, head:t.slice(0,10), tail:t.slice(-4)}; }
app.get("/diag/env",(req,res)=>{
  res.json({
    ok:true,
    which: process.env.NOTION_API_KEY ? "NOTION_API_KEY" :
           process.env.NOTION_TOKEN   ? "NOTION_TOKEN"   :
           process.env.NOTION_SECRET  ? "NOTION_SECRET"  : "NONE",
    NOTION_API_KEY: mask(process.env.NOTION_API_KEY),
    NOTION_TOKEN  : mask(process.env.NOTION_TOKEN),
    NOTION_SECRET : mask(process.env.NOTION_SECRET),
    NOTION_LEADS_DATABASE_ID: process.env.NOTION_LEADS_DATABASE_ID
  });
});

app.get("/diag/notion", async (req,res)=>{
  const tk = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || process.env.NOTION_SECRET || "";
  try{
    const r = await fetch("https://api.notion.com/v1/users/me", {
      headers: { Authorization:`Bearer ${tk}`, "Notion-Version":"2022-06-28" }
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

app.post(["/lead","/api/lead"], async (req,res)=>{
  try{
    const id = await createLead(req.body || {});
    res.json({ ok:true, stored:"notion", id });
  }catch(e){
    console.error("LEAD ERR:", e?.message || e);
    // niemals 500 für Client:
    res.status(200).json({ ok:false, error:String(e) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log("listening:", PORT));

