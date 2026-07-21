import nodemailer from "nodemailer";
import { nanoid } from "nanoid";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, parseMoney } from "../../shared/service.js";

const port = Number(process.env.NOTIFICATIONS_PORT || 7107);
const { app, listen } = createService({
  name: "notifications",
  port,
  description: "Cola idempotente de correos transaccionales con reintentos"
});

const loaded = await loadState("notifications", { jobs: [] });
let state = { jobs: Array.isArray(loaded) ? loaded.map(normalizeLegacy) : Array.isArray(loaded?.jobs) ? loaded.jobs : [] };
let retryRunning = false;
const inFlight = new Set();

function normalizeLegacy(item) {
  return {
    ...item,
    eventType: item.eventType || item.type || "sale-note",
    idempotencyKey: item.idempotencyKey || `legacy:${item.id}`,
    attempts: Number(item.attempts || 1),
    nextAttemptAt: item.nextAttemptAt || null
  };
}

function persist() {
  saveState("notifications", state);
}

function now() {
  return new Date().toISOString();
}

function createTransport() {
  if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE || "false") === "true",
    connectionTimeout: Number(process.env.MAIL_TIMEOUT_MS || 6500),
    greetingTimeout: Number(process.env.MAIL_TIMEOUT_MS || 6500),
    socketTimeout: Number(process.env.MAIL_TIMEOUT_MS || 6500),
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
  });
}

function sender() {
  return parseSender(process.env.MAIL_FROM || process.env.MAIL_USER || "");
}

async function sendViaBrevoApi(message) {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY no configurada");
  const from = sender();
  if (!from.email) throw new Error("MAIL_FROM no contiene un remitente valido");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.BREVO_TIMEOUT_MS || 5000));
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: from,
        to: [{ email: message.to, name: message.recipientName || message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        headers: { "X-SIMOT-Event-ID": message.idempotencyKey }
      })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.code || `Brevo API respondio ${response.status}`);
    }
    return { provider: "brevo-api", response: await response.json().catch(() => ({})) };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaSmtp(message) {
  const transport = createTransport();
  if (!transport) throw new Error("SMTP no configurado");
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: { "X-SIMOT-Event-ID": message.idempotencyKey }
  });
  return { provider: "smtp", response: { messageId: info.messageId } };
}

async function attempt(job) {
  job.attempts = Number(job.attempts || 0) + 1;
  job.lastAttemptAt = now();
  job.status = "sending";
  job.error = "";
  persist();
  const message = buildMessage(job.eventType, job.to, job.payload, job.idempotencyKey);
  const errors = [];
  const providers = configuredProviders();
  if (!providers.length) {
    job.status = "configuration_error";
    job.error = "Configura BREVO_API_KEY en Render y verifica MAIL_FROM en Brevo";
    job.nextAttemptAt = null;
    persist();
    return job;
  }
  for (const provider of providers) {
    try {
      const result = await provider(message);
      job.status = "sent";
      job.provider = result.provider;
      job.providerResponse = result.response;
      job.sentAt = now();
      job.nextAttemptAt = null;
      job.error = "";
      persist();
      return job;
    } catch (error) {
      errors.push(error.name === "AbortError" ? "Tiempo de espera agotado" : error.message);
    }
  }
  job.status = job.attempts >= Number(process.env.MAIL_MAX_ATTEMPTS || 5) ? "failed" : "pending_retry";
  job.error = errors.join(" | ");
  job.nextAttemptAt = job.status === "pending_retry"
    ? new Date(Date.now() + Math.min(30, 2 ** job.attempts) * 60000).toISOString()
    : null;
  persist();
  return job;
}

function configuredProviders() {
  const provider = selectedProvider();
  const allowSmtpFallback = String(process.env.MAIL_SMTP_FALLBACK || "false") === "true";
  const apiReady = Boolean(process.env.BREVO_API_KEY);
  const smtpReady = Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
  const providers = [];
  if (provider === "brevo-api" && apiReady) providers.push(sendViaBrevoApi);
  if (provider === "smtp" && smtpReady) providers.push(sendViaSmtp);
  if (allowSmtpFallback && provider !== "smtp" && smtpReady) providers.push(sendViaSmtp);
  if (allowSmtpFallback && provider !== "brevo-api" && apiReady) providers.push(sendViaBrevoApi);
  return providers;
}

