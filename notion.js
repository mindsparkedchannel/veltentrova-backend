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
/** --- PATCH: findLeadByEmail helper (Notion Email-Property) --- */
async function findLeadByEmail(email) {
  const token = process.env.NOTION_API_KEY;
  const dbId  = process.env.NOTION_LEADS_DATABASE_ID;
  if (!token || !dbId) throw new Error('NOTION vars missing');

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        property: 'Email',
        email: { equals: email }           // Email-Property Filter
      },
      page_size: 1
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`Notion query -> ${res.status}: ${JSON.stringify(json)}`);

  return (json.results && json.results[0]) || null;
}

// ohne das bestehende module.exports zu verändern:
try { module.exports.findLeadByEmail = findLeadByEmail; } catch {}
