import { nanoid } from "nanoid";
import { guests, incidents as seedIncidents } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok } from "../../shared/service.js";

const port = Number(process.env.OPERATIONS_PORT || 7104);
const { app, listen } = createService({ name: "operations", port, description: "Bitacora, checklist, agenda y alertas" });
let incidents = structuredClone(seedIncidents);
incidents = await loadState("incidents", seedIncidents);
incidents = incidents.map((incident) => incident.id === "n2" && /desayuno/i.test(incident.title || "")
  ? structuredClone(seedIncidents.find((item) => item.id === "n2"))
  : incident);
await saveState("incidents", incidents).catch((error) => console.warn(`Initial incident persistence deferred: ${error.message}`));

let checklist = [
  "Contar efectivo en caja",
  "Revisar bitacora del turno anterior",
  "Verificar llegadas y salidas del dia",
  "Confirmar habitaciones limpias y disponibles",
  "Revisar llaves y tarjetas de acceso",
  "Comprobar suministros de recepcion"
].map((title, index) => ({ id: `c${index + 1}`, title, done: false }));
checklist = await loadState("checklist", checklist);

function persistIncidents() {
  return saveState("incidents", incidents);
}

function persistChecklist() {
  return saveState("checklist", checklist);
}

await persistChecklist().catch((error) => console.warn(`Initial checklist persistence deferred: ${error.message}`));

app.get("/agenda", (_req, res) => {
  ok(res, {
    departures: guests.filter((guest) => guest.status === "active" && guest.checkOut <= "2026-05-30"),
    arrivals: [],
    pendingCharges: guests.filter((guest) => guest.total > guest.paid)
  });
});

app.get("/incidents", (req, res) => {
  const { status = "all", category = "all" } = req.query;
  const data = incidents.filter((item) => {
    const statusMatch = status === "all" || item.status === status;
    const categoryMatch = category === "all" || item.category === category;
    return statusMatch && categoryMatch;
  });
  ok(res, data);
});

app.post("/incidents", async (req, res) => {
  if (!req.body.title || !req.body.description) return fail(res, "Titulo y detalle son obligatorios", 422);
  const incident = {
    id: nanoid(8),
    status: "open",
    priority: "media",
    createdAt: new Date().toISOString(),
    createdBy: "Recepcion",
    category: "general",
    roomId: "",
    actionRequired: "",
    ...req.body
  };
  incidents.unshift(incident);
  await persistIncidents();
  ok(res, incident, 201);
});

app.patch("/incidents/:id/resolve", async (req, res) => {
  const incident = incidents.find((item) => item.id === req.params.id);
  if (!incident) return fail(res, "Novedad no encontrada", 404);
  incident.status = "resolved";
  incident.resolution = req.body.resolution || "Completado";
  incident.resolvedBy = req.body.resolvedBy || "Recepcion";
  incident.resolvedAt = new Date().toISOString();
  await persistIncidents();
  ok(res, incident);
});

app.get("/checklist", (_req, res) => ok(res, checklist));

app.patch("/checklist/:id", async (req, res) => {
  const item = checklist.find((entry) => entry.id === req.params.id);
  if (item) item.done = Boolean(req.body.done);
  await persistChecklist();
  ok(res, item);
});

listen();
