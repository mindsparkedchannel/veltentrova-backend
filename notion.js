const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers() {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error("NOTION_API_KEY missing");
  return {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

function ensureDb() {
  const dbId = process.env.NOTION_LEADS_DATABASE_ID;
  if (!dbId) throw new Error("NOTION_LEADS_DATABASE_ID missing");
  return dbId;
}

async function createLead({ email, name, note, source, status = "New" }) {
  const dbId = ensureDb();

  const body = {
    parent: { database_id: dbId },
    properties: {
      Name:   { title     : [{ text: { content: name || email || "Lead" } }] },
      Email:  { email     : email || "" },
      Note:   { rich_text : note   ? [{ text: { content: note   } }] : [] },
      Source: { rich_text : source ? [{ text: { content: source } }] : [] },
      Status: { select    : { name: status } }
    }
  };

  const res  = await fetch(`${API}/pages`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`Notion create -> ${res.status}: ${JSON.stringify(json)}`);
  return json.id;
}

async function findLeadByEmail(email) {
  const dbId = ensureDb();
  const body = {
    filter: { property: "Email", email: { equals: email } },
    page_size: 1
  };

  const res  = await fetch(`${API}/databases/${dbId}/query`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`Notion query -> ${res.status}: ${JSON.stringify(json)}`);
  return (json.results && json.results[0]) || null;
}

module.exports = { createLead, findLeadByEmail };
