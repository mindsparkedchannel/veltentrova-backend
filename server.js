const express = require("express");
const { sendTestMail } = require('./notify');
const cors    = require("cors");
const { sendTestMail } = require('./notify');
const notion  = require("./notion.js");
const { sendTestMail } = require('./notify');

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


// ---- SMTP debug endpoint (added by PS) ----
app.get('/debug/smtp', async (req, res) => {
  try {
    const out = await sendTestMail('SMTP debug', 'If you see this, SMTP works.');
    res.json({ ok: true, out });
  } catch (e) {
    console.error('MAIL/SMTP/ERR', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
// ==== DEBUG INJECT START ====
(() => {
  try {
    if (typeof app === "undefined" || !app || typeof app.get !== "function") {
      console.error("DEBUG: app not ready, skipping route injection");
      return;
    }
    // lokaler Import – vermeidet globale Duplikate:
    const { sendTestMail } = require("./notify");

    app.get("/debug/routes", (req, res) => {
      const routes = [];
      const stack = (app._router && app._router.stack) || [];
      for (const layer of stack) {
        if (layer.route && layer.route.path) {
          const methods = Object.keys(layer.route.methods || {});
          routes.push({ path: layer.route.path, methods });
        } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
          for (const s of layer.handle.stack) {
            if (s.route && s.route.path) {
              const methods = Object.keys(s.route.methods || {});
              routes.push({ path: s.route.path, methods });
            }
          }
        }
      }
      res.json({ ok: true, routes });
    });

    app.get("/debug/smtp", async (req, res) => {
      try {
        const out = await sendTestMail("SMTP debug", "If you see this, SMTP works.");
        res.json({ ok: true, out });
      } catch (e) {
        console.error("MAIL/SMTP/ERR", e?.message || e);
        res.status(500).json({ ok: false, error: e?.message || String(e) });
      }
    });

    app.get("/debug-smtp", async (req, res) => {
      try {
        const out = await sendTestMail("SMTP debug", "If you see this, SMTP works.");
        res.json({ ok: true, out });
      } catch (e) {
        console.error("MAIL/SMTP/ERR", e?.message || e);
        res.status(500).json({ ok: false, error: e?.message || String(e) });
      }
    });

    console.log("DEBUG: routes mounted (/debug/routes, /debug/smtp, /debug-smtp)");
  } catch (err) {
    console.error("DEBUG mount failed:", err?.message || err);
  }
})();
// ==== DEBUG INJECT END ====
