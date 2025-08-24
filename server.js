// server.js — Veltentrova Backend (ESM, Node 18+)

// -------------------------------
// Imports & App-Setup (ESM)
// -------------------------------
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

// App initialisieren
const app = express();
app.use(cors());            // Erlaubt Aufrufe vom Netlify-Frontend
app.use(express.json());    // JSON-Body-Parsing (falls später gebraucht)

// -------------------------------
// ENV-Konfiguration
// -------------------------------
const PORT = process.env.PORT || 10000;

// Anzeige/Status
const MODE        = process.env.MODE        || "production";
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 300000); // 5 min
const ADD_PER_RUN = Number(process.env.ADD_PER_RUN || 1200);
const USAGE_CAP   = Number(process.env.USAGE_CAP   || 200000);

// Notion (optional – wenn gesetzt, liest /content aus deiner DB)
const NOTION_API_KEY     = process.env.NOTION_API_KEY     || "";
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || "";

// -------------------------------
// Laufzeit-Status im Speicher
// -------------------------------
let runs = 0;          // Wie oft der Scheduler gelaufen ist
let lastRun = null;    // ISO-Zeitstempel des letzten Laufs
let today = 0;         // "Verbrauch" für die Token-Anzeige

// Hilfsfunktion
const nowISO = () => new Date().toISOString();

// -------------------------------
// Notion: Tasks lesen (wenn konfiguriert)
// -------------------------------
async function fetchNotionTasks() {
  // Wenn Notion nicht konfiguriert, direkt leer zurück
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return [];

  const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
  const body = {
    page_size: 50,
    // Sortiere optional nach LastRun (falls vorhanden)
    sorts: [{ property: "LastRun", direction: "descending" }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[Notion] API error:", res.status, txt);
    return [];
  }

  const data = await res.json();

  // Mapping auf die einfache Card-Struktur des Frontends:
  //  - title: Titel der Notion-Seite (Spaltenname kann "Task" ODER "Name" heißen)
  //  - category: "task" (damit der Tasks-Filter funktioniert)
  //  - desc: kompakter Text (Status • Priority • LastRun • Result)
  return (data.results || []).map((page) => {
    const p = page.properties || {};

    const titleProp = p.Task?.title || p.Name?.title || [];
    const title = titleProp.length
      ? titleProp[0].plain_text || "Ohne Titel"
      : "Ohne Titel";

    const status = p.Status?.select?.name || "Todo";
    const priority = p.Priority?.select?.name || "";
    const lastRunP = p.LastRun?.date?.start || null;
    const result = p.Result?.rich_text?.[0]?.plain_text || "";

    const pieces = [
      status,
      priority && `Priority: ${priority}`,
      lastRunP && new Date(lastRunP).toLocaleString("de-DE"),
      result && `→ ${result}`,
    ].filter(Boolean);

    return { title, category: "task", desc: pieces.join(" • ") };
  });
}

// -------------------------------
// Scheduler (Demo): zählt Runs & Tokenverbrauch
// -------------------------------
async function runTask() {
  runs += 1;
  lastRun = nowISO();
  // Nur Anzeige: "Verbrauch" erhöhen, gedeckelt durch USAGE_CAP
  today = Math.min(USAGE_CAP, today + ADD_PER_RUN);
  // Hier könnten später echte Jobs passieren (Crawler, Sync, …)
}

// -------------------------------
// API-Routen
// -------------------------------

// Root: kleiner Hinweis
app.get("/", (req, res) => {
  res.send("Veltentrova Backend läuft. Endpunkte: /status, /usage, /content");
});

// Systemstatus fürs Dashboard
app.get("/status", (req, res) => {
  res.json({
    lastRun,
    runs,
    lastTask: {
      status: "Done", // oder 'Doing' / 'Error' bei echten Jobs
      result: { mode: MODE },
    },
  });
});

// Token-Usage fürs Dashboard
app.get("/usage", (req, res) => {
  res.json({
    today,
    cap: USAGE_CAP,
    pct: Math.round((today / USAGE_CAP) * 100),
  });
});

// Content-Karten:
// 1) Notion (wenn konfiguriert)
// 2) sonst data/content.json (falls vorhanden)
// 3) sonst Fallback-Dummy-Items
app.get("/content", async (req, res) => {
  try {
    // 1) Notion
    const notionItems = await fetchNotionTasks();
    if (notionItems.length) return res.json({ items: notionItems });

    // 2) content.json aus dem Repo (backend/data/content.json)
    const filePath = path.join(process.cwd(), "data", "content.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(raw);
      return res.json(json);
    }

    // 3) Fallback
    return res.json({
      items: [
        {
          title: "Erster Post",
          category: "blog",
          desc: "Kurzer Blogbeitrag als Platzhalter.",
        },
        {
          title: "Produktkarte A",
          category: "product",
          desc: "Neue Produktidee – Auto-Generator",
        },
        {
          title: "Video-Snippet 01",
          category: "video",
          desc: "Kurzclip zu Prompt-Workflows",
        },
        {
          title: "Produktkarte B",
          category: "product",
          desc: "Landingpage-Generator",
        },
        {
          title: "How-To #1",
          category: "blog",
          desc: "Pipeline-Aufbau erklärt",
        },
      ],
    });
  } catch (e) {
    console.error("[content] failed:", e);
    res.status(500).json({ error: "content_failed" });
  }
});

// -------------------------------
// Start & Scheduler
// -------------------------------
app.listen(PORT, () => {
  console.log(`[Veltentrova] Backend listening on ${PORT} (MODE=${MODE})`);
});

// erster Lauf sofort, damit UI direkt Daten hat
runTask();

// zyklisch wiederholen
setInterval(runTask, INTERVAL_MS);
