import { nanoid } from "nanoid";
import { guests as seedGuests } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, parseMoney } from "../../shared/service.js";

const port = Number(process.env.GUESTS_PORT || 7103);
const { app, listen } = createService({ name: "guests", port, description: "Registro de huespedes, check-in y check-out" });
let guests = structuredClone(seedGuests);
guests = await loadState("guests", seedGuests);

function persist() {
  saveState("guests", guests);
}

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

app.post("/", (req, res) => {
  const guest = {
    id: nanoid(8),
    status: "active",
    paid: parseMoney(req.body.paid),
    total: parseMoney(req.body.total),
    ...req.body
  };
  guests.unshift(guest);
  persist();
  ok(res, guest, 201);
});

app.post("/:id/payment", (req, res) => {
  const guest = guests.find((item) => item.id === req.params.id);
  if (!guest) return fail(res, "Huesped no encontrado", 404);
  guest.paid = parseMoney(guest.paid + parseMoney(req.body.amount));
  persist();
  ok(res, guest);
});

app.post("/:id/checkout", (req, res) => {
  const guest = guests.find((item) => item.id === req.params.id);
  if (!guest) return fail(res, "Huesped no encontrado", 404);
  guest.status = "checkout";
  guest.checkoutAt = new Date().toISOString();
  persist();
  ok(res, guest);
});

listen();
