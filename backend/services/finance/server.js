import ExcelJS from "exceljs";
import { nanoid } from "nanoid";
import { movements as seedMovements, shifts as seedShifts } from "../../shared/seed.js";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, parseMoney, serviceRequest } from "../../shared/service.js";

const port = Number(process.env.FINANCE_PORT || 7105);
const { app, listen } = createService({
  name: "finance",
  port,
  description: "Notas de venta, pagos, caja, ingresos, gastos y reportes contables"
});

const loaded = await loadState("finance", {
  movements: seedMovements,
  shifts: seedShifts,
  openShift: null,
  invoices: [],
  payments: []
});
let state = normalizeState(loaded);

function normalizeState(value) {
  return {
    movements: Array.isArray(value?.movements) ? value.movements : seedMovements,
    shifts: Array.isArray(value?.shifts) ? value.shifts : seedShifts,
    openShift: value?.openShift || null,
    invoices: Array.isArray(value?.invoices) ? value.invoices : [],
    payments: Array.isArray(value?.payments) ? value.payments : []
  };
}

function persist() {
  return saveState("finance", state);
}

function reconcileVoidedPaymentMovements() {
  let updated = 0;
  for (const payment of state.payments.filter((item) => item.status === "voided")) {
    const movement = state.movements.find((item) => {
      if (item.status === "voided") return false;
      if (item.paymentId === payment.id) return true;
      return item.source === "payment"
        && item.createdAt === payment.createdAt
        && Number(item.amount || 0) === Number(payment.amount || 0)
        && (item.reservationId === payment.reservationId || item.invoiceId === payment.invoiceId);
    });
    if (!movement) continue;
    movement.paymentId = payment.id;
    movement.status = "voided";
    movement.voidedAt = payment.voidedAt || now();
    movement.voidReason = payment.voidReason || "Pago anulado";
    updated += 1;
  }
  return updated;
}

function reconcileDuplicateLegacyMovements() {
  const seen = new Set();
  let updated = 0;
  for (const movement of state.movements) {
    const concept = String(movement.concept || "");
    const isLegacyHotelIncome = concept.startsWith("Check-in Hab.") || concept.startsWith("Pago Hab.");
    if (movement.status === "voided" || movement.paymentId || movement.source === "manual" || !isLegacyHotelIncome) continue;
    const signature = [movement.date, movement.type, movement.concept, movement.method, Number(movement.amount || 0)].join("|");
    if (!seen.has(signature)) {
      seen.add(signature);
      continue;
    }
    movement.status = "voided";
    movement.voidedAt = now();
    movement.voidReason = "Movimiento duplicado de flujo anterior";
    updated += 1;
  }
  return updated;
}

function now() {
  return new Date().toISOString();
}

function today() {
  return now().slice(0, 10);
}

function movementTotal(items, type, method = null) {
  return parseMoney(items
    .filter((item) => item.status !== "voided" && item.type === type && (!method || item.method === method))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
}

function dailySnapshot(date = today()) {
  const items = state.movements.filter((item) => item.date === date && item.status !== "voided");
  const methods = ["Efectivo", "Transferencia", "Tarjeta", "Deposito"].map((method) => ({
    method,
    income: movementTotal(items, "income", method),
    expense: movementTotal(items, "expense", method),
    balance: parseMoney(movementTotal(items, "income", method) - movementTotal(items, "expense", method))
  }));
  const income = movementTotal(items, "income");
  const expense = movementTotal(items, "expense");
  return { date, income, expense, balance: parseMoney(income - expense), methods, movements: items };
}

function periodFromQuery(query = {}) {
  const current = today();
  const monthStart = `${current.slice(0, 7)}-01`;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(query.from || "")) ? String(query.from) : monthStart;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to || "")) ? String(query.to) : current;
  return { from, to };
}

function dateOf(item, ...fields) {
  for (const field of fields) {
    const value = field.split(".").reduce((current, part) => current?.[part], item);
    if (value) return String(value).slice(0, 10);
  }
  return "";
}

function inPeriod(value, from, to) {
  const date = String(value || "").slice(0, 10);
  return Boolean(date && date >= from && date <= to);
}

function stayInPeriod(item, from, to) {
  return String(item.checkIn || "") <= to && String(item.checkOut || item.checkIn || "") >= from;
}

