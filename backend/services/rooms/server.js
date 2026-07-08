import { nanoid } from "nanoid";
import { rooms as seedRooms } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok } from "../../shared/service.js";

const port = Number(process.env.ROOMS_PORT || 7102);
const { app, listen } = createService({ name: "rooms", port, description: "Gestion de habitaciones, estados y limpieza" });
let rooms = structuredClone(seedRooms);
rooms = await loadState("rooms", seedRooms);

function persist() {
  saveState("rooms", rooms);
}

app.get("/", (req, res) => {
  const { status } = req.query;
  const data = status && status !== "all" ? rooms.filter((room) => room.status === status) : rooms;
  ok(res, data);
});

app.get("/summary", (_req, res) => {
  ok(res, {
    total: rooms.length,
    available: rooms.filter((room) => room.status === "available").length,
    occupied: rooms.filter((room) => room.status === "occupied").length,
    cleaning: rooms.filter((room) => room.status === "cleaning").length,
    reserved: rooms.filter((room) => room.status === "reserved").length
  });
});

app.post("/", (req, res) => {
  const room = {
    id: String(req.body.id || nanoid(6)).trim(),
    floor: Number(req.body.floor || 1),
    type: req.body.type || "Habitacion Privada",
    capacity: Number(req.body.capacity || 1),
    rate: Number(req.body.rate || 0),
    status: req.body.status || "available",
    lastCleaned: req.body.lastCleaned || new Date().toISOString().slice(0, 10),
    notes: req.body.notes || "",
    amenities: req.body.amenities || []
  };
  if (!room.id) return fail(res, "El numero de habitacion es obligatorio", 422);
  if (room.rate < 0 || room.capacity < 1) return fail(res, "Capacidad y tarifa no validas", 422);
  if (rooms.some((item) => item.id === room.id)) return fail(res, "La habitacion ya existe", 409);
  rooms.push(room);
  persist();
  ok(res, room, 201);
});

app.patch("/:id", (req, res) => {
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  for (const field of ["type", "status", "lastCleaned", "notes", "guestId"]) {
    if (req.body[field] !== undefined) room[field] = req.body[field];
  }
  for (const field of ["floor", "capacity", "rate"]) {
    if (req.body[field] !== undefined) room[field] = Number(req.body[field]);
  }
  if (room.rate < 0 || room.capacity < 1) return fail(res, "Capacidad y tarifa no validas", 422);
  persist();
  ok(res, room);
});

app.patch("/:id/status", (req, res) => {
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  room.status = req.body.status || room.status;
  room.lastCleaned = room.status === "available" ? new Date().toISOString().slice(0, 10) : room.lastCleaned;
  persist();
  ok(res, room);
});

app.post("/:id/cleaning", (req, res) => {
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  room.status = "cleaning";
  room.notes = req.body.notes || room.notes || "";
  persist();
  ok(res, room);
});

listen();
