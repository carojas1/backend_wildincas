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
    error: "",
    createdAt: new Date().toISOString()
  };
  if (transport) {
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM || "SIMOT Wild Incas <no-reply@wildincas.local>",
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html
      });
      record.status = "sent";
    } catch (error) {
      record.status = "email_error";
      record.error = error.message;
      console.warn(`Email delivery failed: ${error.message}`);
      if (process.env.BREVO_API_KEY) {
        try {
          await sendViaBrevoApi(message);
          record.status = "sent_api";
          record.error = "";
        } catch (apiError) {
          record.error = `${record.error} | Brevo API: ${apiError.message}`;
          console.warn(`Brevo API delivery failed: ${apiError.message}`);
        }
      }
    }
  } else if (process.env.BREVO_API_KEY) {
    try {
      await sendViaBrevoApi(message);
      record.status = "sent_api";
    } catch (error) {
      record.status = "email_error";
      record.error = error.message;
      console.warn(`Brevo API delivery failed: ${error.message}`);
    }
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

app.get("/config", (_req, res) => ok(res, {
  smtpConfigured: Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS),
  apiConfigured: Boolean(process.env.BREVO_API_KEY),
  from: process.env.MAIL_FROM || "",
  smtpUser: process.env.MAIL_USER || ""
}));

function saleNoteHtml({ guestName, documentNumber, amount, concept, saleNumber }) {
  return baseEmail("Nota de venta", `
    <div class="meta">
      <span>Nota</span><strong>${saleNumber}</strong>
      <span>Fecha</span><strong>${new Date().toLocaleString("es-EC")}</strong>
    </div>
    <table>
      <tbody>
        <tr><th>Cliente</th><td>${escapeHtml(guestName)}</td></tr>
        <tr><th>Documento</th><td>${escapeHtml(documentNumber)}</td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th>Concepto</th><th>Total</th></tr></thead>
      <tbody><tr><td>${escapeHtml(concept)}</td><td class="money">$${amount.toFixed(2)}</td></tr></tbody>
    </table>
    <p class="total">Total pagado: $${amount.toFixed(2)}</p>
    <p class="muted">Gracias por hospedarte en Wild Incas. Este comprobante fue emitido desde el sistema hotelero.</p>
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
    body{font-family:Arial,sans-serif;background:#f4f6f3;color:#26312d;margin:0;padding:24px}
    .box{max-width:720px;margin:auto;background:white;border:1px solid #dfe5df;border-radius:12px;overflow:hidden}
    .head{background:#24483f;color:white;padding:26px 30px}
    .head small{color:#d8c18c;font-weight:bold;text-transform:uppercase;letter-spacing:.08em}
    .head h1{margin:8px 0 0;font-size:30px}
    .content{padding:28px 30px}
    .meta{display:grid;grid-template-columns:90px 1fr;gap:8px 14px;background:#edf1ec;border-radius:10px;padding:14px;margin-bottom:18px}
    .meta span,.muted{color:#6f7a73;font-size:13px}
    table{width:100%;border-collapse:collapse;margin:18px 0}
    th{background:#24483f;color:white;text-align:left}
    td,th{border:1px solid #dfe5df;padding:12px}
    .money{text-align:right;font-weight:bold}
    .total{font-size:22px;font-weight:bold;color:#3f7f63;text-align:right}
    .footer{border-top:1px solid #dfe5df;padding:18px 30px;color:#6f7a73;font-size:13px}
    a{color:#24483f;font-weight:bold}
  </style></head><body><div class="box"><div class="head"><small>Wild Incas Backpackers Hostal</small><h1>${title}</h1></div><div class="content">${body}</div><div class="footer">Sistema hotelero SIMOT - comprobante transaccional</div></div></body></html>`;
}

async function sendViaBrevoApi(message) {
  const sender = parseSender(process.env.MAIL_FROM || "Wild Incas <no-reply@wildincas.local>");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender,
      to: [{ email: message.to, name: message.guestName || message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

function parseSender(value) {
  const match = String(value).match(/^(.*)<(.+)>$/);
  if (!match) return { name: "Wild Incas", email: value };
  return { name: match[1].trim() || "Wild Incas", email: match[2].trim() };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

listen();
