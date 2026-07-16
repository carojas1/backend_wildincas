import { spawn } from "node:child_process";

const services = [
  ["discovery", "backend/discovery/server.js"],
  ["auth", "backend/services/auth/server.js"],
  ["rooms", "backend/services/rooms/server.js"],
  ["guests", "backend/services/guests/server.js"],
  ["reservations", "backend/services/reservations/server.js"],
  ["operations", "backend/services/operations/server.js"],
  ["finance", "backend/services/finance/server.js"],
  ["employees", "backend/services/employees/server.js"],
  ["notifications", "backend/services/notifications/server.js"]
];
const healthPorts = [7000, 7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108];

const children = new Map();
let stopping = false;

function spawnService(name, script) {
  const child = spawn(process.execPath, [script], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.set(name, child);
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (stopping) return;
    console.error(`[${name}] stopped unexpectedly (${signal || code})`);
    shutdown(code || 1);
  });
}

for (const [name, script] of services) {
  spawnService(name, script);
}

await waitForServices();
spawnService("gateway", "backend/api-gateway/server.js");

async function waitForServices() {
  const deadline = Date.now() + Number(process.env.STARTUP_TIMEOUT_MS || 45000);
  const pending = new Set(healthPorts);
  while (pending.size && Date.now() < deadline && !stopping) {
    await Promise.all([...pending].map(async (servicePort) => {
      try {
        const response = await fetch(`http://127.0.0.1:${servicePort}/health`);
        if (response.ok) pending.delete(servicePort);
      } catch {
        // Service is still starting.
      }
    }));
    if (pending.size) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (pending.size) console.warn(`gateway starting with pending local ports: ${[...pending].join(", ")}`);
}

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
