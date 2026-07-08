import { nanoid } from "nanoid";
import { movements as seedMovements, shifts as seedShifts } from "../../shared/seed.js";
import { createService, fail, ok, parseMoney } from "../../shared/service.js";

const port = Number(process.env.FINANCE_PORT || 7105);
const { app, listen } = createService({ name: "finance", port, description: "Caja por turnos, ingresos y reportes contables" });
const movements = structuredClone(seedMovements);
const shifts = structuredClone(seedShifts);
let openShift = null;

app.get("/movements", (_req, res) => ok(res, movements));

app.get(["/export.xls", "/export.xlsx"], (_req, res) => {
  const income = movements.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = movements.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const rows = (items, columns) => items.map((item) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(item[key] ?? "")}</td>`).join("")}</tr>`).join("");
  const header = (columns) => `<tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  const movementCols = [["date", "Fecha"], ["type", "Tipo"], ["concept", "Concepto"], ["method", "Metodo"], ["amount", "Monto"]];
  const shiftCols = [["date", "Fecha"], ["shift", "Turno"], ["responsible", "Responsable"], ["initial", "Inicial"], ["closed", "Cierre"], ["expected", "Esperado"], ["difference", "Diferencia"], ["status", "Estado"]];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse;margin-bottom:24px}th{background:#4d392f;color:white}td,th{border:1px solid #d9d2c8;padding:8px}h1,h2{color:#4d392f}</style></head><body>
    <h1>SIMOT v2.0 - Reporte contable</h1>
    <table><tr><th>Generado</th><td>${new Date().toLocaleString("es-EC")}</td></tr><tr><th>Ingresos</th><td>${income.toFixed(2)}</td></tr><tr><th>Gastos</th><td>${expense.toFixed(2)}</td></tr><tr><th>Balance</th><td>${(income - expense).toFixed(2)}</td></tr></table>
    <h2>Movimientos</h2><table>${header(movementCols)}${rows(movements, movementCols)}</table>
    <h2>Turnos</h2><table>${header(shiftCols)}${rows(shifts, shiftCols)}</table>
  </body></html>`;
  const filename = `simot-reporte-${new Date().toISOString().slice(0, 10)}.xls`;
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(html);
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

app.post("/movements", (req, res) => {
  const movement = {
    id: nanoid(8),
    date: new Date().toISOString().slice(0, 10),
    method: "Efectivo",
    ...req.body,
    amount: parseMoney(req.body.amount)
  };
  movements.unshift(movement);
  ok(res, movement, 201);
});

app.get("/summary", (_req, res) => {
  const income = movements.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = movements.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  ok(res, { income, expense, balance: income - expense, openShift });
});

app.get("/shifts", (_req, res) => ok(res, { openShift, history: shifts }));

app.post("/shifts/open", (req, res) => {
  if (openShift) return fail(res, "Ya existe una caja abierta", 409);
  openShift = {
    id: nanoid(8),
    date: new Date().toISOString().slice(0, 10),
    shift: req.body.shift,
    responsible: req.body.responsible,
    initial: parseMoney(req.body.initial),
    status: "open",
    openedAt: new Date().toISOString()
  };
  ok(res, openShift, 201);
});

app.post("/shifts/close", (req, res) => {
  if (!openShift) return fail(res, "No existe caja abierta", 404);
  const expected = openShift.initial + movements.filter((item) => item.method === "Efectivo").reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
  const closed = parseMoney(req.body.closed);
  const shift = { ...openShift, closed, expected, difference: parseMoney(closed - expected), status: "closed", closedAt: new Date().toISOString() };
  shifts.unshift(shift);
  openShift = null;
  ok(res, shift);
});

listen();
