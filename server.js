const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

let notion = null;
try { notion = require("./notion"); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

const nowTs = () => new Date().toISOString().replace("T"," ").substring(0,19);
const sendErr = (res, code, err) => res.status(code).json({ ok:false, error: String(err) });

const aliasGet  = (path, h) => { app.get(path, h); app.get("/api"+path, h); };
const aliasPost = (path, h) => { app.post(path, h); app.post("/api"+path, h); };

app.get("/health", (req,res)=> res.json({ ok:true, ts: nowTs() }));

aliasGet("/status", async (req,res)=>{
  try {
    if (notion?.getStatus) return res.json(await notion.getStatus());
    res.json({ lastRun: nowTs(), runs: 1, lastTask: { status:"Done", result:{mode:"production"} }});
  } catch(e){ sendErr(res,500,e); }
});

aliasGet("/usage", async (req,res)=>{
  try {
    if (notion?.getUsage) return res.json(await notion.getUsage());
    res.json({ today: 1200, date: nowTs().substring(0,10), cap: 200000, pct: 1 });
  } catch(e){ sendErr(res,500,e); }
});

aliasGet("/content", async (req,res)=>{
  try {
    if (notion?.getContent) return res.json(await notion.getContent());
    res.json({ items: [
      { title:"Token Budget Check", desc:"To Do • Medium",  category:"task" },
      { title:"Notion Sync Health", desc:"To Do • Medium",  category:"task" },
      { title:"Publish Status to Netlify", desc:"Done • Medium", category:"task" },
      { title:"Daily Crawl & Summaries", desc:"Doing • Medium", category:"task" },
      { title:"Initial Setup", desc:"Done • Medium",  category:"task" },
    ]});
  } catch(e){ sendErr(res,500,e); }
});

app.get(["/lead","/api/lead"], (req,res)=>{
  res.json({ ok:true, hint:"Use POST with JSON body {email,name,note,source}" });
});

/* -------------- Lead + Mail -------------- */
aliasPost("/lead", async (req,res)=>{
  try{
    const b = req.body || {};
    if (!b.email) return sendErr(res,400,"email required");

    // 1) In Notion anlegen
    let out = { id:null, duplicate:false };
    if (notion?.createLead) out = await notion.createLead(b);

    // 2) Mail verschicken (best effort)
    let email = { ok:false };
    try {
      const { sendMail } = require("./notify");
      const subject = `Neuer Lead: ${b.email}`;
      const text =
`Name  : ${b.name || ""}
Email : ${b.email}
Source: ${b.source || ""}
Note  : ${b.note || ""}

Zeit  : ${nowTs()}`;
      const info = await sendMail(subject, text);
      email = { ok:true, info };
    } catch(e){
      email = { ok:false, error: String(e?.message || e) };
    }

    return res.json({ ok:true, stored:"notion", id: out.id, duplicate: !!out.duplicate, email });
  } catch(e){
    sendErr(res,500,e?.message||e);
  }
});
/* ----------------------------------------- */

aliasPost("/refresh", async (req,res)=> res.json({ ok:true }));

app.listen(PORT, ()=> console.log("Server listening on", PORT));
