import express from 'express';

const app = express();
// CORS erlauben (Netlify darf zugreifen)
app.use((req,res,next)=>{ res.setHeader('Access-Control-Allow-Origin','*'); next(); });
const PORT = process.env.PORT || 3000;

// Config via ENV
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '300000');
const ADD_PER_RUN = parseInt(process.env.ADD_PER_RUN || '0');
const USAGE_CAP = parseInt(process.env.USAGE_CAP || '200000');
const MODE = process.env.MODE || 'production';

let usage = { today: 0, cap: USAGE_CAP };
let status = { lastRun: null, runs: 0, lastTask: { status: 'Idle', result: { mode: MODE } } };

function runTask() {
  status.lastRun = new Date().toISOString();
  status.runs++;
  status.lastTask = { status: 'Done', result: { mode: MODE } };

  usage.today += ADD_PER_RUN;
  if (usage.today > USAGE_CAP) usage.today = USAGE_CAP;
}

runTask(); // sofortiger erster Run beim Start
setInterval(runTask, INTERVAL_MS);

app.get('/status', (req, res) => res.json(status));
app.get('/usage', (req, res) => res.json(usage));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}, interval=${INTERVAL_MS}ms`);
});
