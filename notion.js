@'
const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));

const API_KEY = process.env.NOTION_API_KEY;
const LEADS_DB = process.env.NOTION_LEADS_DATABASE_ID;

const H = {
  "Authorization": `Bearer ${API_KEY}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

if (!API_KEY)  console.warn("[notion] NOTION_API_KEY fehlt!");
if (!LEADS_DB) console.warn("[notion] NOTION_LEADS_DATABASE_ID fehlt!");

async function notionPost(url, body) {
  const r = await fetch(url, { method:"POST", headers:H, body: JSON.stringify(body||{}) });
  if (!r.ok) throw new Error(`Notion ${url} -> ${r.status}: ${await r.text()}`);
  return r.json();
}
async function notionGet(url) {
  const r = await fetch(url, { headers:H });
  if (!r.ok) throw new Error(`Notion GET ${url} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

async function findLeadByEmail(email) {
  if (!LEADS_DB) throw new Error("NOTION_LEADS_DATABASE_ID missing");
  const body = {
    page_size: 1,
    filter: { property: "Email", email: { equals: email } }
  };
  const j = await notionPost(`https://api.notion.com/v1/databases/${LEADS_DB}/query`, body);
  if (j.results && j.results.length) {
    const p = j.results[0];
    return { id: p.id };
  }
  return null;
}

async function createLead({name, email, note, source}) {
  if (!LEADS_DB) throw new Error("NOTION_LEADS_DATABASE_ID missing");
  const body = {
    parent: { database_id: LEADS_DB },
    properties: {
      Name:   { title:    [{ text: { content: name || "" } }] },
      Email:  { email:    email || "" },
      Note:   { rich_text:[{ text: { content: note || "" } }] },
      Source: { rich_text:[{ text: { content: source || "" } }] },
      Status: { select:   { name: "New" } }
    }
  };
  const j = await notionPost("https://api.notion.com/v1/pages", body);
  return { id: j.id };
}

async function getStatus() {
  return { lastRun: new Date().toISOString().replace('T',' ').slice(0,19), runs: 1, lastTask: { status:"Done", result:{mode:"production"} } };
}
async function getUsage() {
  // Dummy — dein echter Zähler kann hier weiterhin angebunden bleiben
  return { today: 1200, date: new Date().toISOString().slice(0,10), cap: 200000, pct: 1 };
}
async function getContent() {
  return {
    items: [
      { title:"Token Budget Check", desc:"To Do • Medium", category:"task" },
      { title:"Notion Sync Health", desc:"To Do • Medium", category:"task" },
      { title:"Publish Status to Netlify", desc:"Done • Medium", category:"task" },
      { title:"Daily Crawl & Summaries", desc:"Doing • Medium", category:"task" },
      { title:"Initial Setup", desc:"Done • Medium", category:"task" }
    ]
  };
}

module.exports = { findLeadByEmail, createLead, getStatus, getUsage, getContent, notionGet, notionPost };
'@ | Set-Content -Encoding UTF8 "D:\Privat\AI\veltentrova-backend\notion.js"
