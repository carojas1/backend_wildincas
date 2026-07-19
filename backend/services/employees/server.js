import { nanoid } from "nanoid";
import { employees as seedEmployees } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, serviceRequest } from "../../shared/service.js";

const port = Number(process.env.EMPLOYEES_PORT || 7106);
const { app, listen } = createService({ name: "employees", port, description: "Empleados, turnos y permisos" });
let employees = structuredClone(seedEmployees);
employees = await loadState("employees", seedEmployees);

function persist() {
  return saveState("employees", employees);
}

app.get("/", (req, res) => {
  const { q = "" } = req.query;
  const query = String(q).toLowerCase();
  ok(res, employees.filter((item) => [item.name, item.role, item.username].some((value) => String(value).toLowerCase().includes(query))));
});

app.get("/current-shift", (_req, res) => {
  ok(res, employees.find((item) => item.shift === "Tarde") || employees[0]);
});

app.post("/", async (req, res) => {
  if (!req.body.name || !req.body.email || !req.body.username) return fail(res, "Nombre, correo y usuario son obligatorios", 422);
  if (employees.some((item) => item.username === req.body.username || String(item.email).toLowerCase() === String(req.body.email).toLowerCase())) {
    return fail(res, "El empleado o su cuenta ya existen", 409);
  }
  const employee = { id: nanoid(8), status: "active", modules: [], since: new Date().toISOString().slice(0, 10), ...req.body };
  employees.unshift(employee);
  await persist();
  ok(res, employee, 201);
});

app.post("/onboard", async (req, res) => {
  const { name, email, username, password, roleId = "recepcion" } = req.body;
  if (!name || !email || !username || !password) return fail(res, "Nombre, correo, usuario y contrasena temporal son obligatorios", 422);
  if (employees.some((item) => item.username === username || String(item.email).toLowerCase() === String(email).toLowerCase())) {
    return fail(res, "El empleado o su cuenta ya existen", 409);
  }
  let user;
  try {
    user = await serviceRequest("auth", "/users", {
      method: "POST",
      body: { name, email, username, password, roleId, modules: req.body.modules }
    });
  } catch (error) {
    return fail(res, `No se pudo crear el acceso del empleado: ${error.message}`, 409);
  }
  const employee = {
    id: nanoid(8),
    status: "active",
    modules: Array.isArray(req.body.modules) ? req.body.modules : user.modules,
    since: new Date().toISOString().slice(0, 10),
    ...req.body,
    roleId: user.roleId,
    role: req.body.role || user.role
  };
  delete employee.password;
  employees.unshift(employee);
  await persist();
  let notification = null;
  try {
    notification = await serviceRequest("notifications", "/employees/welcome", {
      method: "POST",
      body: { to: email, name, username, password, role: employee.role, idempotencyKey: `employee-welcome:${username}` }
    });
  } catch (error) {
    notification = { status: "queue_unavailable", error: error.message };
  }
  ok(res, { employee, user, notification }, 201);
});

app.patch("/:id", async (req, res) => {
  const employee = employees.find((item) => item.id === req.params.id);
  if (!employee) return fail(res, "Empleado no encontrado", 404);
  for (const field of ["name", "role", "roleId", "shift", "hours", "phone", "email", "username", "status", "note"]) {
    if (req.body[field] !== undefined) employee[field] = req.body[field];
  }
  if (req.body.modules !== undefined) employee.modules = Array.isArray(req.body.modules) ? req.body.modules : [];
  await persist();
  let access = null;
  try {
    const users = await serviceRequest("auth", "/users");
    const user = users.find((item) => item.username === employee.username);
    if (user) {
      access = await serviceRequest("auth", `/users/${user.id}`, {
        method: "PATCH",
        body: { name: employee.name, email: employee.email, status: employee.status, roleId: req.body.roleId, modules: employee.modules }
      });
    }
  } catch (error) {
    return fail(res, `Empleado actualizado, pero no se pudo sincronizar el acceso: ${error.message}`, 503);
  }
  ok(res, { employee, access });
});

listen();
