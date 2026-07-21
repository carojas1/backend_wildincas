import { nanoid } from "nanoid";
import { guests as seedGuests } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, parseMoney } from "../../shared/service.js";

const port = Number(process.env.GUESTS_PORT || 7103);
const { app, listen } = createService({ name: "guests", port, description: "Registro de huespedes, check-in y check-out" });
let guests = structuredClone(seedGuests);
guests = await loadState("guests", seedGuests);

function persist() {
  return saveState("guests", guests);
}

// NOTE: Do NOT persist on startup — if Supabase load timed out, persisting now would wipe real data.

app.get("/", (req, res) => {
  const { q = "", status = "all" } = req.query;
  const query = String(q).toLowerCase();
  const data = guests.filter((guest) => {
    const matchesStatus = status === "all" || guest.status === status;
    const matchesQuery = [guest.name, guest.documentNumber, guest.email].some((value) => String(value || "").toLowerCase().includes(query));
    return matchesStatus && matchesQuery;
  });
  ok(res, data);
});

app.post("/", async (req, res) => {
  const paid = parseMoney(req.body.paid);
  const guest = {
    id: nanoid(8),
    status: "active",
    paid,
    total: parseMoney(req.body.total),
    payments: paid > 0 ? [{
      id: nanoid(8),
      amount: paid,
      method: req.body.method || "Efectivo",
      received: parseMoney(req.body.received || paid),
      change: parseMoney(parseMoney(req.body.received || paid) - paid),
      note: "Pago inicial / check-in",
      createdAt: new Date().toISOString()
    }] : [],
    ...req.body,
    paid
  };
  guests.unshift(guest);
  await persist();
  ok(res, guest, 201);
});

app.patch("/:id", async (req, res) => {
  const guest = guests.find((item) => item.id === req.params.id);
  if (!guest) return fail(res, "Huesped no encontrado", 404);
  for (const field of ["name", "country", "documentType", "documentNumber", "email", "roomId", "roomType", "checkIn", "checkOut", "exitTime", "status", "notes"]) {
    if (req.body[field] !== undefined) guest[field] = req.body[field];
  }
  for (const field of ["paid", "total"]) {
    if (req.body[field] !== undefined) guest[field] = parseMoney(req.body[field]);
  }
  await persist();
  ok(res, guest);
});

app.post("/:id/payment", async (req, res) => {
  const guest = guests.find((item) => item.id === req.params.id);
  if (!guest) return fail(res, "Huesped no encontrado", 404);
  const amount = parseMoney(req.body.amount);
  const received = parseMoney(req.body.received || amount);
  const payment = {
    id: nanoid(8),
    amount,
    method: req.body.method || "Efectivo",
    received,
    change: parseMoney(received - amount),
    note: req.body.note || "Pago de hospedaje",
    createdAt: new Date().toISOString()
  };
  guest.payments = Array.isArray(guest.payments) ? guest.payments : [];
  guest.payments.unshift(payment);
  guest.paid = parseMoney(guest.paid + amount);
  await persist();
  ok(res, { guest, payment });
});

app.post("/:id/checkout", async (req, res) => {
  const guest = guests.find((item) => item.id === req.params.id);
  if (!guest) return fail(res, "Huesped no encontrado", 404);
  guest.status = "checkout";
  guest.checkoutAt = new Date().toISOString();
  await persist();
  ok(res, guest);
});

listen();