function periodDays(from, to) {
  return Math.max(1, Math.floor((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000) + 1);
}

function analyticsSnapshot(from, to, reservations = [], rooms = []) {
  const movements = state.movements.filter((item) => item.status !== "voided" && inPeriod(item.date, from, to));
  const payments = state.payments.filter((item) => item.status !== "voided" && inPeriod(item.createdAt, from, to));
  const invoices = state.invoices.map(refreshInvoice).filter((item) => inPeriod(item.issuedAt, from, to));
  const stays = reservations.filter((item) => stayInPeriod(item, from, to));
  const income = movementTotal(movements, "income");
  const expense = movementTotal(movements, "expense");
  const collected = parseMoney(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const roomNights = stays.reduce((sum, item) => sum + Number(item.nights || 0), 0);
  const lodging = stays.reduce((sum, item) => sum + Number(item.lodgingSubtotal || 0), 0);
  const days = periodDays(from, to);
  const monthly = days > 62;
  const groups = new Map();
  for (const movement of movements) {
    const key = monthly ? String(movement.date).slice(0, 7) : movement.date;
    const current = groups.get(key) || { label: key, income: 0, expense: 0 };
    current[movement.type] = parseMoney(current[movement.type] + Number(movement.amount || 0));
    groups.set(key, current);
  }
  const methodMap = new Map();
  for (const payment of payments) methodMap.set(payment.method || "Sin metodo", parseMoney((methodMap.get(payment.method || "Sin metodo") || 0) + Number(payment.amount || 0)));
  const categoryMap = new Map();
  for (const movement of movements) {
    const key = movement.category || "Sin categoria";
    const current = categoryMap.get(key) || { category: key, income: 0, expense: 0 };
    current[movement.type] = parseMoney(current[movement.type] + Number(movement.amount || 0));
    categoryMap.set(key, current);
  }
  return {
    period: { from, to, days },
    summary: {
      income,
      expense,
      profit: parseMoney(income - expense),
      collected,
      accountsReceivable: parseMoney(invoices.reduce((sum, item) => sum + Number(item.balance || 0), 0)),
      invoices: invoices.length,
      reservations: stays.length,
      guests: new Set(stays.map((item) => item.guestId).filter(Boolean)).size,
      roomNights,
      averageDailyRate: roomNights ? parseMoney(lodging / roomNights) : 0,
      averageTicket: invoices.length ? parseMoney(invoices.reduce((sum, item) => sum + Number(item.total || 0), 0) / invoices.length) : 0,
      occupancy: rooms.length ? parseMoney((roomNights / (rooms.length * days)) * 100) : 0
    },
    series: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)),
    methods: [...methodMap.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    categories: [...categoryMap.values()].sort((a, b) => (b.income + b.expense) - (a.income + a.expense)),
    movements,
    payments,
    invoices,
    stays
  };
}

function invoicePayments(invoice) {
  return state.payments.filter((payment) => payment.status !== "voided" && (payment.invoiceId === invoice.id || payment.reservationId === invoice.reservationId));
}

function refreshInvoice(invoice) {
  const paid = parseMoney(invoicePayments(invoice).reduce((sum, payment) => sum + payment.amount, 0));
  invoice.paid = paid;
  invoice.balance = parseMoney(Math.max(0, invoice.total - paid));
  invoice.paymentStatus = invoice.balance <= 0 ? "paid" : paid > 0 ? "partial" : "pending";
  invoice.updatedAt = now();
  return invoice;
}

function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = state.invoices.filter((item) => String(item.number || "").startsWith(`NV-${year}-`)).length + 1;
  return `NV-${year}-${String(count).padStart(5, "0")}`;
}

function openShiftView() {
  if (!state.openShift) return null;
  const movements = state.movements.filter((item) => item.shiftId === state.openShift.id && item.status !== "voided");
  const cashNet = movements
    .filter((item) => item.method === "Efectivo")
    .reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
  return {
    ...state.openShift,
    expected: parseMoney(state.openShift.initial + cashNet),
    movementCount: movements.length,
    cashIncome: movementTotal(movements, "income", "Efectivo"),
    cashExpense: movementTotal(movements, "expense", "Efectivo")
  };
}

