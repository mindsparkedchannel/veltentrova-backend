// notion.js  — CommonJS, nur das Nötige für /lead
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const LEADS_DB = process.env.NOTION_LEADS_DATABASE_ID || process.env.NOTION_DATABASE_ID;

if (!NOTION_API_KEY) {
  throw new Error("NOTION_API_KEY missing");
}
if (!LEADS_DB) {
  console.warn("NOTION_LEADS_DATABASE_ID missing — /lead wird 400 liefern.");
}

const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const baseHeaders = {
  "Authorization": `Bearer ${NOTION_API_KEY}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json"
};

async function createLead({ email, name, note = "", source = "status-page" }) {
  if (!LEADS_DB) return { ok:false, error:"NOTION_LEADS_DATABASE_ID missing" };

  const body = {
    parent: { database_id: LEADS_DB },
    properties: {
      Name:   { title:     [{ text: { content: name || email || "Lead" } }] },
      Email:  { email:     email || "" },
      Note:   { rich_text: note   ? [{ text: { content: note } }]   : [] },
      Source: { rich_text: source ? [{ text: { content: source } }] : [] },
      Status: { select:    { name: "New" } }
    }
  };

  const res = await fetch(`${API}/pages`, { method:"POST", headers: baseHeaders, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.text();
    return { ok:false, error:`Notion POST /pages -> ${res.status}: ${err}` };
  }
  const json = await res.json();
  return { ok:true, id: json.id };
}

// Falls server.js mehr importiert, liefern wir No-Ops zurück, damit nichts crasht.
async function getStatus() { return {}; }
async function getUsage()  { return {}; }
async function getContent(){ return []; }

module.exports = { createLead, getStatus, getUsage, getContent };
