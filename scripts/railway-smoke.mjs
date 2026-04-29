#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage:
  node scripts/railway-smoke.mjs --frontend https://<frontend> --backend https://<backend>

Environment fallback:
  FRONTEND_URL=https://<frontend>
  BACKEND_URL=https://<backend>
`);
  process.exit(0);
}

function readArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) return args[index + 1];
  return fallback;
}

function normalizeUrl(value, label) {
  if (!value) throw new Error(`Missing ${label}. Pass --${label} or set ${label.toUpperCase()}_URL.`);
  return value.replace(/\/+$/, "");
}

async function checkJson(url, label) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${label} returned ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${label} returned ${contentType || "unknown content-type"}, expected JSON`);
  }
  return response.json();
}

async function checkHtml(url, label) {
  const response = await fetch(url, { headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`${label} returned ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(`${label} returned ${contentType || "unknown content-type"}, expected HTML`);
  }
  return response.text();
}

async function main() {
  const frontend = normalizeUrl(readArg("frontend", process.env.FRONTEND_URL), "frontend");
  const backend = normalizeUrl(readArg("backend", process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL), "backend");

  const checks = [
    ["frontend /gaia-prime", () => checkHtml(`${frontend}/gaia-prime`, "frontend /gaia-prime")],
    ["frontend /login", () => checkHtml(`${frontend}/login`, "frontend /login")],
    ["backend /api", () => checkJson(`${backend}/api/`, "backend /api")],
    ["backend /api/public/dashboard", () => checkJson(`${backend}/api/public/dashboard`, "backend /api/public/dashboard")],
  ];

  for (const [label, run] of checks) {
    await run();
    console.log(`ok ${label}`);
  }

  const wsBase = (process.env.REACT_APP_WS_URL || backend.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")).replace(/\/+$/, "");
  console.log(`info websocket endpoint: ${wsBase}/ws/updates`);
  console.log("ok railway smoke checks passed");
}

main().catch((error) => {
  console.error(`fail ${error.message}`);
  process.exit(1);
});
