# Word Doc Generator (DOCX + JSON)

Monorepo with:
- `server/`: Node.js + Express + SQLite + local file storage
- `web/`: React UI (Vite)

## Requirements
- Node.js 22+ (uses built-in `node:sqlite`)

## Install
```bash
npm install
```

## Dev
```bash
npm run dev
```
- Web: `http://localhost:5173`
- API: `http://localhost:3001/api/health`

## Build + Run (production)
```bash
npm run build
npm run start
```
Server serves the built UI from `web/dist`.

## Docker (production)
Copy `docker-compose.sample.yml` to `docker-compose.yml`, adjust as needed, then run:
```bash
docker compose up -d --build
```