function selectedProvider() {
  return String(process.env.MAIL_PROVIDER || "brevo-api").toLowerCase();
}

function scheduleAttempt(job) {
  if (inFlight.has(job.id)) return;
  inFlight.add(job.id);
  const task = setImmediate(async () => {
    try {
      await attempt(job);
    } catch (error) {
      job.status = "pending_retry";
      job.error = error.message;
      job.nextAttemptAt = new Date(Date.now() + 60000).toISOString();
      persist();
    } finally {
      inFlight.delete(job.id);
    }
  });
  task.unref();
}

async function enqueue({ eventType, to, idempotencyKey, payload }) {
  const existing = state.jobs.find((item) => item.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const job = {
    id: nanoid(11),
    eventType,
    type: eventType,
    to: String(to || "").trim().toLowerCase(),
    recipientName: payload?.guest?.name || payload?.name || "Cliente",
    idempotencyKey,
    payload: payload || {},
    status: "queued",
    attempts: 0,
    error: "",
    createdAt: now(),
    nextAttemptAt: now()
  };
  state.jobs.unshift(job);
  persist();
  scheduleAttempt(job);
  return job;
}

app.post("/events", async (req, res) => {
  const { eventType, to, idempotencyKey, payload } = req.body;
  if (!eventType || !to || !idempotencyKey) return fail(res, "Evento, correo e identificador unico son obligatorios", 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(res, "Correo del destinatario no valido", 422);
  const job = await enqueue({ eventType, to, idempotencyKey, payload });
  ok(res, job, 202);
});

app.post("/receipts", async (req, res) => {
  if (!req.body.to) return fail(res, "El correo del cliente es obligatorio", 422);
  const amount = parseMoney(req.body.amount);
  const saleNumber = req.body.saleNumber || `NV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${nanoid(4).toUpperCase()}`;
  const job = await enqueue({
    eventType: "payment-confirmation",
    to: req.body.to,
    idempotencyKey: req.body.idempotencyKey || `legacy-receipt:${saleNumber}`,
    payload: {
      guest: { name: req.body.guestName || "Cliente", documentNumber: req.body.documentNumber || "Consumidor final" },
      payment: { id: saleNumber, amount, method: req.body.method || "", createdAt: now() },
      reservation: { code: saleNumber, roomId: req.body.roomId || "", total: amount, lines: [{ description: req.body.concept || "Hospedaje", quantity: 1, unitPrice: amount, total: amount }] }
    }
  });
  ok(res, { ...job, guestName: job.recipientName, amount, saleNumber }, 201);
});

app.post("/employees/welcome", async (req, res) => {
  if (!req.body.to || !req.body.username || !req.body.password) return fail(res, "Correo, usuario y contrasena son obligatorios", 422);
  const job = await enqueue({
    eventType: "employee-welcome",
    to: req.body.to,
    idempotencyKey: req.body.idempotencyKey || `employee-welcome:${req.body.username}`,
    payload: req.body
  });
  ok(res, job, 201);
});

app.post("/test", async (req, res) => {
  if (!req.body.to) return fail(res, "Correo destino obligatorio", 422);
  const job = await enqueue({
    eventType: "test",
    to: req.body.to,
    idempotencyKey: `test:${req.body.to}:${Date.now()}`,
    payload: { name: "Prueba operativa", createdAt: now() }
  });
  ok(res, job, 201);
});

app.get(["/events", "/receipts"], (req, res) => {
  const status = req.query.status || "all";
  ok(res, state.jobs.filter((item) => status === "all" || item.status === status));
});

app.post("/events/:id/retry", async (req, res) => {
  const job = state.jobs.find((item) => item.id === req.params.id);
  if (!job) return fail(res, "Correo no encontrado", 404);
  job.status = "queued";
  job.nextAttemptAt = now();
  job.error = "";
  persist();
  scheduleAttempt(job);
  ok(res, job, 202);
});

app.get("/config", (_req, res) => ok(res, {
  provider: selectedProvider(),
  ready: configuredProviders().length > 0,
  smtpConfigured: Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS),
  apiConfigured: Boolean(process.env.BREVO_API_KEY),
  smtpFallback: String(process.env.MAIL_SMTP_FALLBACK || "false") === "true",
  recommendation: process.env.BREVO_API_KEY
    ? "Brevo API HTTPS activa"
    : "Agrega BREVO_API_KEY en Render; SMTP no funciona en instancias Free",
  from: process.env.MAIL_FROM || "",
  queue: {
    total: state.jobs.length,
    sent: state.jobs.filter((item) => item.status === "sent").length,
    pending: state.jobs.filter((item) => ["queued", "sending", "pending_retry"].includes(item.status)).length,
    failed: state.jobs.filter((item) => ["failed", "configuration_error"].includes(item.status)).length
  }
}));

async function retryPending() {
  if (retryRunning) return;
  retryRunning = true;
  try {
    const due = state.jobs.filter((item) => item.status === "pending_retry" && item.nextAttemptAt && item.nextAttemptAt <= now()).slice(0, 5);
    for (const job of due) scheduleAttempt(job);
  } finally {
    retryRunning = false;
  }
}

function buildMessage(eventType, to, payload, idempotencyKey) {
  const guest = payload?.guest || {};
  const reservation = payload?.reservation || {};
  const invoice = payload?.invoice || {};
  const payment = payload?.payment || {};
  const name = guest.name || payload?.name || reservation.guest?.name || "Cliente";
  const messages = {
    "reservation-confirmed": {
      title: "Reserva confirmada",
      subject: `Reserva ${reservation.code} confirmada - Wild Incas`,
      intro: `Hola ${escapeHtml(name)}, tu reserva fue confirmada.`,
      rows: reservationRows(reservation),
      total: reservation.total,
      paid: reservation.paid,
      balance: reservation.balance
    },
    "reservation-modified": {
      title: "Reserva actualizada",
      subject: `Actualizacion de reserva ${reservation.code} - Wild Incas`,
      intro: `Hola ${escapeHtml(name)}, registramos cambios en tu reserva.`,
      rows: reservationRows(reservation),
      total: reservation.total,
      paid: reservation.paid,
      balance: reservation.balance
    },
    "reservation-cancelled": {
      title: "Reserva cancelada",
      subject: `Reserva ${reservation.code} cancelada - Wild Incas`,
      intro: `Hola ${escapeHtml(name)}, tu reserva fue cancelada.`,
      rows: [...reservationRows(reservation), ["Motivo", reservation.cancellationReason || "Cancelacion solicitada"]]
    },
    "check-in": {
      title: "Check-in registrado",
      subject: `Comprobante de check-in ${reservation.code} - Wild Incas`,
      intro: `Bienvenido ${escapeHtml(name)}. Tu ingreso al hostal fue registrado.`,
      rows: reservationRows(reservation),
      total: reservation.total,
      paid: reservation.paid,
      balance: reservation.balance
    },
    "payment-confirmation": {
      title: "Pago confirmado",
      subject: `Pago confirmado ${reservation.code || payment.id} - Wild Incas`,
      intro: `Hola ${escapeHtml(name)}, registramos correctamente tu pago.`,
      rows: [["Referencia", payment.id || reservation.code], ["Metodo", payment.method || ""], ["Fecha", formatDate(payment.createdAt)]],
      total: reservation.total,
      paid: payment.amount,
      balance: reservation.balance
    },
    "invoice-finalized": {
      title: `Factura ${invoice.number}`,
      subject: `Factura final ${invoice.number} - Wild Incas`,
      intro: `Gracias por hospedarte con nosotros, ${escapeHtml(name)}. Esta es tu factura definitiva.`,
      rows: [["Factura", invoice.number], ["Reserva", reservation.code], ["Habitacion", reservation.roomId], ["Entrada", reservation.checkIn], ["Salida", reservation.checkOut], ["Estado de pago", invoice.paymentStatus]],
      lines: invoice.lines,
      total: invoice.total,
      balance: invoice.balance
    },
    "employee-welcome": {
      title: "Cuenta de empleado creada",
      subject: "Acceso a SIMOT Wild Incas",
      intro: `Hola ${escapeHtml(payload.name || payload.username)}, tu cuenta fue creada.`,
      rows: [["Usuario", payload.username], ["Contrasena temporal", payload.password], ["Rol", payload.role || "Recepcion"]],
      link: process.env.APP_PUBLIC_URL
    },
    test: {
      title: "Prueba de correo exitosa",
      subject: "Prueba Brevo - SIMOT Wild Incas",
      intro: "La configuracion de correo transaccional esta funcionando.",
      rows: [["Destino", to], ["Fecha", formatDate(payload.createdAt)]]
    }
  };
  const content = messages[eventType] || {
    title: "Notificacion Wild Incas",
    subject: "Notificacion de Wild Incas",
    intro: `Hola ${escapeHtml(name)}.`,
    rows: []
  };
  const html = emailHtml(content, idempotencyKey);
  return {
    to,
    recipientName: name,
    idempotencyKey,
    subject: content.subject,
    html,
    text: `${content.title}. ${stripHtml(content.intro)} Total: ${content.total ?? ""}`
  };
}

function reservationRows(reservation) {
  return [["Reserva", reservation.code], ["Habitacion", reservation.roomId], ["Entrada", reservation.checkIn], ["Salida", reservation.checkOut], ["Huespedes", `${reservation.adults || 1} adulto(s), ${reservation.children || 0} nino(s)`]];
}

function emailHtml(content, eventId) {
  const rows = (content.rows || []).map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "-")}</td></tr>`).join("");
  const lines = (content.lines || []).map((line) => `<tr><td><strong>${escapeHtml(line.description)}</strong><small>${escapeHtml(line.category || "Servicio")}</small></td><td class="center">${Number(line.quantity || 0)}</td><td class="money">$${parseMoney(line.unitPrice).toFixed(2)}</td><td class="money"><strong>$${parseMoney(line.total).toFixed(2)}</strong></td></tr>`).join("");
  const detailTable = content.lines?.length ? `<div class="section-title"><span>Detalle de la estadia</span><small>Valores en USD</small></div><table class="detail"><thead><tr><th>Detalle</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table>` : "";
  const customer = content.customer ? `<div class="customer"><div><small>Huesped / cliente</small><strong>${escapeHtml(content.customer.name)}</strong><span>Documento: ${escapeHtml(content.customer.document)}</span></div><div><small>Contacto</small><strong>${escapeHtml(content.customer.email)}</strong><span>${escapeHtml(content.customer.phone)}</span></div></div>` : "";
  const totals = content.total !== undefined ? `<div class="totals"><p><span>Subtotal / total</span><strong>$${parseMoney(content.total).toFixed(2)}</strong></p>${content.paid !== undefined ? `<p><span>Pagado</span><strong>$${parseMoney(content.paid).toFixed(2)}</strong></p>` : ""}<p class="grand"><span>Saldo</span><strong>$${parseMoney(content.balance || 0).toFixed(2)}</strong></p></div>` : "";
  const balance = content.balance > 0 ? `<p class="pending">Este comprobante mantiene un saldo pendiente de $${parseMoney(content.balance).toFixed(2)}.</p>` : content.total !== undefined ? `<p class="paid">Pago registrado. No existen valores pendientes en este comprobante.</p>` : "";
  const link = content.link ? `<p><a class="button" href="${escapeHtml(content.link)}">Ingresar al sistema</a></p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
    body{margin:0;background:#eef2f0;color:#20302b;font-family:Arial,sans-serif;padding:28px 10px}.wrap{max-width:720px;margin:auto;background:#fff;border:1px solid #d5ded9;box-shadow:0 12px 36px rgba(16,47,42,.08)}.head{background:#123f36;color:#fff;padding:28px 30px;border-bottom:5px solid #d5b978}.brand{display:table;width:100%}.mark,.brand-copy,.document{display:table-cell;vertical-align:middle}.mark{width:54px;height:54px;background:#d5b978;color:#123f36;text-align:center;font:bold 18px Georgia,serif}.brand-copy{padding-left:14px}.brand-copy strong,.brand-copy span{display:block}.brand-copy strong{font:700 24px Georgia,serif}.brand-copy span{margin-top:4px;color:#bcd0ca;font-size:11px;text-transform:uppercase}.document{text-align:right}.document small{display:block;color:#d5b978;font-weight:700}.document b{display:block;margin-top:6px;font-size:20px}.content{padding:28px 30px}.intro{margin:0 0 20px;font-size:16px;line-height:1.6}.customer{display:table;width:100%;background:#f0f5f2;border:1px solid #dce5e0;margin-bottom:18px}.customer>div{display:table-cell;width:50%;padding:14px 16px}.customer small,.customer strong,.customer span{display:block}.customer small{color:#68766f;font-size:10px;font-weight:700;text-transform:uppercase}.customer strong{margin:5px 0;font-size:14px}.customer span{color:#64716c;font-size:12px}table{width:100%;border-collapse:collapse;margin:0 0 22px}th,td{padding:11px 10px;border-bottom:1px solid #e0e7e3;text-align:left;font-size:12px}th{color:#65736d;font-size:10px;text-transform:uppercase}.detail thead{background:#123f36;color:#fff}.detail thead th{color:#e8f0ed}.detail td small{display:block;margin-top:3px;color:#78847f}.money{text-align:right}.center{text-align:center}.section-title{display:flex;justify-content:space-between;margin:24px 0 8px;color:#233b34;font-size:11px;font-weight:700;text-transform:uppercase}.section-title small{color:#7b8882}.totals{width:310px;max-width:100%;margin:18px 0 18px auto;border-top:2px solid #123f36}.totals p{display:flex;justify-content:space-between;margin:0;padding:10px 4px;border-bottom:1px solid #dfe6e2;font-size:13px}.totals .grand{font-size:18px;color:#123f36}.pending,.paid{padding:12px 14px;font-size:13px;font-weight:700}.pending{background:#f8eded;color:#954646}.paid{background:#e8f4ed;color:#256a4d}.button{display:inline-block;background:#123f36;color:#fff!important;padding:12px 18px;text-decoration:none}.foot{padding:18px 30px;border-top:1px solid #dfe6e2;background:#f0f5f2;color:#68766f;font-size:11px;line-height:1.5}.event{font-family:monospace}@media(max-width:560px){body{padding:0}.head,.content,.foot{padding:22px 18px}.mark{width:44px;height:44px}.brand-copy strong{font-size:20px}.document{display:block;text-align:left;padding-top:18px}.customer,.customer>div{display:block;width:auto}.customer>div+div{border-top:1px solid #dce5e0}th,td{padding:9px 5px;font-size:11px}}
  </style></head><body><div class="wrap"><div class="head"><div class="brand"><div class="mark">WI</div><div class="brand-copy"><strong>Wild Incas</strong><span>Backpackers Hostal / Cuenca, Ecuador</span></div><div class="document"><small>DOCUMENTO DIGITAL</small><b>${escapeHtml(content.title)}</b></div></div></div><div class="content"><p class="intro">${content.intro}</p>${customer}${rows ? `<table><tbody>${rows}</tbody></table>` : ""}${detailTable}${totals}${balance}${link}</div><div class="foot">Gracias por elegir Wild Incas. Documento generado por SIMOT.<br>ID unico de envio: <span class="event">${escapeHtml(eventId)}</span></div></div></body></html>`;
}

function parseSender(value) {
  const match = String(value || "").match(/^(.*)<(.+)>$/);
  if (!match) return { name: "Wild Incas", email: String(value || "").trim() };
  return { name: match[1].trim() || "Wild Incas", email: match[2].trim() };
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("es-EC") : "";
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

for (const job of state.jobs) {
  if (job.status === "sending") {
    job.status = "pending_retry";
    job.nextAttemptAt = now();
  }
}
setTimeout(retryPending, 1500).unref();
setInterval(retryPending, 60000).unref();
listen();
