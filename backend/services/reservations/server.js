import { nanoid } from "nanoid";
import { guests as legacyGuests } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, parseMoney, serviceRequest } from "../../shared/service.js";

const port = Number(process.env.RESERVATIONS_PORT || 7108);
const { app, listen } = createService({
  name: "reservations",
  port,
  description: "Reservas, disponibilidad, estadias, consumos y checkout"
});

const seedState = createSeedState();
let state = normalizeState(await loadState("reservations", seedState));

function createSeedState() {
  const guests = legacyGuests.map((item) => ({
    id: `profile-${item.id}`,
    name: item.name,
    documentType: item.documentType,
    documentNumber: item.documentNumber,
    email: item.email,
    phone: "",
    address: "",
    country: item.country,
    createdAt: `${item.checkIn}T12:00:00.000Z`,
    updatedAt: `${item.checkIn}T12:00:00.000Z`
  }));
  const reservations = legacyGuests.map((item) => ({
    id: `reservation-${item.id}`,
    code: `WI-${item.id.toUpperCase()}`,
    guestId: `profile-${item.id}`,
    guest: guests.find((guest) => guest.id === `profile-${item.id}`),
    roomId: item.roomId,
    roomType: item.roomType,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    exitTime: item.exitTime,
    adults: 1,
    children: 0,
    nightlyRate: item.total / Math.max(1, nightsBetween(item.checkIn, item.checkOut)),
    lodgingSubtotal: item.total,
    status: item.status === "checkout" ? "checked_out" : "checked_in",
    source: "Migracion inicial",
    notes: "",
    charges: [],
    createdAt: `${item.checkIn}T12:00:00.000Z`,
    updatedAt: `${item.checkIn}T12:00:00.000Z`
  }));
  return { guests, reservations, audit: [] };
}

function normalizeState(value) {
  if (!value || Array.isArray(value)) return structuredClone(seedState);
  return {
    guests: Array.isArray(value.guests) ? value.guests : [],
    reservations: Array.isArray(value.reservations) ? value.reservations : [],
    audit: Array.isArray(value.audit) ? value.audit : []
  };
}

function persist() {
  return saveState("reservations", state);
}

// NOTE: Do NOT call persist() here on startup.
// If Supabase load timed out, persisting now would permanently overwrite real data with empty seed data.

function now() {
  return new Date().toISOString();
}

function today() {
  return now().slice(0, 10);
}

function nightsBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00Z`);
  const end = new Date(`${checkOut}T12:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86400000));
}

function activeReservation(item) {
  return ["confirmed", "checked_in"].includes(item.status);
}

function overlaps(item, roomId, checkIn, checkOut, excludeId = "") {
  return item.id !== excludeId
    && item.roomId === roomId
    && activeReservation(item)
    && checkIn < item.checkOut
    && checkOut > item.checkIn;
}

async function validateRoom(roomId, { immediateCheckIn = false, currentRoomId = "" } = {}) {
  let room;
  try {
    room = await serviceRequest("rooms", `/${encodeURIComponent(roomId)}`);
  } catch (error) {
    throw new Error(`No se pudo validar la habitacion ${roomId}: ${error.message}`);
  }
  if (["maintenance", "out_of_service"].includes(room.status)) {
    throw new Error(`La habitacion ${roomId} no esta habilitada para nuevas reservas`);
  }
  if (immediateCheckIn && roomId !== currentRoomId && room.status !== "available") {
    throw new Error(`La habitacion ${roomId} debe estar disponible antes de registrar el check-in`);
  }
  return room;
}

function invoiceLines(reservation) {
  const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
  return [
    {
      id: nanoid(8),
      category: "Hospedaje",
      description: `${nights} noche(s) - Hab. ${reservation.roomId}`,
      quantity: nights,
      unitPrice: parseMoney(reservation.nightlyRate),
      total: parseMoney(nights * reservation.nightlyRate)
    },
    ...(reservation.charges || []).map((charge) => ({
      id: charge.id,
      category: charge.category,
      description: charge.description,
      quantity: charge.quantity,
      unitPrice: charge.unitPrice,
      total: charge.total
    }))
  ];
}

function totals(reservation) {
  const lines = invoiceLines(reservation);
  const subtotal = parseMoney(lines.reduce((sum, line) => sum + line.total, 0));
  return { lines, subtotal, tax: 0, total: subtotal };
}

