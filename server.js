"use strict";

const express = require("express");
const cors = require("cors");
const { sendTestMail } = require("./notify");

const app = express();
app.use(cors());
app.use(express.json());

// --- simple health ---
app.get("/health", (req, res) => {
  const ts = new Date().toISOString().replace("T"," ").slice(0,19);
  res.json({ ok: true, ts });
});

// (Legacy + Aliases, optional)
app.get("/status", (req, res) => res.json({ ok: true }));
app.get("/usage",  (req, res) => res.json({ ok: true }));
app.get("/content",(req, res) => res.json({ ok: true }));
app.get("/api/status",  (req, res) => res.redirect(307, "/status"));
app.get("/api/usage",   (req, res) => res.redirect(307, "/usage"));
app.get("/api/content", (req, res) => res.redirect(307, "/content"));

const NOTION_TOKEN = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || process.env.NOTION_SECRET;
const NOTION_DB    = process.env.NOTION_LEADS_DATABASE_ID;

async function createNotionLead({ email, name, note, source }) {
  if (!NOTION_TOKEN || !NOTION_DB) throw new Error("Notion env missing");

  const payload = {
    parent: { database_id: NOTION_DB },
    properties: {
      Name:   { title: [{ text: { content: name || email || "Lead" } }] },
      Email:  { email: email || "" },
      Note:   { rich_text: note   ? [{ text: { content: String(note)   } }] : [] },
      Source: { rich_text: source ? [{ text: { content: String(source) } }] : [] },
      Status: { select: { name: "New" } }
    }
  };

  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`Notion create -> ${r.status}: ${text}`);

  return JSON.parse(text);
}

async function handleLead(req, res) {
  const { email, name, note, source } = req.body || {};
  try {
    if (!email) throw new Error("email required");

    // 1) Notion
    const page = await createNotionLead({ email, name, note, source });
    const out = { ok: true, stored: "notion", id: page.id };

    // 2) Best-effort Mail
    try {
      const info = await sendTestMail(
        `New lead: ${name || email}`,
        `Email: ${email}\nName: ${name || ""}\nNote: ${note || ""}\nSource: ${source || ""}`
      );
      out.email = { ok: true, info: { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected } };
    } catch (e) {
      out.email = { ok: false, error: e?.message || String(e) };
    }

    return res.json(out);
  } catch (err) {
    console.error("LEAD ERR:", err?.message || err);
    // Niemals 500 – wir geben den Fehler im Body zurück
    return res.status(200).json({ ok: true, stored: "notion:maybe", error: err?.message || String(err) });
  }
}

// beide Pfade bedienen
app.post("/lead", handleLead);
app.post("/api/lead", handleLead);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`veltentrova backend on :${PORT}`);
});

/* LEAD HANDLER */
const express = require("express");
const { createLead } = require("./notion");

app.post(["/lead","/api/lead"], express.json(), async (req,res) => {
  try {
    const payload = req.body || {};
    const id = await createLead(payload);
    res.json({ ok:true, stored:"notion", id });
  } catch (e){
    console.error("LEAD ERR:", e?.message || e);
    // niemals 500 für Client:
    res.status(200).json({ ok:false, error: String(e) });
  }
});
/* END LEAD HANDLER */
// ==== DIAG ROUTES ====
function _mask(v){ if(!v) return null; const s=String(v); return {len:s.length, head:s.slice(0,10), tail:s.slice(-4)}; }
app.get("/diag/env",(req,res)=>{
  res.json({
    ok:true,
    which: process.env.NOTION_API_KEY ? "NOTION_API_KEY" :
           process.env.NOTION_TOKEN    ? "NOTION_TOKEN"    :
           process.env.NOTION_SECRET   ? "NOTION_SECRET"   : "NONE",
    NOTION_API_KEY     : _mask(process.env.NOTION_API_KEY),
    NOTION_TOKEN       : _mask(process.env.NOTION_TOKEN),
    NOTION_SECRET      : _mask(process.env.NOTION_SECRET),
    NOTION_DB          : process.env.NOTION_LEADS_DATABASE_ID
  });
});
app.get("/diag/notion", async (req,res)=>{
  const tk = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || process.env.NOTION_SECRET || "";
  try{
    const r = await fetch("https://api.notion.com/v1/users/me", {
      headers: { "Authorization": `Bearer ${tk}`, "Notion-Version":"2022-06-28" }
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});
// ==== END DIAG ROUTES ====

