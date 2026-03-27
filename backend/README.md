# SSWI Backend (Express + Node.js)

This backend mirrors the API contract used by the frontend in src/lib/backendApi.ts.

## 1) Install dependencies

```bash
cd backend
npm install
```

## 2) Configure environment

```bash
cp .env.example .env
```

Set at least:
- PORT (default 5002)
- FRONTEND_ORIGIN (comma-separated allowlist of web origins)
- JWT_SECRET
- MONGODB_URI (default mongodb://127.0.0.1:27017)
- MONGODB_DB_NAME (default sswi)

Recommended `FRONTEND_ORIGIN` value for this project:

```env
FRONTEND_ORIGIN=http://localhost:8080,http://localhost:8081,http://localhost:8082,https://in-terpay.web.app,https://in-terpay.firebaseapp.com
```

Interswitch credentials are already prefilled in .env.example from your provided values.

## MongoDB

Start MongoDB locally before running the backend. Example with Homebrew:

```bash
brew services start mongodb-community
```

If MongoDB is unavailable, the server still starts with in-memory fallback.

## 3) Run backend

```bash
npm run dev
```

Health check:
- GET http://localhost:5002/health

## 4) Run frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend reads VITE_NODE_API_BASE_URL and defaults to http://localhost:5002.

## Render Deployment Note

When deploying backend to Render, set all environment variables from `.env.example` in Render dashboard, especially `FRONTEND_ORIGIN` so CORS allows your Firebase frontend (`https://in-terpay.web.app`).