function audit(action, reservation, actor = "Sistema", detail = "") {
  state.audit.unshift({
    id: nanoid(8),
    action,
    reservationId: reservation?.id || null,
    code: reservation?.code || "",
    actor,
    detail,
    createdAt: now()
  });
  state.audit = state.audit.slice(0, 500);
}

function reservationView(item) {
  const summary = totals(item);
  return {
    ...item,
    guest: state.guests.find((guest) => guest.id === item.guestId) || item.guest,
    audit: state.audit.filter((entry) => entry.reservationId === item.id),
    ...summary,
    nights: nightsBetween(item.checkIn, item.checkOut)
  };
}

function upsertGuest(input) {
  const documentNumber = String(input.documentNumber || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  let guest = state.guests.find((item) =>
    (documentNumber && item.documentNumber === documentNumber)
    || (email && String(item.email || "").toLowerCase() === email)
  );
  const values = {
    name: String(input.name || "Consumidor final").trim(),
    documentType: input.documentType || "Cedula",
    documentNumber,
    email,
    phone: String(input.phone || "").trim(),
    address: String(input.address || "").trim(),
    country: String(input.country || "").trim()
  };
  if (guest) {
    Object.assign(guest, values, { updatedAt: now() });
  } else {
    guest = { id: nanoid(10), ...values, createdAt: now(), updatedAt: now() };
    state.guests.unshift(guest);
  }
  return guest;
}

async function queueNotification(eventType, reservation, extra = {}) {
  const guest = state.guests.find((item) => item.id === reservation.guestId);
  if (!guest?.email) return null;
  
  let paid = 0;
  let balance = 0;
  try {
    const payments = await serviceRequest("finance", `/payments?reservationId=${encodeURIComponent(reservation.id)}`);
    paid = parseMoney(payments.reduce((sum, item) => sum + item.amount, 0));
    const summary = totals(reservation);
    balance = parseMoney(summary.total - paid);
  } catch (err) {
    console.warn("Could not fetch payments for notification", err);
  }

  try {
    return await serviceRequest("notifications", "/events", {
      method: "POST",
      timeoutMs: 1500,
      body: {
        eventType,
        to: guest.email,
        idempotencyKey: `${eventType}:${reservation.id}:${extra.paymentId || extra.invoiceId || reservation.updatedAt}`,
        payload: {
          reservation: { ...reservationView(reservation), paid, balance },
          guest,
          ...extra
        }
      }
    });
  } catch (error) {
    console.warn(`Notification queue failed for ${eventType}: ${error.message}`);
    return { status: "queue_unavailable", error: error.message };
  }
}

app.get("/guests", (req, res) => {
  const query = String(req.query.q || "").toLowerCase();
  const data = state.guests.filter((guest) =>
    [guest.name, guest.documentNumber, guest.email, guest.phone]
      .some((value) => String(value || "").toLowerCase().includes(query))
  );
  ok(res, data);
});

app.post("/guests", async (req, res) => {
  if (!String(req.body.name || "").trim()) return fail(res, "El nombre del huesped es obligatorio", 422);
  const documentNumber = String(req.body.documentNumber || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const existing = state.guests.find((item) =>
    (documentNumber && item.documentNumber === documentNumber)
    || (email && String(item.email || "").toLowerCase() === email)
  );
  if (existing) return fail(res, "El huesped ya existe; abre su historial para crear otra estadia", 409);
  const guest = upsertGuest(req.body);
  audit("guest_created", null, req.body.actor || "Recepcion", `${guest.name} - ${guest.documentNumber || "sin documento"}`);
  await persist();
  ok(res, guest, 201);
});

app.patch("/guests/:id", async (req, res) => {
  const guest = state.guests.find((item) => item.id === req.params.id);
  if (!guest) return fail(res, "Huesped no encontrado", 404);
  for (const field of ["name", "documentType", "documentNumber", "email", "phone", "address", "country", "notes"]) {
    if (req.body[field] !== undefined) guest[field] = String(req.body[field]).trim();
  }
  if (!guest.name) return fail(res, "El nombre es obligatorio", 422);
  guest.updatedAt = now();
  await persist();
  ok(res, guest);
});

app.get("/reservations", (req, res) => {
  const { status = "all", q = "" } = req.query;
  const query = String(q).toLowerCase();
  const data = state.reservations
    .map(reservationView)
    .filter((item) => (status === "all" || item.status === status)
      && [item.code, item.guest?.name, item.guest?.documentNumber, item.roomId]
        .some((value) => String(value || "").toLowerCase().includes(query)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  ok(res, data);
});

app.get("/reservations/:id", (req, res) => {
  const item = state.reservations.find((reservation) => reservation.id === req.params.id);
  if (!item) return fail(res, "Reserva no encontrada", 404);
  ok(res, reservationView(item));
});

app.get("/availability", (req, res) => {
  const checkIn = String(req.query.checkIn || today());
  const checkOut = String(req.query.checkOut || checkIn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    return fail(res, "Selecciona un rango de fechas valido", 422);
  }
  const blockedRoomIds = [...new Set(state.reservations
    .filter((item) => overlaps(item, item.roomId, checkIn, checkOut))
    .map((item) => item.roomId))];
  ok(res, { checkIn, checkOut, blockedRoomIds });
});

app.get("/rooms/:roomId/occupancy", (req, res) => {
  const reservation = state.reservations.find((item) => item.roomId === req.params.roomId && item.status === "checked_in");
  ok(res, {
    roomId: req.params.roomId,
    occupied: Boolean(reservation),
    reservationId: reservation?.id || null,
    reservationCode: reservation?.code || null,
    guestId: reservation?.guestId || null
  });
});

app.post("/reservations", async (req, res) => {
  const checkIn = String(req.body.checkIn || today());
  const checkOut = String(req.body.checkOut || "");
  const roomId = String(req.body.roomId || "").trim();
  const nightlyRate = parseMoney(req.body.nightlyRate);
  if (!req.body.name || !roomId || !checkOut) return fail(res, "Nombre, habitacion y fechas son obligatorios", 422);
  if (checkOut <= checkIn) return fail(res, "La salida debe ser posterior a la entrada", 422);
  if (nightlyRate <= 0) return fail(res, "La tarifa debe ser mayor a cero", 422);
  if (state.reservations.some((item) => overlaps(item, roomId, checkIn, checkOut))) {
    return fail(res, "La habitacion ya tiene una reserva cruzada en esas fechas", 409);
  }
  const startCheckedIn = req.body.action === "check_in";
  try {
    await validateRoom(roomId, { immediateCheckIn: startCheckedIn });
  } catch (error) {
    return fail(res, error.message, 409);
  }
  const guestMatch = state.guests.find((item) =>
    (req.body.documentNumber && item.documentNumber === String(req.body.documentNumber).trim())
    || (req.body.email && String(item.email || "").toLowerCase() === String(req.body.email).trim().toLowerCase())
  );
  const previousGuest = guestMatch ? structuredClone(guestMatch) : null;
  const guest = upsertGuest(req.body);
  const reservation = {
    id: nanoid(10),
    code: `RES-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`,
    guestId: guest.id,
    roomId,
    roomType: req.body.roomType || "",
    checkIn,
    checkOut,
    exitTime: req.body.exitTime || "11:00",
    adults: Math.max(1, Number(req.body.adults || 1)),
    children: Math.max(0, Number(req.body.children || 0)),
    nightlyRate,
    lodgingSubtotal: parseMoney(nightsBetween(checkIn, checkOut) * nightlyRate),
    status: startCheckedIn ? "checked_in" : "confirmed",
    source: req.body.source || "Recepcion",
    notes: req.body.notes || "",
    charges: [],
    createdAt: now(),
    updatedAt: now(),
    checkedInAt: startCheckedIn ? now() : null
  };
  state.reservations.unshift(reservation);
  audit("reservation_created", reservation, req.body.actor || "Recepcion", `Hab. ${roomId}`);
  try {
    if (startCheckedIn) {
      await serviceRequest("rooms", `/${roomId}/status`, { method: "PATCH", body: { status: "occupied", guestId: guest.id } });
    }
    await persist();
  } catch (error) {
    state.reservations = state.reservations.filter((item) => item.id !== reservation.id);
    state.audit = state.audit.filter((item) => item.reservationId !== reservation.id);
    if (previousGuest) Object.assign(guest, previousGuest);
    else state.guests = state.guests.filter((item) => item.id !== guest.id);
    if (startCheckedIn) {
      await serviceRequest("rooms", `/${roomId}/status`, { method: "PATCH", body: { status: "available" } }).catch(() => null);
    }
    return fail(res, `No se pudo guardar la reserva completa: ${error.message}`, 503);
  }
  const notification = await queueNotification(startCheckedIn ? "check-in" : "reservation-confirmed", reservation);
  ok(res, { reservation: reservationView(reservation), notification }, 201);
});

app.patch("/reservations/:id", async (req, res) => {
  const reservation = state.reservations.find((item) => item.id === req.params.id);
  if (!reservation) return fail(res, "Reserva no encontrada", 404);
  const previousReservation = structuredClone(reservation);
  const guest = state.guests.find((item) => item.id === reservation.guestId);
  const previousGuest = guest ? structuredClone(guest) : null;
  const previousRoomId = reservation.roomId;
  const nextCheckIn = req.body.checkIn || reservation.checkIn;
  const nextCheckOut = req.body.checkOut || reservation.checkOut;
  const nextRoomId = req.body.roomId || reservation.roomId;
  if (nextCheckOut <= nextCheckIn) return fail(res, "La salida debe ser posterior a la entrada", 422);
  if (state.reservations.some((item) => overlaps(item, nextRoomId, nextCheckIn, nextCheckOut, reservation.id))) {
    return fail(res, "La habitacion ya tiene una reserva cruzada en esas fechas", 409);
  }
  if (nextRoomId !== previousRoomId) {
    try {
      await validateRoom(nextRoomId, { immediateCheckIn: reservation.status === "checked_in", currentRoomId: previousRoomId });
    } catch (error) {
      return fail(res, error.message, 409);
    }
  }
  for (const field of ["roomId", "roomType", "checkIn", "checkOut", "exitTime", "source", "notes"]) {
    if (req.body[field] !== undefined) reservation[field] = req.body[field];
  }
  for (const field of ["adults", "children", "nightlyRate"]) {
    if (req.body[field] !== undefined) reservation[field] = parseMoney(req.body[field]);
  }
  if (req.body.name || req.body.email || req.body.documentNumber) {
    for (const field of ["name", "documentType", "documentNumber", "email", "phone", "address", "country", "notes"]) {
      if (req.body[field] !== undefined) guest[field] = String(req.body[field]).trim();
    }
    guest.updatedAt = now();
  }
  reservation.lodgingSubtotal = parseMoney(nightsBetween(reservation.checkIn, reservation.checkOut) * reservation.nightlyRate);
  reservation.updatedAt = now();
  if (reservation.status === "checked_in" && previousRoomId !== reservation.roomId) {
    try {
      await serviceRequest("rooms", `/${reservation.roomId}/status`, {
        method: "PATCH",
        body: { status: "occupied", guestId: reservation.guestId }
      });
      await serviceRequest("rooms", `/${previousRoomId}/cleaning`, {
        method: "POST",
        body: { notes: `Traslado de ${reservation.code} a la habitacion ${reservation.roomId}. Limpieza y revision pendientes.` }
      });
    } catch (error) {
      Object.assign(reservation, previousReservation);
      if (guest && previousGuest) Object.assign(guest, previousGuest);
      await Promise.allSettled([
        serviceRequest("rooms", `/${nextRoomId}/status`, { method: "PATCH", body: { status: "available" } }),
        serviceRequest("rooms", `/${previousRoomId}/status`, { method: "PATCH", body: { status: "occupied", guestId: reservation.guestId } })
      ]);
      await persist();
      return fail(res, `No se pudo completar el traslado: ${error.message}`, 503);
    }
    audit("room_changed", reservation, req.body.actor || "Recepcion", `${previousRoomId} -> ${reservation.roomId}`);
  }
  audit("reservation_updated", reservation, req.body.actor || "Recepcion");
  await persist();
  const notification = await queueNotification("reservation-modified", reservation);
  ok(res, { reservation: reservationView(reservation), notification });
});

app.post("/reservations/:id/check-in", async (req, res) => {
  const reservation = state.reservations.find((item) => item.id === req.params.id);
  if (!reservation) return fail(res, "Reserva no encontrada", 404);
  if (reservation.status !== "confirmed") return fail(res, "Solo una reserva confirmada puede hacer check-in", 409);
  const previousReservation = structuredClone(reservation);
  const previousAuditIds = new Set(state.audit.map((item) => item.id));
  try {
    await validateRoom(reservation.roomId, { immediateCheckIn: true });
    await serviceRequest("rooms", `/${reservation.roomId}/status`, {
      method: "PATCH",
      body: { status: "occupied", guestId: reservation.guestId }
    });
  } catch (error) {
    return fail(res, error.message, 409);
  }
  reservation.status = "checked_in";
  reservation.checkedInAt = now();
  reservation.updatedAt = now();
  audit("check_in", reservation, req.body.actor || "Recepcion");
  try {
    await persist();
  } catch (error) {
    Object.assign(reservation, previousReservation);
    state.audit = state.audit.filter((item) => previousAuditIds.has(item.id));
    await serviceRequest("rooms", `/${reservation.roomId}/status`, { method: "PATCH", body: { status: "available" } }).catch(() => null);
    return fail(res, `No se pudo guardar el check-in: ${error.message}`, 503);
  }
  const notification = await queueNotification("check-in", reservation);
  ok(res, { reservation: reservationView(reservation), notification });
});

app.post("/reservations/:id/charges", async (req, res) => {
  const reservation = state.reservations.find((item) => item.id === req.params.id);
  if (!reservation) return fail(res, "Reserva no encontrada", 404);
  if (!activeReservation(reservation)) return fail(res, "No se pueden agregar consumos a una reserva cerrada", 409);
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  const unitPrice = parseMoney(req.body.unitPrice);
  if (!req.body.description || unitPrice <= 0) return fail(res, "Descripcion y precio son obligatorios", 422);
  const charge = {
    id: nanoid(9),
    category: req.body.category || "Servicio adicional",
    description: String(req.body.description).trim(),
    quantity,
    unitPrice,
    total: parseMoney(quantity * unitPrice),
    notes: req.body.notes || "",
    createdBy: req.body.actor || "Recepcion",
    createdAt: now()
  };
  reservation.charges = Array.isArray(reservation.charges) ? reservation.charges : [];
  reservation.charges.push(charge);
  reservation.updatedAt = now();
  audit("charge_added", reservation, charge.createdBy, `${charge.description}: ${charge.total}`);
  await persist();
  ok(res, { reservation: reservationView(reservation), charge }, 201);
});

app.delete("/reservations/:id/charges/:chargeId", async (req, res) => {
  const reservation = state.reservations.find((item) => item.id === req.params.id);
  if (!reservation) return fail(res, "Reserva no encontrada", 404);
  const before = reservation.charges?.length || 0;
  reservation.charges = (reservation.charges || []).filter((item) => item.id !== req.params.chargeId);
  if (reservation.charges.length === before) return fail(res, "Consumo no encontrado", 404);
  reservation.updatedAt = now();
  audit("charge_removed", reservation, req.body.actor || "Recepcion", req.params.chargeId);
  await persist();
  ok(res, reservationView(reservation));
});

app.post("/reservations/:id/payments", async (req, res) => {
  const reservation = state.reservations.find((item) => item.id === req.params.id);
  if (!reservation) return fail(res, "Reserva no encontrada", 404);
  const amount = parseMoney(req.body.amount);
  if (amount <= 0) return fail(res, "El pago debe ser mayor a cero", 422);
  const payments = await serviceRequest("finance", `/payments?reservationId=${encodeURIComponent(reservation.id)}`);
  const paid = parseMoney(payments
    .filter((item) => item.status !== "voided")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const pending = parseMoney(Math.max(0, totals(reservation).total - paid));
  if (pending <= 0) return fail(res, "La estadia ya esta pagada", 409);
  if (amount > pending) return fail(res, `El pago supera el saldo pendiente de ${pending.toFixed(2)}`, 422);
  const payment = await serviceRequest("finance", "/payments", {
    method: "POST",
    body: {
      reservationId: reservation.id,
      reservationCode: reservation.code,
      guestId: reservation.guestId,
      guestName: state.guests.find((item) => item.id === reservation.guestId)?.name,
      roomId: reservation.roomId,
      amount,
      received: req.body.received,
      method: req.body.method,
      reference: req.body.reference,
      notes: req.body.notes,
      idempotencyKey: req.body.idempotencyKey || `payment:${reservation.id}:${nanoid(8)}`
    }
  });
  reservation.updatedAt = now();
  audit("payment_registered", reservation, req.body.actor || "Caja", `${payment.id}: ${payment.amount}`);
  await persist();
  const notification = await queueNotification("payment-confirmation", reservation, { payment, paymentId: payment.id });
  ok(res, { payment, notification }, 201);
});

app.post("/reservations/:id/checkout", async (req, res) => {
  const reservation = state.reservations.find((item) => item.id === req.params.id);
  if (!reservation) return fail(res, "Reserva no encontrada", 404);
  if (reservation.status !== "checked_in") return fail(res, "La estadia debe estar activa para hacer checkout", 409);
  const summary = totals(reservation);
  const payments = await serviceRequest("finance", `/payments?reservationId=${encodeURIComponent(reservation.id)}`);
  const paid = parseMoney(payments
    .filter((item) => item.status !== "voided")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const pending = parseMoney(Math.max(0, summary.total - paid));
  if (pending > 0) return fail(res, `Registra primero el saldo pendiente de ${pending.toFixed(2)} antes de marcar la salida`, 409);
  const invoice = await serviceRequest("finance", "/invoices/finalize", {
    method: "POST",
    body: {
      reservationId: reservation.id,
      reservationCode: reservation.code,
      guest: state.guests.find((item) => item.id === reservation.guestId),
      roomId: reservation.roomId,
      roomType: reservation.roomType,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      nights: nightsBetween(reservation.checkIn, reservation.checkOut),
      lines: summary.lines,
      taxRate: 0,
      notes: req.body.notes || "Nota de venta final de hospedaje",
      issuedBy: req.body.actor || "Recepcion",
      idempotencyKey: `invoice-final:${reservation.id}`
    }
  });
  reservation.status = "checked_out";
  reservation.checkedOutAt = now();
  reservation.checkedOutBy = req.body.actor || "Recepcion";
  reservation.invoiceId = invoice.id;
  reservation.invoiceNumber = invoice.number;
  reservation.updatedAt = now();
  audit("checkout", reservation, req.body.actor || "Recepcion", invoice.number);
  await persist();
  let cleaning = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      cleaning = await serviceRequest("rooms", `/${reservation.roomId}/cleaning`, {
        method: "POST",
        body: { notes: `Salida ${reservation.code}. Limpieza completa y revision de inventario.` },
        timeoutMs: 12000
      });
      break;
    } catch (error) {
      cleaning = { status: "retry_required", error: error.message, attempts: attempt };
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  const notification = await queueNotification("invoice-finalized", reservation, { invoice, invoiceId: invoice.id });
  ok(res, { reservation: reservationView(reservation), invoice, notification, cleaning });
});

app.post("/reservations/:id/cancel", async (req, res) => {
  const reservation = state.reservations.find((item) => item.id === req.params.id);
  if (!reservation) return fail(res, "Reserva no encontrada", 404);
  if (!["confirmed"].includes(reservation.status)) return fail(res, "Solo una reserva confirmada puede cancelarse", 409);
  reservation.status = "cancelled";
  reservation.cancellationReason = req.body.reason || "Cancelada por recepcion";
  reservation.cancelledAt = now();
  reservation.updatedAt = now();
  audit("reservation_cancelled", reservation, req.body.actor || "Recepcion", reservation.cancellationReason);
  await persist();
  const notification = await queueNotification("reservation-cancelled", reservation);
  ok(res, { reservation: reservationView(reservation), notification });
});

app.get("/dashboard", async (_req, res) => {
  const date = today();
  const reservations = state.reservations.map(reservationView);
  const occupied = reservations.filter((item) => item.status === "checked_in");
  const arrivals = reservations.filter((item) => item.status === "confirmed" && item.checkIn === date);
  const departures = reservations.filter((item) => item.status === "checked_in" && item.checkOut <= date);
  const upcoming = reservations.filter((item) => item.status === "confirmed" && item.checkIn >= date).slice(0, 8);
  const occupiedRoomIds = [...new Set(occupied.map((item) => item.roomId))];
  ok(res, { date, occupied, occupiedRoomIds, arrivals, departures, upcoming, guests: state.guests.length });
});

app.get("/audit", (_req, res) => ok(res, state.audit));

listen();
