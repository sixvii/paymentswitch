# SSWI Workspace

Monorepo-style workspace containing separate frontend and backend apps with shared root scripts.

## Folder Layout

- `frontend/`: React + Vite web app (UI, pages, components, tests)
- `backend/`: Express API server
- `firebase.json`: Firebase Hosting config (serves from `frontend/dist`)
- `package.json`: Root orchestration scripts for running/building both apps

## Quick Start

1. Install root tools:

```bash
npm install
```

2. Install app dependencies:

```bash
npm --prefix backend install
npm --prefix frontend install
```

3. Run both apps in development:

```bash
npm run dev
```

## Build and Deploy Frontend

```bash
npm run build
npm run deploy:frontend
```

## Organization Rules

- Keep backend code inside `backend/src/`.
- Keep frontend app code inside `frontend/src/`.
- Treat `frontend/dist/` as generated output; never edit it directly.
- Avoid placing build output folders at the workspace root.
- Keep environment secrets in local `.env` files only.