const reconciledMovements = reconcileVoidedPaymentMovements() + reconcileDuplicateLegacyMovements();
if (reconciledMovements > 0) {
  console.info(`[finance] reconciled ${reconciledMovements} voided payment movement(s)`);
}
// NOTE: Do NOT persist on startup — if Supabase load timed out, persisting now would wipe real payment/finance data.

app.get("/movements", (req, res) => {
  const { type = "all", date = "" } = req.query;
  ok(res, state.movements.filter((item) => (type === "all" || item.type === type) && (!date || item.date === date)));
});

app.post("/movements", async (req, res) => {
  const movement = {
    id: nanoid(9),
    date: req.body.date || today(),
    createdAt: now(),
    shiftId: state.openShift?.id || null,
    method: req.body.method || "Efectivo",
    category: req.body.category || (req.body.type === "expense" ? "Operativo" : "Otros ingresos"),
    reference: req.body.reference || "",
    notes: req.body.notes || "",
    type: req.body.type,
    concept: String(req.body.concept || "").trim(),
    amount: parseMoney(req.body.amount),
    source: req.body.source || "manual"
  };
  if (!movement.concept) return fail(res, "El concepto es obligatorio", 422);
  if (!['income', 'expense'].includes(movement.type)) return fail(res, "Tipo de movimiento no valido", 422);
  if (movement.amount <= 0) return fail(res, "El monto debe ser mayor a cero", 422);
  state.movements.unshift(movement);
  await persist();
  ok(res, movement, 201);
});

app.get("/payments", (req, res) => {
  const data = state.payments.filter((item) => !req.query.reservationId || item.reservationId === req.query.reservationId);
  ok(res, data);
});

app.post("/payments", async (req, res) => {
  const idempotencyKey = String(req.body.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const existing = state.payments.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) return ok(res, existing);
  }
  const amount = parseMoney(req.body.amount);
  const received = parseMoney(req.body.received === undefined ? amount : req.body.received);
  const method = req.body.method || "Efectivo";
  if (amount <= 0) return fail(res, "El pago debe ser mayor a cero", 422);
  if (method === "Efectivo" && received < amount) return fail(res, "El efectivo recibido no cubre el pago", 422);
  if (!req.body.reservationId && !req.body.invoiceId) return fail(res, "El pago debe pertenecer a una reserva o nota de venta", 422);
  const invoice = req.body.invoiceId
    ? state.invoices.find((item) => item.id === req.body.invoiceId)
    : state.invoices.find((item) => item.reservationId === req.body.reservationId);
  if (invoice) {
    refreshInvoice(invoice);
    if (invoice.balance <= 0) return fail(res, "La nota de venta ya esta pagada", 409);
    if (amount > invoice.balance) return fail(res, `El pago supera el saldo pendiente de ${invoice.balance.toFixed(2)}`, 422);
  }
  const payment = {
    id: nanoid(10),
    idempotencyKey: idempotencyKey || `payment:${nanoid(12)}`,
    reservationId: req.body.reservationId || invoice?.reservationId || null,
    reservationCode: req.body.reservationCode || invoice?.reservationCode || "",
    invoiceId: invoice?.id || null,
    invoiceNumber: invoice?.number || "",
    guestId: req.body.guestId || invoice?.guest?.id || null,
    guestName: req.body.guestName || invoice?.guest?.name || "Consumidor final",
    roomId: req.body.roomId || invoice?.roomId || "",
    amount,
    received,
    change: method === "Efectivo" ? parseMoney(received - amount) : 0,
    method,
    reference: req.body.reference || "",
    notes: req.body.notes || "",
    status: "confirmed",
    createdAt: now()
  };
  state.payments.unshift(payment);
  state.movements.unshift({
    id: nanoid(9),
    type: "income",
    category: "Hospedaje",
    concept: `Pago ${payment.reservationCode || payment.invoiceNumber} - ${payment.guestName}`,
    method,
    reference: payment.reference || payment.invoiceNumber,
    amount,
    date: today(),
    createdAt: payment.createdAt,
    shiftId: state.openShift?.id || null,
    reservationId: payment.reservationId,
    invoiceId: payment.invoiceId,
    paymentId: payment.id,
    source: "payment",
    notes: payment.notes
  });
  if (invoice) refreshInvoice(invoice);
  await persist();
  ok(res, payment, 201);
});

