// backend/notion.js
import fetch from "node-fetch";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = "2022-06-28";

function getText(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return "";
  return titles.map(t => t?.plain_text || "").join("").trim();
}

function mapTask(page) {
  const props = page.properties || {};
  const title = getText(props.Name?.title || props.Task?.title || []);
  const status = props.Status?.select?.name || "Todo";
  const priority = props.Priority?.select?.name || "Medium";
  const lastRun = props.LastRun?.date?.start || null;

  return {
    id: page.id,
    title: title || "Untitled",
    status,
    priority,
    lastRun,
    category: "task"
  };
}

export async function fetchTasks(limit = 50) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    return [];
  }
  const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
  const body = { page_size: Math.min(100, limit) };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[notion] query failed:", res.status, res.statusText, text);
    return [];
  }
  const data = await res.json();
  return (data.results || []).map(mapTask);
}
