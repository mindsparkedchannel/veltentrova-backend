const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = '2022-06-28';

function getText(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return '';
  return titles.map(t => (t && t.plain_text) ? t.plain_text : '').join('').trim();
}

function readStatus(props){
  if (props.Status?.select?.name) return props.Status.select.name;
  if (Array.isArray(props.Status?.multi_select) && props.Status.multi_select[0]?.name) return props.Status.multi_select[0].name;
  if (props.Status?.rich_text?.[0]?.plain_text) return props.Status.rich_text[0].plain_text;
  return 'Todo';
}
function readPriority(props){
  if (props.Priority?.select?.name) return props.Priority.select.name;
  if (Array.isArray(props.Priority?.multi_select) && props.Priority.multi_select[0]?.name) return props.Priority.multi_select[0].name;
  return 'Medium';
}

function mapTask(page) {
  const props = page.properties || {};
  const title = getText(props.Name?.title || props.Task?.title || []);
  const status = readStatus(props);
  const priority = readPriority(props);
  const lastRun = props.LastRun?.date?.start || null;

  return {
    id: page.id,
    title: title || 'Untitled',
    status,
    priority,
    lastRun,
    category: 'task'
  };
}

async function fetchTasks(limit = 50){
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return [];
  const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
  const body = { page_size: Math.min(100, limit) };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok){
    const text = await res.text();
    console.error('[notion] query failed:', res.status, res.statusText, text);
    return [];
  }
  const data = await res.json();
  return (data.results || []).map(mapTask);
}

module.exports = { fetchTasks };