app.post("/payments/:id/void", async (req, res) => {
  const payment = state.payments.find((item) => item.id === req.params.id);
  if (!payment) return fail(res, "Pago no encontrado", 404);
  if (payment.status === "voided") return ok(res, payment);
  const reason = String(req.body.reason || "Correccion autorizada").trim();
  payment.status = "voided";
  payment.voidedAt = now();
  payment.voidedBy = req.body.actor || "Administrador";
  payment.voidReason = reason;
  const movement = state.movements.find((item) => item.paymentId === payment.id);
  if (movement) {
    movement.status = "voided";
    movement.voidedAt = payment.voidedAt;
    movement.voidReason = reason;
  }
  const invoice = state.invoices.find((item) => item.id === payment.invoiceId || item.reservationId === payment.reservationId);
  if (invoice) refreshInvoice(invoice);
  await persist();
  ok(res, { payment, invoice: invoice || null });
});

app.get("/invoices", (req, res) => {
  const data = state.invoices
    .map(refreshInvoice)
    .filter((item) => !req.query.status || req.query.status === "all" || item.paymentStatus === req.query.status)
    .sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)));
  ok(res, data);
});

app.get("/invoices/:id", (req, res) => {
  const invoice = state.invoices.find((item) => item.id === req.params.id);
  if (!invoice) return fail(res, "Nota de venta no encontrada", 404);
  ok(res, { ...refreshInvoice(invoice), payments: invoicePayments(invoice) });
});

app.post("/invoices/finalize", async (req, res) => {
  const idempotencyKey = String(req.body.idempotencyKey || `invoice-final:${req.body.reservationId}`);
  const existing = state.invoices.find((item) => item.idempotencyKey === idempotencyKey || item.reservationId === req.body.reservationId);
  if (existing) return ok(res, refreshInvoice(existing));
  const lines = (Array.isArray(req.body.lines) ? req.body.lines : []).map((line) => {
    const quantity = Math.max(1, Number(line.quantity || 1));
    const unitPrice = parseMoney(line.unitPrice);
    return {
      id: line.id || nanoid(8),
      category: line.category || "Servicio",
      description: String(line.description || "").trim(),
      quantity,
      unitPrice,
      total: parseMoney(quantity * unitPrice)
    };
  });
  if (!req.body.reservationId || !req.body.guest?.name || !lines.length || lines.some((line) => !line.description || line.unitPrice < 0)) {
    return fail(res, "Reserva, cliente y detalles validos son obligatorios", 422);
  }
  const subtotal = parseMoney(lines.reduce((sum, line) => sum + line.total, 0));
  const taxRate = Math.max(0, Number(req.body.taxRate || 0));
  const tax = parseMoney(subtotal * taxRate);
  const invoice = {
    id: nanoid(11),
    idempotencyKey,
    number: nextInvoiceNumber(),
    status: "final",
    reservationId: req.body.reservationId,
    reservationCode: req.body.reservationCode || "",
    guest: {
      id: req.body.guest.id || null,
      name: req.body.guest.name,
      documentType: req.body.guest.documentType || "",
      documentNumber: req.body.guest.documentNumber || "",
      email: req.body.guest.email || "",
      phone: req.body.guest.phone || "",
      address: req.body.guest.address || ""
    },
    roomId: req.body.roomId || "",
    roomType: req.body.roomType || "",
    checkIn: req.body.checkIn,
    checkOut: req.body.checkOut,
    nights: Math.max(1, Number(req.body.nights || 1)),
    lines,
    subtotal,
    taxRate,
    tax,
    total: parseMoney(subtotal + tax),
    paid: 0,
    balance: parseMoney(subtotal + tax),
    paymentStatus: "pending",
    notes: req.body.notes || "",
    issuedBy: req.body.issuedBy || "Recepcion",
    currency: "USD",
    issuedAt: now(),
    updatedAt: now()
  };
  for (const payment of state.payments.filter((item) => item.reservationId === invoice.reservationId)) {
    payment.invoiceId = invoice.id;
    payment.invoiceNumber = invoice.number;
  }
  state.invoices.unshift(invoice);
  refreshInvoice(invoice);
  await persist();
  ok(res, invoice, 201);
});

app.get("/daily", (req, res) => ok(res, dailySnapshot(req.query.date || today())));

