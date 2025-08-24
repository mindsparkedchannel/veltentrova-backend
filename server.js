// server.js — Veltentrova Backend (Render/Node 18+)

import express from "express";          // falls CommonJS: const express = require('express')
import cors from "cors";                // optional, aber angenehm

// --- ENV ----------------------------------------------------
const PORT = process.env.PORT || 10000;
const MODE = process.env.MODE || "production";
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 300000); // 5 Min
const ADD_PER_RUN = Number(process.env.ADD_PER_RUN || 1200);
const USAGE_CAP = Number(process.env.USAGE_CAP || 200000);

// Notion
const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || "";

// --- App Setup ----------------------------------------------
const app = express();
app.use(cors());                        // CORS: Frontend (Netlify) darf zugreifen
app.use(express.json());

// --- In-Memory State ----------------------------------------
let runs = 0;
let lastRun = null;
let today = 0;

// --- Helper -------------------------------------------------
function nowISO() {
  return new Date().toISOString();
}

// Notion: Tasks aus Datenbank lesen und fürs Frontend formen
async function fetchNotionTasks() {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return [];

  const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
  const body = {
    page_size: 50,
    sorts: [{ property: "LastRun", direction: "descending" }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(()=>"");
    console.error("Notion error:", res.status, txt);
    return [];
  }

  const data = await res.json();
  return (data.results || []).map(page => {
    const p = page.properties || {};
    // Titelspalte kann "Task" ODER "Name" heißen – beides abdecken:
    const titleProp = p.Task?.title || p.Name?.title || [];
    const title = titleProp.length ? (titleProp[0].plain_text || "Ohne Titel") : "Ohne Titel";

    const status = p.Status?.select?.name || "Todo";
    const priority = p.Priority?.select?.name || "";
    const lastRun = p["LastRun"]?.date?.start || null;
    const result = (p.Result?.rich_text?.[0]?.plain_text) || "";

    return {
      title,
      category: "task", // eigener Filter im Frontend möglich
      desc: [
        status,
        priority && `Priority: ${priority}`,
        lastRun && new Date(lastRun).toLocaleString("de-DE"),
        result && `→ ${result}`
      ].filter(Boolean).join(" • ")
    };
  });
}

// --- Scheduler-Task -----------------------------------------
async function runTask() {
  runs += 1;
  lastRun = nowISO();

  // Demo-Token-Verbrauch hochzählen (nur Anzeige)
  today = Math.min(USAGE_CAP, today + ADD_PER_RUN);

  // (optional) Hier könnten echte Jobs laufen…
  return { runs, lastRun, today };
}

// --- Routes --------------------------------------------------

// Root-Hinweis
app.get("/", (req, res) => {
  res.send("Veltentrova Backend is running. Try /status, /usage, /content");
});

// Status-Kachel
app.get("/status", (req, res) => {
  res.json({
    lastRun,
    runs,
    lastTask: {
      status: "Done",               // oder "Doing"/"Error" je nach Jobstatus
      result: { mode: MODE },
    },
  });
});

// Token-Usage-Kachel
app.get("/usage", (req, res) => {
  res.json({
    today,
    cap: USAGE_CAP,
    pct: Math.round((today / USAGE_CAP) * 100),
  });
});

// Content-Karten: bevorzugt Notion, sonst Fallback
app.get("/content", async (req, res) => {
  try {
    const items = await fetchNotionTasks();
    if (items.length) return res.json({ items });

    // Fallback (falls Notion nicht konfiguriert/leer)
    res.json({
      items: [
        { title: "Erster Post", category: "blog", desc: "Kurzer Blogbeitrag als Platzhalter." },
        { title: "Produktkarte A", category: "product", desc: "Neue Produktidee – Auto-Generator" },
        { title: "Video-Snippet 01", category: "video", desc: "Kurzclip zu Prompt-Workflows" },
        { title: "Produktkarte B", category: "product", desc: "Landingpage-Generator" },
        { title: "How-To #1", category: "blog", desc: "Pipeline-Aufbau erklärt" },
      ],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "content_failed" });
  }
});

// --- Start ---------------------------------------------------
import fs from 'fs';
import path from 'path';

app.get('/content', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data', 'content.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(raw);
      res.json(json);
    } else {
      res.json({
        items: [
          { title: 'Erster Post', category: 'blog', desc: 'Kurzer Blogbeitrag als Platzhalter.' },
          { title: 'Produktkarte A', category: 'product', desc: 'Neue Produktidee – Auto-Generator' },
          { title: 'Video-Snippet 01', category: 'video', desc: 'Kurzclip zu Prompt-Workflows' },
          { title: 'Produktkarte B', category: 'product', desc: 'Landingpage-Generator' },
          { title: 'How-To #1', category: 'blog', desc: 'Pipeline-Aufbau erklärt' }
        ]
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'content load failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[Veltentrova] Backend listening on ${PORT} in ${MODE}`);
});

// Sofort einen ersten Lauf ausführen, damit UI nicht leer startet
runTask();

// Danach zyklisch laufen lassen
setInterval(runTask, INTERVAL_MS);
