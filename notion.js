const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;          // Tasks DB (optional)
const NOTION_LEADS_DATABASE_ID = process.env.NOTION_LEADS_DATABASE_ID;
const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";

// simple helper
async function notion(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const t = await res.text().catch(()=>"");
    throw new Error(`Notion ${method} ${url} -> ${res.status}: ${t}`);
  }
  return await res.json();
}

function textFromTitle(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.map(x => x?.plain_text || x?.text?.content || "").join("").trim();
}
function readSelect(p, key, defVal) {
  if (!p || !key) return defVal;
  const prop = p[key];
  if (!prop) return defVal;
  if (prop.select?.name) return prop.select.name;
  if (Array.isArray(prop.multi_select) && prop.multi_select[0]?.name) return prop.multi_select[0].name;
  if (prop.rich_text?.[0]?.plain_text) return prop.rich_text[0].plain_text;
  return defVal;
}

function mapTask(page) {
  const props = page.properties || {};
  const title = textFromTitle(props.Name?.title || props.Task?.title || []);
  const status = readSelect(props, "Status", "Todo");
  const priority = readSelect(props, "Priority", "Medium");
  return {
    id: page.id,
    title: title || "Untitled",
    status,
    priority,
    category: "task"
  };
}

async function fetchTasks(limit = 50) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return []; // optional
  const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
  const data = await notion("POST", url, { page_size: Math.min(100, limit) });
  return (data.results || []).map(mapTask);
}

async function createLead({ email, name, note, source }) {
  if (!NOTION_API_KEY || !NOTION_LEADS_DATABASE_ID) {
    throw new Error("Missing NOTION_API_KEY or NOTION_LEADS_DATABASE_ID");
  }
  const payload = {
    parent: { database_id: NOTION_LEADS_DATABASE_ID },
    properties: {
      Name:   { title: [{ text: { content: String(name || email).slice(0, 200) } }] },
      Email:  { email: email || "" },
      Source: { rich_text: source ? [{ text: { content: String(source) } }] : [] },
      Note:   { rich_text: note   ? [{ text: { content: String(note) } }]   : [] },
      Status: { select: { name: "New" } }
    }
  };
  return await notion("POST", "https://api.notion.com/v1/pages", payload);
}

module.exports = { fetchTasks, createLead };