app.get("/summary", (req, res) => {
  const { from, to } = periodFromQuery(req.query);
  const periodMovements = state.movements.filter((item) => item.status !== "voided" && inPeriod(item.date, from, to));
  const periodInvoices = state.invoices.map(refreshInvoice).filter((item) => inPeriod(item.issuedAt, from, to));
  const income = movementTotal(periodMovements, "income");
  const expense = movementTotal(periodMovements, "expense");
  const accountsReceivable = parseMoney(periodInvoices.reduce((sum, item) => sum + item.balance, 0));
  ok(res, {
    from,
    to,
    income,
    expense,
    balance: parseMoney(income - expense),
    accountsReceivable,
    invoices: periodInvoices.length,
    paidInvoices: periodInvoices.filter((item) => item.paymentStatus === "paid").length,
    openShift: state.openShift,
    today: dailySnapshot()
  });
});

app.get("/analytics", async (req, res) => {
  const { from, to } = periodFromQuery(req.query);
  if (to < from) return fail(res, "La fecha final debe ser posterior a la fecha inicial", 422);
  try {
    const [reservations, rooms] = await Promise.all([
      serviceRequest("reservations", "/reservations"),
      serviceRequest("rooms", "/")
    ]);
    ok(res, analyticsSnapshot(from, to, reservations, rooms));
  } catch (error) {
    return fail(res, `No se pudo consolidar el reporte hotelero: ${error.message}`, 503);
  }
});

app.get("/metrics", (_req, res) => {
  const finalized = state.invoices.filter((item) => item.status === "final");
  const revenue = parseMoney(finalized.reduce((sum, item) => sum + item.total, 0));
  const collected = parseMoney(state.payments
    .filter((item) => item.status !== "voided")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const expenses = movementTotal(state.movements, "expense");
  const roomNights = finalized.reduce((sum, item) => {
    const lodging = item.lines.find((line) => line.category === "Hospedaje");
    return sum + Number(lodging?.quantity || 0);
  }, 0);
  ok(res, {
    revenue,
    collected,
    expenses,
    cashBalance: parseMoney(collected - expenses),
    averageTicket: finalized.length ? parseMoney(revenue / finalized.length) : 0,
    averageDailyRate: roomNights ? parseMoney(finalized.reduce((sum, item) => sum + Number(item.lines.find((line) => line.category === "Hospedaje")?.total || 0), 0) / roomNights) : 0,
    accountsReceivable: parseMoney(finalized.reduce((sum, item) => sum + refreshInvoice(item).balance, 0)),
    invoices: finalized.length,
    roomNights
  });
});

app.get("/shifts", (_req, res) => ok(res, { openShift: openShiftView(), history: state.shifts }));

app.post("/shifts/open", async (req, res) => {
  if (state.openShift) return fail(res, "Ya existe una caja abierta", 409);
  if (!req.body.responsible) return fail(res, "El responsable es obligatorio", 422);
  state.openShift = {
    id: nanoid(9),
    date: today(),
    shift: req.body.shift || "Jornada 24/7",
    responsible: req.body.responsible,
    initial: parseMoney(req.body.initial),
    notes: req.body.notes || "",
    status: "open",
    openedAt: now()
  };
  await persist();
  ok(res, state.openShift, 201);
});

app.post("/shifts/close", async (req, res) => {
  if (!state.openShift) return fail(res, "No existe caja abierta", 404);
  const expected = parseMoney(state.openShift.initial + state.movements
    .filter((item) => item.status !== "voided" && item.method === "Efectivo" && item.shiftId === state.openShift.id)
    .reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0));
  const closed = parseMoney(req.body.closed);
  const shift = {
    ...state.openShift,
    closed,
    expected,
    difference: parseMoney(closed - expected),
    notes: req.body.notes || state.openShift.notes || "",
    status: "closed",
    closedAt: now()
  };
  state.shifts.unshift(shift);
  state.openShift = null;
  await persist();
  ok(res, shift);
});

