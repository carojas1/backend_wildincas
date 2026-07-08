import { nanoid } from "nanoid";
import { employees as seedEmployees } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, ok } from "../../shared/service.js";

const port = Number(process.env.EMPLOYEES_PORT || 7106);
const { app, listen } = createService({ name: "employees", port, description: "Empleados, turnos y permisos" });
let employees = structuredClone(seedEmployees);
employees = await loadState("employees", seedEmployees);

function persist() {
  saveState("employees", employees);
}

app.get("/", (req, res) => {
  const { q = "" } = req.query;
  const query = String(q).toLowerCase();
  ok(res, employees.filter((item) => [item.name, item.role, item.username].some((value) => String(value).toLowerCase().includes(query))));
});

app.get("/current-shift", (_req, res) => {
  ok(res, employees.find((item) => item.shift === "Tarde") || employees[0]);
});

app.post("/", (req, res) => {
  const employee = { id: nanoid(8), status: "active", modules: [], since: new Date().toISOString().slice(0, 10), ...req.body };
  employees.unshift(employee);
  persist();
  ok(res, employee, 201);
});

listen();
