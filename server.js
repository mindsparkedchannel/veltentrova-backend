const express = require("express");
const cors    = require("cors");
const notion  = require("./notion.js");

const app = express();
app.use(express.json());

// CORS for your status page (oder * für alles)
const origins = (process.env.ALLOW_ORIGIN || "*")
  .split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: origins, credentials: false }));

app.get(["/health","/status"], (_req, res) => {
  const ts = new Date().toISOString().replace("T"," ").slice(0,19);
  res.json({ ok: true, ts });
});

app.get(["/lead","/api/lead"], (_req,res) => {
  res.json({ ok:true, hint:"Use POST with JSON {email,name,note,source}" });
});

app.post(["/lead","/api/lead"], async (req,res) => {
  try {
    const { email, name, note, source } = req.body || {};
    if (!email) return res.status(400).json({ ok:false, error:"email required" });

    // Duplikate auflösen
    const existing = await notion.findLeadByEmail(email).catch(() => null);
    if (existing) return res.json({ ok:true, stored:"notion", id: existing.id, duplicate:true });

    const id = await notion.createLead({ email, name, note, source });
    // Notification optional – absichtlich NICHT-blockierend
    // (wenn du später Mail willst, hier try/catch einbauen)

    res.json({ ok:true, stored:"notion", id });
  } catch (e) {
    console.error("POST /lead failed:", e);
    res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Backend listening on " + port));
