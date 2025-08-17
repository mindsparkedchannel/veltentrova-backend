# Veltentrova Backend (Railway)

Express server + scheduler for live status/usage API.

## Endpoints
- GET /status → JSON with last run, runs, mode
- GET /usage → JSON with token usage today vs cap

## Config (Environment Variables)
- INTERVAL_MS (default 300000)
- ADD_PER_RUN (default 0)
- USAGE_CAP (default 200000)
- MODE (default 'production')

## Run locally
```bash
npm install
npm start
```
