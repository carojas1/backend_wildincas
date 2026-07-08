import nodemailer from "nodemailer";
import { nanoid } from "nanoid";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok, parseMoney } from "../../shared/service.js";

const port = Number(process.env.NOTIFICATIONS_PORT || 7107);
const { app, listen } = createService({ name: "notifications", port, description: "Envio de comprobantes y notificaciones" });
let sent = [];
sent = await loadState("notifications", []);

function persist() {
  saveState("notifications", sent);
}

function createTransport() {
  if (!process.env.MAIL_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE || "false") === "true",
    auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined
  });
}

async function deliver(message) {
  const transport = createTransport();
  const record = {
    id: nanoid(8),
    ...message,
    status: "logged",
    createdAt: new Date().toISOString()
  };
  if (transport) {
    await transport.sendMail({
      from: process.env.MAIL_FROM || "SIMOT Wild Incas <no-reply@wildincas.local>",
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    record.status = "sent";
  }
  sent.unshift(record);
  persist();
  return record;
}

app.post("/receipts", async (req, res) => {
  if (!req.body.to) return fail(res, "El correo del cliente es obligatorio", 422);
  const amount = parseMoney(req.body.amount);
  const concept = req.body.concept || "Hospedaje";
  const guestName = req.body.guestName || "Cliente";
  const documentNumber = req.body.documentNumber || "Consumidor final";
  const saleNumber = req.body.saleNumber || `NV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${nanoid(4).toUpperCase()}`;
  const html = saleNoteHtml({ guestName, documentNumber, amount, concept, saleNumber });
  const receipt = await deliver({
    type: "sale-note",
    to: req.body.to,
    guestName,
    amount,
    concept,
    saleNumber,
    subject: `Nota de venta ${saleNumber} - Wild Incas`,
    text: `Hola ${guestName}. Emitimos la nota de venta ${saleNumber} por $${amount.toFixed(2)}. Concepto: ${concept}.`,
    html
  });
  ok(res, receipt, 201);
});

app.post("/employees/welcome", async (req, res) => {
  if (!req.body.to || !req.body.username || !req.body.password) return fail(res, "Correo, usuario y contrasena son obligatorios", 422);
  const html = welcomeHtml(req.body);
  const record = await deliver({
    type: "employee-welcome",
    to: req.body.to,
    guestName: req.body.name || req.body.username,
    amount: 0,
    concept: "Cuenta de empleado",
    subject: "Acceso a SIMOT Wild Incas",
    text: `Hola ${req.body.name || req.body.username}. Tu usuario SIMOT es ${req.body.username} y tu contrasena temporal es ${req.body.password}.`,
    html
  });
  ok(res, record, 201);
});

app.post("/test", async (req, res) => {
  if (!req.body.to) return fail(res, "Correo destino obligatorio", 422);
  const record = await deliver({
    type: "test",
    to: req.body.to,
    guestName: "Prueba",
    amount: 0,
    concept: "Prueba de correo",
    subject: "Prueba Brevo - SIMOT Wild Incas",
    text: "Si recibes este correo, Brevo SMTP esta conectado correctamente.",
    html: baseEmail("Prueba Brevo", "<p>Si recibes este correo, Brevo SMTP esta conectado correctamente.</p>")
  });
  ok(res, record, 201);
});

app.get("/receipts", (_req, res) => ok(res, sent));

function saleNoteHtml({ guestName, documentNumber, amount, concept, saleNumber }) {
  return baseEmail("Nota de venta", `
    <p><strong>Wild Incas Backpackers Hostal</strong></p>
    <p>Nota: <strong>${saleNumber}</strong></p>
    <p>Cliente: ${escapeHtml(guestName)}</p>
    <p>Documento: ${escapeHtml(documentNumber)}</p>
    <table>
      <thead><tr><th>Concepto</th><th>Total</th></tr></thead>
      <tbody><tr><td>${escapeHtml(concept)}</td><td>$${amount.toFixed(2)}</td></tr></tbody>
    </table>
    <p class="total">Total pagado: $${amount.toFixed(2)}</p>
  `);
}

function welcomeHtml({ name, username, password, role }) {
  const appUrl = process.env.APP_PUBLIC_URL || "http://127.0.0.1:5173";
  return baseEmail("Cuenta de empleado creada", `
    <p>Hola ${escapeHtml(name || username)}, tu cuenta para SIMOT Wild Incas fue creada.</p>
    <table>
      <tbody>
        <tr><th>Usuario</th><td>${escapeHtml(username)}</td></tr>
        <tr><th>Contrasena temporal</th><td>${escapeHtml(password)}</td></tr>
        <tr><th>Rol</th><td>${escapeHtml(role || "Recepcion")}</td></tr>
      </tbody>
    </table>
    <p><a href="${appUrl}">Ingresar al sistema</a></p>
  `);
}

function baseEmail(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;background:#faf8f3;color:#40342d;margin:0;padding:24px}
    .box{max-width:680px;margin:auto;background:white;border:1px solid #ebe5dc;border-radius:8px;padding:28px}
    h1{font-family:Georgia,serif;color:#4d392f} table{width:100%;border-collapse:collapse;margin:18px 0}
    th{background:#4d392f;color:white;text-align:left} td,th{border:1px solid #ebe5dc;padding:10px}
    .total{font-size:18px;font-weight:bold;color:#5d8a70} a{color:#4d392f;font-weight:bold}
  </style></head><body><div class="box"><h1>${title}</h1>${body}<p>SIMOT v2.0 - Wild Incas Backpackers Hostal</p></div></body></html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

listen();
