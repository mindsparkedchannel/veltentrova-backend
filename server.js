const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { findLeadByEmail, createLead, getStatus, getUsage, getContent } = require("./notion");
const { notifyLeadEmail } = require("./notify");

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "https://veltentrova-status.netlify.app";

const app = express();
app.disable("x-powered-by");

// CORS: nur deine Site (und originlose Server-/CLI-Calls)
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || origin === ALLOW_ORIGIN),
}));

app.use(express.json({ limit: "1mb" }));

// Rate-Limit nur für /lead
const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health & Data (+ Aliase)
app.get("/health", (_req,res)=> res.json({ ok:true, ts: new Date().toISOString().replace("T"," ").slice(0,19) }));
app.get("/status",  async (_req,res)=> res.json(await getStatus()));
app.get("/usage",   async (_req,res)=> res.json(await getUsage()));
app.get("/content", async (_req,res)=> res.json(await getContent()));
app.get("/api/status",  async (_req,res)=> res.json(await getStatus()));
app.get("/api/usage",   async (_req,res)=> res.json(await getUsage()));
app.get("/api/content", async (_req,res)=> res.json(await getContent()));

// Lead: GET-Hinweis
app.get(["/lead","/api/lead"], (_req,res)=> {
  res.json({ ok:true, hint:"Use POST with JSON body {email,name,note,source}" });
});

function validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s||""); }

// Lead: POST (Honeypot + RateLimit + Duplicate + Mail)
app.post(["/lead","/api/lead"], leadLimiter, async (req,res) => {
  try {
    const { email, name, note, source, hp_field } = req.body || {};

    // Honeypot: Bot füllt das -> ignorieren
    if (hp_field) return res.json({ ok:true, ignored:true, reason:"honeypot" });

    if (!validEmail(email) || !name) return res.status(400).json({ ok:false, error:"name/email required" });

    const existing = await findLeadByEmail(email).catch(()=>null);
    if (existing) return res.status(200).json({ ok:true, stored:"duplicate", id: existing.id });

    const created = await createLead({ name, email, note, source: source || "status-page" });

    // E-Mail (nicht blockierend)
    notifyLeadEmail({ email, name, note, source, id: created.id })
      .catch(e => console.warn("[notify] failed:", e?.message || e));

    return res.json({ ok:true, stored:"notion", id: created.id });
  } catch (err) {
    console.error("POST /lead error:", err);
    return res.status(500).json({ ok:false, error: String(err.message||err) });
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`[server] listening on :${PORT}; allow=${ALLOW_ORIGIN}`));
