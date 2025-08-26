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
