import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const commands = [
  ["discovery", "backend/discovery/server.js", 7000],
  ["auth", "backend/services/auth/server.js", 7101],
  ["rooms", "backend/services/rooms/server.js", 7102],
  ["guests", "backend/services/guests/server.js", 7103],
  ["operations", "backend/services/operations/server.js", 7104],
  ["finance", "backend/services/finance/server.js", 7105],
  ["employees", "backend/services/employees/server.js", 7106],
  ["notifications", "backend/services/notifications/server.js", 7107],
  ["gateway", "backend/api-gateway/server.js", 8080]
];

const children = [];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return payload;
}

async function waitForJson(url, attempts = 30) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await readJson(url);
    } catch (error) {
      lastError = error;
      await wait(500);
    }
  }
  throw lastError;
}

async function waitForGatewayServices(count = 7) {
  let payload;
  for (let index = 0; index < 30; index += 1) {
    payload = await waitForJson("http://127.0.0.1:8080/health");
    if ((payload.services || []).length >= count) return payload;
    await wait(500);
  }
  return payload;
}

async function main() {
  for (const [name, file] of commands) {
    const child = spawn(process.execPath, [file], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
    children.push(child);
  }

  const health = await waitForGatewayServices(7);
  assert.equal(health.status, "ok");
  assert.ok(health.services.length >= 7);

  const login = await readJson("http://127.0.0.1:8080/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "apolo", password: "admin123" })
  });
  assert.ok(login.data.token);

  const rooms = await readJson("http://127.0.0.1:8080/api/rooms");
  assert.ok(rooms.data.length >= 8);

  const guests = await readJson("http://127.0.0.1:8080/api/guests");
  assert.ok(guests.data.some((guest) => guest.name === "James Wilson"));

  const receipt = await readJson("http://127.0.0.1:8080/api/notifications/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: "test@wildincas.local", guestName: "Test", amount: 25, concept: "Prueba" })
  });
  assert.equal(receipt.data.status, "logged");

  const welcome = await readJson("http://127.0.0.1:8080/api/notifications/employees/welcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: "empleado@wildincas.local", name: "Empleado Test", username: "etest", password: "Temp123", role: "Recepcion" })
  });
  assert.equal(welcome.data.type, "employee-welcome");

  const exportResponse = await fetch("http://127.0.0.1:8080/api/finance/export.xls");
  assert.equal(exportResponse.ok, true);
  assert.ok((await exportResponse.text()).includes("SIMOT v2.0 - Reporte contable"));

  console.log("Smoke test passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await wait(200);
    for (const child of children) child.kill();
  });
