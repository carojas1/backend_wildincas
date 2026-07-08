import { nanoid } from "nanoid";
import { movements as seedMovements, shifts as seedShifts } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, parseMoney } from "../../shared/service.js";

const port = Number(process.env.FINANCE_PORT || 7105);
const { app, listen } = createService({ name: "finance", port, description: "Caja por turnos, ingresos y reportes contables" });
let movements = structuredClone(seedMovements);
let shifts = structuredClone(seedShifts);
let openShift = null;
const financeState = await loadState("finance", { movements: seedMovements, shifts: seedShifts, openShift: null });
movements = financeState.movements || seedMovements;
shifts = financeState.shifts || seedShifts;
openShift = financeState.openShift || null;

function persist() {
  saveState("finance", { movements, shifts, openShift });
}

app.get("/movements", (_req, res) => ok(res, movements));

function movementTotal(items, type, method = null) {
  return items
    .filter((item) => item.type === type && (!method || item.method === method))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function dailySnapshot(date = new Date().toISOString().slice(0, 10)) {
  const items = movements.filter((item) => item.date === date);
  const methods = ["Efectivo", "Transferencia", "Tarjeta", "Deposito"].map((method) => ({
    method,
    income: movementTotal(items, "income", method),
    expense: movementTotal(items, "expense", method),
    balance: movementTotal(items, "income", method) - movementTotal(items, "expense", method)
  }));
  const income = movementTotal(items, "income");
  const expense = movementTotal(items, "expense");
  return { date, income, expense, balance: income - expense, methods, movements: items };
}

app.get("/daily", (req, res) => ok(res, dailySnapshot(req.query.date || new Date().toISOString().slice(0, 10))));

app.get(["/export.xls", "/export.xlsx"], (_req, res) => {
  const income = movements.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = movements.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const rows = (items, columns) => items.map((item) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(item[key] ?? "")}</td>`).join("")}</tr>`).join("");
  const header = (columns) => `<tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  const today = dailySnapshot();
  const movementCols = [["date", "Fecha"], ["shiftId", "Turno"], ["type", "Tipo"], ["category", "Categoria"], ["concept", "Concepto"], ["method", "Metodo"], ["reference", "Referencia"], ["amount", "Monto"], ["notes", "Observaciones"]];
  const methodCols = [["method", "Metodo"], ["income", "Ingresos"], ["expense", "Gastos"], ["balance", "Balance"]];
  const shiftCols = [["date", "Fecha"], ["shift", "Turno"], ["responsible", "Responsable"], ["initial", "Inicial"], ["closed", "Cierre"], ["expected", "Esperado"], ["difference", "Diferencia"], ["status", "Estado"], ["notes", "Observaciones"]];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse;margin-bottom:24px}th{background:#4d392f;color:white}td,th{border:1px solid #d9d2c8;padding:8px}h1,h2{color:#4d392f}</style></head><body>
    <h1>Wild Incas - Reporte contable</h1>
    <table><tr><th>Generado</th><td>${new Date().toLocaleString("es-EC")}</td></tr><tr><th>Ingresos</th><td>${income.toFixed(2)}</td></tr><tr><th>Gastos</th><td>${expense.toFixed(2)}</td></tr><tr><th>Balance</th><td>${(income - expense).toFixed(2)}</td></tr></table>
    <h2>Resumen del dia</h2><table>${header(methodCols)}${rows(today.methods, methodCols)}</table>
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
    createdAt: new Date().toISOString(),
    shiftId: openShift?.id || null,
    method: "Efectivo",
    category: req.body.type === "expense" ? "Operativo" : "Hospedaje",
    reference: "",
    notes: "",
    ...req.body,
    amount: parseMoney(req.body.amount)
  };
  if (!movement.concept) return fail(res, "El concepto es obligatorio", 422);
  if (!movement.amount || movement.amount < 0) return fail(res, "El monto debe ser mayor a cero", 422);
  movements.unshift(movement);
  persist();
  ok(res, movement, 201);
});

app.get("/summary", (_req, res) => {
  const income = movementTotal(movements, "income");
  const expense = movementTotal(movements, "expense");
  ok(res, { income, expense, balance: income - expense, openShift, today: dailySnapshot() });
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
    notes: req.body.notes || "",
    status: "open",
    openedAt: new Date().toISOString()
  };
  persist();
  ok(res, openShift, 201);
});

app.post("/shifts/close", (req, res) => {
  if (!openShift) return fail(res, "No existe caja abierta", 404);
  const expected = openShift.initial + movements
    .filter((item) => item.method === "Efectivo" && item.shiftId === openShift.id)
    .reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
  const closed = parseMoney(req.body.closed);
  const shift = { ...openShift, closed, expected, difference: parseMoney(closed - expected), notes: req.body.notes || openShift.notes || "", status: "closed", closedAt: new Date().toISOString() };
  shifts.unshift(shift);
  openShift = null;
  persist();
  ok(res, shift);
});

listen();
