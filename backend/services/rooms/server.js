import { nanoid } from "nanoid";
import { rooms as seedRooms } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, serviceRequest } from "../../shared/service.js";

const port = Number(process.env.ROOMS_PORT || 7102);
const { app, listen } = createService({ name: "rooms", port, description: "Gestion de habitaciones, estados y limpieza" });
const storedRooms = await loadState("rooms", seedRooms);
let rooms = Array.isArray(storedRooms) && storedRooms.length ? storedRooms : structuredClone(seedRooms);
const allowedStatuses = ["available", "occupied", "cleaning", "maintenance", "out_of_service"];
await saveState("rooms", rooms).catch((error) => console.warn(`Initial room persistence deferred: ${error.message}`));

function persist() {
  return saveState("rooms", rooms);
}

async function commit(previousRooms, res) {
  try {
    await persist();
    return true;
  } catch (error) {
    rooms = previousRooms;
    fail(res, `No se pudo guardar el inventario de habitaciones: ${error.message}`, 503);
    return false;
  }
}

async function activeStay(roomId) {
  return serviceRequest("reservations", `/rooms/${encodeURIComponent(roomId)}/occupancy`);
}

async function ensureRoomCanLeaveOccupiedState(room, nextStatus, res) {
  if (nextStatus === "occupied") return true;
  try {
    const occupancy = await activeStay(room.id);
    if (occupancy.occupied) {
      fail(res, `La habitacion ${room.id} tiene la estadia ${occupancy.reservationCode} activa. Registra el checkout o traslada al huesped antes de cambiar el estado.`, 409);
      return false;
    }
    return true;
  } catch (error) {
    fail(res, `No se pudo verificar la ocupacion de la habitacion: ${error.message}`, 503);
    return false;
  }
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

app.get("/:id", (req, res) => {
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  ok(res, room);
});

app.post("/", async (req, res) => {
  const previousRooms = structuredClone(rooms);
  const room = {
    id: String(req.body.id || nanoid(6)).trim(),
    floor: Number(req.body.floor || 1),
    type: req.body.type || "Habitacion Privada",
    capacity: Number(req.body.capacity || 1),
    rate: Number(req.body.rate || 0),
    status: allowedStatuses.includes(req.body.status) ? req.body.status : "available",
    lastCleaned: req.body.lastCleaned || new Date().toISOString().slice(0, 10),
    notes: req.body.notes || "",
    amenities: req.body.amenities || []
  };
  if (!room.id) return fail(res, "El numero de habitacion es obligatorio", 422);
  if (room.rate < 0 || room.capacity < 1) return fail(res, "Capacidad y tarifa no validas", 422);
  if (rooms.some((item) => item.id === room.id)) return fail(res, "La habitacion ya existe", 409);
  rooms.push(room);
  if (!(await commit(previousRooms, res))) return;
  ok(res, room, 201);
});

app.patch("/:id", async (req, res) => {
  const previousRooms = structuredClone(rooms);
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  const nextStatus = req.body.status === undefined ? room.status : req.body.status;
  if (!allowedStatuses.includes(nextStatus)) return fail(res, "Estado de habitacion no valido", 422);
  if (room.status === "occupied" && !(await ensureRoomCanLeaveOccupiedState(room, nextStatus, res))) return;
  for (const field of ["type", "status", "lastCleaned", "notes", "guestId", "housekeepingNotes"]) {
    if (req.body[field] !== undefined) room[field] = req.body[field];
  }
  for (const field of ["floor", "capacity", "rate"]) {
    if (req.body[field] !== undefined) room[field] = Number(req.body[field]);
  }
  if (room.rate < 0 || room.capacity < 1) return fail(res, "Capacidad y tarifa no validas", 422);
  if (!allowedStatuses.includes(room.status)) return fail(res, "Estado de habitacion no valido", 422);
  if (!(await commit(previousRooms, res))) return;
  ok(res, room);
});

app.patch("/:id/status", async (req, res) => {
  const previousRooms = structuredClone(rooms);
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  if (!allowedStatuses.includes(req.body.status)) return fail(res, "Estado de habitacion no valido", 422);
  if (room.status === "occupied" && !(await ensureRoomCanLeaveOccupiedState(room, req.body.status, res))) return;
  room.status = req.body.status;
  if (req.body.guestId !== undefined) room.guestId = req.body.guestId;
  if (room.status !== "occupied") delete room.guestId;
  room.lastCleaned = room.status === "available" ? new Date().toISOString().slice(0, 10) : room.lastCleaned;
  if (room.status === "available") room.housekeepingNotes = "";
  if (!(await commit(previousRooms, res))) return;
  ok(res, room);
});

app.post("/:id/cleaning", async (req, res) => {
  const previousRooms = structuredClone(rooms);
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  if (!(await ensureRoomCanLeaveOccupiedState(room, "cleaning", res))) return;
  room.status = "cleaning";
  delete room.guestId;
  room.housekeepingNotes = req.body.notes || "Limpieza pendiente";
  if (!(await commit(previousRooms, res))) return;
  ok(res, room);
});

app.delete("/:id", async (req, res) => {
  const previousRooms = structuredClone(rooms);
  const room = rooms.find((item) => item.id === req.params.id);
  if (!room) return fail(res, "Habitacion no encontrada", 404);
  if (["occupied", "cleaning"].includes(room.status)) return fail(res, "No se puede eliminar una habitacion ocupada o en limpieza", 409);
  rooms = rooms.filter((item) => item.id !== req.params.id);
  if (!(await commit(previousRooms, res))) return;
  ok(res, { deleted: true, id: req.params.id });
});

listen();