app.get("/export.xlsx", async (req, res, next) => {
  try {
    const { from, to } = periodFromQuery(req.query);
    if (to < from) return fail(res, "La fecha final debe ser posterior a la fecha inicial", 422);
    const [reservations, rooms] = await Promise.all([
      serviceRequest("reservations", "/reservations"),
      serviceRequest("rooms", "/")
    ]);
    const workbook = createWorkbook({ from, to, reservations, rooms });
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="wild-incas-${from}-${to}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
});

function createWorkbook({ from, to, reservations, rooms }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Wild Incas Hotel Management";
  workbook.created = new Date();
  workbook.company = "Wild Incas";
  const analytics = analyticsSnapshot(from, to, reservations, rooms);
  const invoiceIds = new Set(analytics.invoices.map((item) => item.id));
  const shiftRows = state.shifts.filter((item) => inPeriod(item.date, from, to));
  const summary = workbook.addWorksheet("Resumen general", { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 36 }, { width: 22 }];
  summary.addRows([
    ["WILD INCAS - INFORME HOTELERO"],
    ["Periodo", `${from} al ${to}`],
    ["Generado", new Date()],
    ["Ingresos", analytics.summary.income],
    ["Gastos", analytics.summary.expense],
    ["Utilidad", analytics.summary.profit],
    ["Cobrado", analytics.summary.collected],
    ["Cuentas pendientes", analytics.summary.accountsReceivable],
    ["Notas de venta finales", analytics.summary.invoices],
    ["Estadias", analytics.summary.reservations],
    ["Huespedes unicos", analytics.summary.guests],
    ["Noches vendidas", analytics.summary.roomNights],
    ["Ocupacion estimada", analytics.summary.occupancy / 100],
    ["Tarifa promedio", analytics.summary.averageDailyRate],
    ["Ticket promedio", analytics.summary.averageTicket]
  ]);
  styleSummary(summary);

  const trend = addDataSheet(workbook, "Tendencia", [
    ["Periodo", "label"], ["Ingresos", "income"], ["Gastos", "expense"], ["Balance", "balance"], ["Intensidad", "bar"]
  ], analytics.series.map((item) => ({
    ...item,
    balance: parseMoney(item.income - item.expense),
    bar: "#".repeat(Math.max(1, Math.round((item.income / Math.max(1, ...analytics.series.map((row) => row.income))) * 24)))
  })));
  trend.getColumn(5).font = { color: { argb: "FF7A2431" } };

  const stayRows = analytics.stays.map((stay) => {
    const payments = state.payments.filter((item) => item.status !== "voided" && item.reservationId === stay.id);
    const paid = parseMoney(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0));
    const created = (stay.audit || []).find((entry) => entry.action === "reservation_created");
    const closed = (stay.audit || []).find((entry) => entry.action === "checkout");
    return {
      ...stay,
      guestName: stay.guest?.name || "Consumidor final",
      guestDocument: stay.guest?.documentNumber || "",
      guestEmail: stay.guest?.email || "",
      chargeTotal: parseMoney((stay.charges || []).reduce((sum, item) => sum + Number(item.total || 0), 0)),
      paid,
      pending: parseMoney(Math.max(0, Number(stay.total || 0) - paid)),
      createdBy: created?.actor || "",
      finalizedBy: stay.checkedOutBy || closed?.actor || "",
      finalizedAt: stay.checkedOutAt || closed?.createdAt || ""
    };
  });
  addDataSheet(workbook, "Estadias", [
    ["Reserva", "code"], ["Estado", "status"], ["Huesped", "guestName"], ["Documento", "guestDocument"],
    ["Correo", "guestEmail"], ["Habitacion", "roomId"], ["Tipo", "roomType"], ["Entrada", "checkIn"],
    ["Salida", "checkOut"], ["Hora salida", "exitTime"], ["Noches", "nights"], ["Adultos", "adults"],
    ["Tarifa", "nightlyRate"], ["Hospedaje", "lodgingSubtotal"], ["Servicios", "chargeTotal"], ["Total", "total"],
    ["Pagado", "paid"], ["Pendiente", "pending"], ["Origen", "source"], ["Registrado por", "createdBy"],
    ["Finalizado por", "finalizedBy"], ["Fecha finalizacion", "finalizedAt"], ["Notas", "notes"]
  ], stayRows);

  addDataSheet(workbook, "Notas de venta", [
    ["Numero", "number"], ["Fecha", "issuedAt"], ["Reserva", "reservationCode"], ["Cliente", "guest.name"],
    ["Documento", "guest.documentNumber"], ["Habitacion", "roomId"], ["Entrada", "checkIn"], ["Salida", "checkOut"],
    ["Subtotal", "subtotal"], ["Impuesto", "tax"], ["Total", "total"], ["Pagado", "paid"], ["Saldo", "balance"], ["Estado pago", "paymentStatus"],
    ["Emitida por", "issuedBy"]
  ], analytics.invoices);
  addDataSheet(workbook, "Detalles", [
    ["Nota de venta", "invoiceNumber"], ["Categoria", "category"], ["Descripcion", "description"], ["Cantidad", "quantity"], ["Precio unitario", "unitPrice"], ["Total", "total"]
  ], state.invoices.filter((invoice) => invoiceIds.has(invoice.id)).flatMap((invoice) => invoice.lines.map((line) => ({ invoiceNumber: invoice.number, ...line }))));
  addDataSheet(workbook, "Pagos", [
    ["Fecha", "createdAt"], ["Nota de venta", "invoiceNumber"], ["Reserva", "reservationCode"], ["Cliente", "guestName"], ["Habitacion", "roomId"], ["Metodo", "method"], ["Referencia", "reference"], ["Monto", "amount"], ["Recibido", "received"], ["Cambio", "change"], ["Estado", "status"], ["Motivo anulacion", "voidReason"]
  ], state.payments.filter((item) => inPeriod(item.createdAt, from, to)));
  addDataSheet(workbook, "Ingresos y gastos", [
    ["Fecha", "date"], ["Tipo", "type"], ["Categoria", "category"], ["Concepto", "concept"], ["Metodo", "method"], ["Referencia", "reference"], ["Monto", "amount"], ["Notas", "notes"], ["Estado", "status"], ["Motivo anulacion", "voidReason"]
  ], state.movements.filter((item) => inPeriod(item.date, from, to)));
  addDataSheet(workbook, "Turnos", [
    ["Fecha", "date"], ["Turno", "shift"], ["Responsable", "responsible"], ["Inicial", "initial"], ["Esperado", "expected"], ["Cierre", "closed"], ["Diferencia", "difference"], ["Estado", "status"], ["Notas", "notes"]
  ], shiftRows);
  addDataSheet(workbook, "Habitaciones", [
    ["Numero", "id"], ["Piso", "floor"], ["Tipo", "type"], ["Capacidad", "capacity"], ["Tarifa", "rate"], ["Estado actual", "status"], ["Notas", "notes"]
  ], rooms);
  addDataSheet(workbook, "Metodos de pago", [["Metodo", "method"], ["Total cobrado", "amount"]], analytics.methods);
  addDataSheet(workbook, "Categorias", [["Categoria", "category"], ["Ingresos", "income"], ["Gastos", "expense"]], analytics.categories);
  return workbook;
}

function addDataSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  sheet.columns = columns.map(([header, key]) => ({ header, key, width: Math.max(14, Math.min(34, header.length + 8)) }));
  for (const row of rows) {
    const values = {};
    for (const [, key] of columns) values[key] = key.split(".").reduce((value, part) => value?.[part], row) ?? "";
    sheet.addRow(values);
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5A2630" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.eachRow((row, index) => {
    row.alignment = { vertical: "middle" };
    if (index > 1 && index % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F1EC" } };
  });
  const moneyKeys = new Set(["subtotal", "tax", "total", "paid", "balance", "amount", "received", "change", "unitPrice", "nightlyRate", "lodgingSubtotal", "chargeTotal", "pending", "income", "expense", "profit", "collected", "averageDailyRate", "averageTicket", "initial", "expected", "closed", "difference"]);
  columns.forEach(([, key], index) => {
    if (moneyKeys.has(key)) sheet.getColumn(index + 1).numFmt = '$#,##0.00';
  });
  return sheet;
}

function styleSummary(sheet) {
  sheet.mergeCells("A1:B1");
  sheet.getCell("A1").font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5A2630" } };
  sheet.getCell("A1").alignment = { horizontal: "center" };
  sheet.getCell("B3").numFmt = "yyyy-mm-dd hh:mm";
  for (const row of [4, 5, 6, 7, 8, 14, 15]) sheet.getCell(row, 2).numFmt = '$#,##0.00';
  sheet.getCell("B13").numFmt = "0.0%";
  for (let row = 2; row <= 15; row += 1) sheet.getCell(row, 1).font = { bold: true };
}

listen();
