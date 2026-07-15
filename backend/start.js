import { spawn } from "node:child_process";

const services = [
  ["gateway", "backend/api-gateway/server.js"],
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

const children = new Map();
let stopping = false;

for (const [name, script] of services) {
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

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
