import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function assertSupabaseSchemaCoverage() {
  const schema = readFileSync("docs/supabase-schema.sql", "utf8");
  const sources = [
    "backend/services/auth/server.js",
    "backend/services/rooms/server.js",
    "backend/services/guests/server.js",
    "backend/services/reservations/server.js",
    "backend/services/operations/server.js",
    "backend/services/finance/server.js",
    "backend/services/employees/server.js",
    "backend/services/notifications/server.js"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  const keys = [...sources.matchAll(/(?:loadState|saveState)\("([a-z0-9_]+)"/g)]
    .map((match) => match[1]);
  for (const key of new Set(keys)) {
    assert.match(schema, new RegExp(`create table if not exists public\\.simot_${key}\\b`),
      `Supabase schema is missing simot_${key}`);
  }
}

const commands = [
  ["discovery", "backend/discovery/server.js", 7000],
  ["auth", "backend/services/auth/server.js", 7101],
  ["rooms", "backend/services/rooms/server.js", 7102],
  ["guests", "backend/services/guests/server.js", 7103],
  ["reservations", "backend/services/reservations/server.js", 7108],
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
  assertSupabaseSchemaCoverage();

  for (const [name, file] of commands) {
    const child = spawn(process.execPath, [file], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
    children.push(child);
  }

  const health = await waitForGatewayServices(8);
  assert.equal(health.status, "ok");
  assert.ok(health.services.length >= 8);

  const login = await readJson("http://127.0.0.1:8080/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "apolo", password: "admin123" })
  });
  assert.ok(login.data.token);
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${login.data.token}` };

  const rooms = await readJson("http://127.0.0.1:8080/api/rooms", { headers: authHeaders });
  assert.equal(rooms.data.length, 7);
  const room202 = await readJson("http://127.0.0.1:8080/api/rooms/202", { headers: authHeaders });
  assert.equal(room202.data.rate, 35);

  const missingRoomReservation = await fetch("http://127.0.0.1:8080/api/reservations/reservations", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Reserva invalida",
      roomId: "999",
      checkIn: "2027-01-10",
      checkOut: "2027-01-12",
      nightlyRate: 35
    })
  });
  assert.equal(missingRoomReservation.status, 409);

  await readJson("http://127.0.0.1:8080/api/finance/shifts/open", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ shift: "Tarde", responsible: "Prueba automatizada", initial: 100 })
  });

  const reservationResult = await readJson("http://127.0.0.1:8080/api/reservations/reservations", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Huesped Integracion",
      documentType: "Cedula",
      documentNumber: "TEST-001",
      email: "test@example.com",
      roomId: "202",
      roomType: "Habitacion Privada",
      checkIn: "2027-01-10",
      checkOut: "2027-01-12",
      nightlyRate: 35,
      action: "check_in"
    })
  });
  const reservation = reservationResult.data.reservation;
  assert.equal(reservation.total, 70);

  const occupiedCleaning = await fetch("http://127.0.0.1:8080/api/rooms/202/cleaning", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ notes: "No debe permitirse con huesped activo" })
  });
  assert.equal(occupiedCleaning.status, 409);

  await readJson("http://127.0.0.1:8080/api/rooms/302/status", {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ status: "maintenance" })
  });
  const blockedMove = await fetch(`http://127.0.0.1:8080/api/reservations/reservations/${reservation.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ roomId: "302", actor: "Prueba automatizada" })
  });
  assert.equal(blockedMove.status, 409);

  await readJson("http://127.0.0.1:8080/api/rooms/302/status", {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ status: "available" })
  });
  const movedReservation = await readJson(`http://127.0.0.1:8080/api/reservations/reservations/${reservation.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ roomId: "302", roomType: "Habitacion Privada", actor: "Prueba automatizada" })
  });
  assert.equal(movedReservation.data.reservation.roomId, "302");
  const roomsAfterMove = await readJson("http://127.0.0.1:8080/api/rooms", { headers: authHeaders });
  assert.equal(roomsAfterMove.data.find((item) => item.id === "202").status, "cleaning");
  assert.equal(roomsAfterMove.data.find((item) => item.id === "302").status, "occupied");

  await readJson(`http://127.0.0.1:8080/api/reservations/reservations/${reservation.id}/charges`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ category: "Lavanderia", description: "Servicio de lavanderia", quantity: 2, unitPrice: 4 })
  });

  const paymentResult = await readJson(`http://127.0.0.1:8080/api/reservations/reservations/${reservation.id}/payments`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ amount: 30, received: 40, method: "Efectivo", idempotencyKey: `smoke-payment-${reservation.id}` })
  });
  assert.equal(paymentResult.data.payment.change, 10);

  const duplicatePayment = await readJson(`http://127.0.0.1:8080/api/reservations/reservations/${reservation.id}/payments`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ amount: 30, received: 40, method: "Efectivo", idempotencyKey: `smoke-payment-${reservation.id}` })
  });
  assert.equal(duplicatePayment.data.payment.id, paymentResult.data.payment.id);
  const reservationPayments = await readJson(`http://127.0.0.1:8080/api/finance/payments?reservationId=${reservation.id}`, { headers: authHeaders });
  assert.equal(reservationPayments.data.length, 1);
  const shiftWithPayment = await readJson("http://127.0.0.1:8080/api/finance/shifts", { headers: authHeaders });
  assert.equal(shiftWithPayment.data.openShift.expected, 130);

  const overpayment = await fetch(`http://127.0.0.1:8080/api/reservations/reservations/${reservation.id}/payments`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ amount: 49, received: 49, method: "Efectivo", idempotencyKey: `smoke-overpayment-${reservation.id}` })
  });
  assert.equal(overpayment.status, 422);

  const checkout = await readJson(`http://127.0.0.1:8080/api/reservations/reservations/${reservation.id}/checkout`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ actor: "Prueba automatizada" })
  });
  assert.equal(checkout.data.invoice.total, 78);
  assert.equal(checkout.data.invoice.balance, 48);
  assert.equal(checkout.data.invoice.roomId, "302");

  await readJson(`http://127.0.0.1:8080/api/finance/payments/${paymentResult.data.payment.id}/void`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ actor: "Prueba automatizada", reason: "Validar conciliacion" })
  });
  const shiftAfterVoid = await readJson("http://127.0.0.1:8080/api/finance/shifts", { headers: authHeaders });
  assert.equal(shiftAfterVoid.data.openShift.expected, 100);
  const movementsAfterVoid = await readJson("http://127.0.0.1:8080/api/finance/movements", { headers: authHeaders });
  const voidedPaymentMovement = movementsAfterVoid.data.find((item) => item.paymentId === paymentResult.data.payment.id);
  assert.equal(voidedPaymentMovement.status, "voided");
  assert.equal(voidedPaymentMovement.voidReason, "Validar conciliacion");

  const onboarding = await readJson("http://127.0.0.1:8080/api/employees/onboard", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Empleado Integracion",
      email: "empleado.integracion@example.com",
      username: "eintegracion",
      password: "Temporal#2026",
      roleId: "limpieza",
      role: "Limpieza",
      modules: ["rooms", "cleaning", "logbook"]
    })
  });
  assert.equal(onboarding.data.employee.username, "eintegracion");
  assert.deepEqual(onboarding.data.user.modules, ["rooms", "cleaning", "logbook"]);
  const updatedEmployee = await readJson(`http://127.0.0.1:8080/api/employees/${onboarding.data.employee.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ roleId: "mantenimiento", role: "Mantenimiento", modules: ["rooms", "logbook"] })
  });
  assert.deepEqual(updatedEmployee.data.access.modules, ["rooms", "logbook"]);

  const welcome = await readJson("http://127.0.0.1:8080/api/notifications/employees/welcome", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ to: "empleado@wildincas.local", name: "Empleado Test", username: "etest", password: "Temp123", role: "Recepcion" })
  });
  assert.equal(welcome.data.eventType, "employee-welcome");

  const exportResponse = await fetch("http://127.0.0.1:8080/api/finance/export.xlsx", { headers: authHeaders });
  assert.equal(exportResponse.ok, true);
  assert.ok((await exportResponse.arrayBuffer()).byteLength > 5000);

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
