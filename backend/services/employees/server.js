import { nanoid } from "nanoid";
import { employees as seedEmployees } from "../../shared/seed.js";
import { createService, ok, fail } from "../../shared/service.js";

const port = Number(process.env.EMPLOYEES_PORT || 7106);
const { app, listen } = createService({ name: "employees", port, description: "Empleados, turnos, asistencia y permisos" });
const employees = structuredClone(seedEmployees);

// --- Asistencia en memoria ---
const attendance = [
  { id: "a1", employeeId: "e1", employeeName: "Valentina Mora", date: "2026-07-18", checkIn: "06:02", checkOut: "14:05", shift: "Manana", status: "complete" },
  { id: "a2", employeeId: "e2", employeeName: "Laura Sanchez", date: "2026-07-18", checkIn: "14:01", checkOut: "22:03", shift: "Tarde", status: "complete" },
  { id: "a3", employeeId: "e3", employeeName: "Apolo Administrador", date: "2026-07-18", checkIn: "22:00", checkOut: "06:01", shift: "Noche", status: "complete" },
  { id: "a4", employeeId: "e1", employeeName: "Valentina Mora", date: "2026-07-19", checkIn: "06:03", checkOut: "14:02", shift: "Manana", status: "complete" },
  { id: "a5", employeeId: "e2", employeeName: "Laura Sanchez", date: "2026-07-19", checkIn: "14:07", checkOut: null, shift: "Tarde", status: "active" },
  { id: "a6", employeeId: "e3", employeeName: "Apolo Administrador", date: "2026-07-20", checkIn: "22:00", checkOut: null, shift: "Noche", status: "active" },
  { id: "a7", employeeId: "e1", employeeName: "Valentina Mora", date: "2026-07-20", checkIn: "06:01", checkOut: "14:08", shift: "Manana", status: "complete" },
  { id: "a8", employeeId: "e2", employeeName: "Laura Sanchez", date: "2026-07-17", checkIn: "14:00", checkOut: "22:01", shift: "Tarde", status: "complete" },
  { id: "a9", employeeId: "e3", employeeName: "Apolo Administrador", date: "2026-07-17", checkIn: "22:00", checkOut: "06:00", shift: "Noche", status: "complete" },
];

// --- Empleados ---
app.get("/", (req, res) => {
  const { q = "" } = req.query;
  const query = String(q).toLowerCase();
  ok(res, employees.filter((item) => [item.name, item.role, item.username].some((v) => String(v).toLowerCase().includes(query))));
});

app.get("/current-shift", (_req, res) => {
  ok(res, employees.find((item) => item.shift === "Tarde") || employees[0]);
});

app.post("/", (req, res) => {
  const employee = { id: nanoid(8), status: "active", modules: [], since: new Date().toISOString().slice(0, 10), ...req.body };
  employees.unshift(employee);
  ok(res, employee, 201);
});

// --- Asistencia ---
app.get("/attendance", (req, res) => {
  const { period = "week", date = new Date().toISOString().slice(0, 10), employeeId } = req.query;
  const ref = new Date(date + "T12:00:00Z");
  let from, to;

  if (period === "day") {
    from = date;
    to = date;
  } else if (period === "week") {
    const day = ref.getUTCDay(); // 0=Sun
    const monday = new Date(ref);
    monday.setUTCDate(ref.getUTCDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    from = monday.toISOString().slice(0, 10);
    to = sunday.toISOString().slice(0, 10);
  } else if (period === "month") {
    from = date.slice(0, 7) + "-01";
    const lastDay = new Date(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0);
    to = lastDay.toISOString().slice(0, 10);
  } else if (period === "year") {
    from = date.slice(0, 4) + "-01-01";
    to = date.slice(0, 4) + "-12-31";
  } else {
    from = "2000-01-01";
    to = "2099-12-31";
  }

  let result = attendance.filter((a) => a.date >= from && a.date <= to);
  if (employeeId) result = result.filter((a) => a.employeeId === employeeId);
  ok(res, result);
});

app.post("/attendance/clock-in", (req, res) => {
  const { employeeId, shift } = req.body;
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return fail(res, "Empleado no encontrado", 404);
  const today = new Date().toISOString().slice(0, 10);
  const existing = attendance.find((a) => a.employeeId === employeeId && a.date === today && !a.checkOut);
  if (existing) return fail(res, "Ya tiene una entrada activa hoy", 409);
  const now = new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
  const record = { id: nanoid(8), employeeId, employeeName: employee.name, date: today, checkIn: now, checkOut: null, shift: shift || employee.shift, status: "active" };
  attendance.unshift(record);
  ok(res, record, 201);
});

app.patch("/attendance/:id/clock-out", (req, res) => {
  const record = attendance.find((a) => a.id === req.params.id);
  if (!record) return fail(res, "Registro no encontrado", 404);
  const now = new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
  record.checkOut = now;
  record.status = "complete";
  ok(res, record);
});

listen();
