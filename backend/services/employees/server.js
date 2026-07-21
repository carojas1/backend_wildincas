import { nanoid } from "nanoid";
import { employees as seedEmployees } from "../../shared/seed.js";
import { createService, ok, fail, serviceRequest } from "../../shared/service.js";

const port = Number(process.env.EMPLOYEES_PORT || 7106);
const { app, listen } = createService({ name: "employees", port, description: "Empleados, turnos, asistencia y permisos" });
const employees = structuredClone(seedEmployees);

// --- Asistencia en memoria ---
const attendance = [
  { id: "a1", employeeId: "e1", employeeName: "Valentina Mora", username: "valentina", date: "2026-07-18", startedAt: "2026-07-18T06:02:00.000Z", endedAt: "2026-07-18T14:05:00.000Z", durationMinutes: 483, shift: "Manana", status: "complete" },
  { id: "a2", employeeId: "e2", employeeName: "Laura Sanchez", username: "laura", date: "2026-07-18", startedAt: "2026-07-18T14:01:00.000Z", endedAt: "2026-07-18T22:03:00.000Z", durationMinutes: 482, shift: "Tarde", status: "complete" },
  { id: "a3", employeeId: "e3", employeeName: "Apolo Administrador", username: "apolo", date: "2026-07-18", startedAt: "2026-07-18T22:00:00.000Z", endedAt: "2026-07-19T06:01:00.000Z", durationMinutes: 481, shift: "Noche", status: "complete" },
  { id: "a4", employeeId: "e1", employeeName: "Valentina Mora", username: "valentina", date: "2026-07-19", startedAt: "2026-07-19T06:03:00.000Z", endedAt: "2026-07-19T14:02:00.000Z", durationMinutes: 479, shift: "Manana", status: "complete" },
  { id: "a5", employeeId: "e2", employeeName: "Laura Sanchez", username: "laura", date: "2026-07-20", startedAt: "2026-07-20T14:07:00.000Z", endedAt: null, durationMinutes: null, shift: "Tarde", status: "active" },
  { id: "a6", employeeId: "e1", employeeName: "Valentina Mora", username: "valentina", date: "2026-07-20", startedAt: "2026-07-20T06:01:00.000Z", endedAt: "2026-07-20T14:08:00.000Z", durationMinutes: 487, shift: "Manana", status: "complete" },
  { id: "a7", employeeId: "e2", employeeName: "Laura Sanchez", username: "laura", date: "2026-07-17", startedAt: "2026-07-17T14:00:00.000Z", endedAt: "2026-07-17T22:01:00.000Z", durationMinutes: 481, shift: "Tarde", status: "complete" },
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

app.post("/onboard", async (req, res) => {
  const { name, email, phone, shift, hours, username, password, role, modules, roleId } = req.body;
  try {
    const userResult = await serviceRequest("auth", "/users", {
      method: "POST",
      body: { name, email, username, password, role, roleId, modules, status: "active" }
    });
    
    const employee = { id: nanoid(8), name, email, phone, shift, hours, username, roleId, status: "active", modules, since: new Date().toISOString().slice(0, 10) };
    employees.unshift(employee);
    
    const notification = await serviceRequest("notifications", "/email", {
      method: "POST",
      body: {
        to: email,
        subject: "Bienvenido a SIMOT - Accesos",
        text: `Hola ${name}, tu usuario es: ${username} y tu contrasena temporal: ${password}`
      }
    }).catch(() => ({ status: "pending" }));
    
    ok(res, { employee, notification });
  } catch (error) {
    fail(res, error.message, 500);
  }
});

app.post("/link-user", (req, res) => {
  const { id: userId, name, email, username, shift, hours, roleId, modules } = req.body;
  const employee = { id: nanoid(8), name, email, phone: "", shift, hours, username, roleId, status: "active", modules, since: new Date().toISOString().slice(0, 10) };
  employees.unshift(employee);
  ok(res, employee);
});

app.patch("/:id", async (req, res) => {
  const employee = employees.find(e => e.id === req.params.id);
  if (!employee) return fail(res, "Empleado no encontrado", 404);
  
  Object.assign(employee, req.body);
  
  try {
    const usersResponse = await serviceRequest("auth", "/users").catch(() => null);
    if (usersResponse && Array.isArray(usersResponse)) {
      const authUser = usersResponse.find(u => u.username === employee.username);
      if (authUser) {
         await serviceRequest("auth", `/users/${authUser.id}`, {
           method: "PATCH",
           body: { status: employee.status, modules: employee.modules, roleId: employee.roleId }
         });
      }
    }
  } catch(e) {}
  
  ok(res, employee);
});

app.delete("/:id", (req, res) => {
  const index = employees.findIndex(e => e.id === req.params.id);
  if (index === -1) return fail(res, "Empleado no encontrado", 404);
  employees.splice(index, 1);
  ok(res, { deleted: true });
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

app.post("/attendance/me", (req, res) => {
  const username = req.headers["x-user-username"] || "";
  const employee = employees.find((e) => e.username === username);
  if (!employee) return ok(res, { employee: null, active: null });
  const today = new Date().toISOString().slice(0, 10);
  const { action } = req.body || {};
  if (action === "clock_in") {
    const existing = attendance.find((a) => a.employeeId === employee.id && a.date === today && !a.checkOut);
    if (existing) return fail(res, "Ya tienes una jornada activa hoy", 409);
    const now = new Date().toISOString();
    const record = { id: nanoid(8), employeeId: employee.id, employeeName: employee.name, username, startedAt: now, endedAt: null, durationMinutes: null, date: today };
    attendance.unshift(record);
    const active = attendance.find((a) => a.employeeId === employee.id && !a.endedAt);
    return ok(res, { employee, active });
  }
  if (action === "clock_out") {
    const active = attendance.find((a) => a.employeeId === employee.id && !a.endedAt);
    if (!active) return fail(res, "No tienes jornada activa", 404);
    active.endedAt = new Date().toISOString();
    active.durationMinutes = Math.round((new Date(active.endedAt) - new Date(active.startedAt)) / 60000);
    return ok(res, { employee, active: null });
  }
  return fail(res, "Accion invalida. Usa clock_in o clock_out", 400);
});

app.get("/attendance/me", (req, res) => {
  const username = req.headers["x-user-username"] || "";
  const employee = employees.find((e) => e.username === username);
  if (!employee) return ok(res, { employee: null, active: null });
  const active = attendance.find((a) => a.employeeId === employee.id && !a.endedAt) || null;
  ok(res, { employee, active });
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
