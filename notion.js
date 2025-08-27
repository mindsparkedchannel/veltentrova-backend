const DB_ID = process.env.NOTION_LEADS_DATABASE_ID;
const NOTION_TOKEN =
  process.env.NOTION_API_KEY ||
  process.env.NOTION_TOKEN   ||
  process.env.NOTION_SECRET  || "";

function mask(s){ if(!s) return null; const t=String(s); return {len:t.length, head:t.slice(0,10), tail:t.slice(-4)}; }
console.log("[NOTION] source=",
  process.env.NOTION_API_KEY ? "NOTION_API_KEY" :
  process.env.NOTION_TOKEN   ? "NOTION_TOKEN"   :
  process.env.NOTION_SECRET  ? "NOTION_SECRET"  : "NONE",
  "mask=", mask(NOTION_TOKEN)
);

async function createLead({name, email, note, source}) {
  if(!NOTION_TOKEN) throw new Error("NOTION_TOKEN missing");
  if(!DB_ID)        throw new Error("NOTION_LEADS_DATABASE_ID missing");

  const headers = {
    "Authorization": `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };

  const body = {
    parent: { database_id: DB_ID },
    properties: {
      Name:   { title     : [{ text: { content: name || email || "Lead" } }] },
      Email:  { email     : email || "" },
      Note:   { rich_text : [{ text: { content: note   || "" } }] },
      Source: { rich_text : [{ text: { content: source || "" } }] },
      Status: { select    : { name: "New" } }
    }
  };

  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST", headers, body: JSON.stringify(body)
  });
  const txt = await r.text();
  if(!r.ok) throw new Error(`Notion create -> ${r.status}: ${txt}`);
  return JSON.parse(txt).id;
}

module.exports = { createLead };
