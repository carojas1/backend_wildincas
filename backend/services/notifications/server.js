import nodemailer from "nodemailer";
import { nanoid } from "nanoid";
import { createService, ok, fail } from "../../shared/service.js";

const port = Number(process.env.NOTIFICATIONS_PORT || 7107);
const { app, listen } = createService({ name: "notifications", port, description: "Comprobantes, campanas y notificaciones" });
const sent = [];
const campaigns = [];
const idempotencyCache = new Map(); // key → { sentAt, result }

function createTransport() {
  if (!process.env.MAIL_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined
  });
}

function money(v) {
  return `$${Number(v || 0).toFixed(2)}`;
}

function brandHeader(title) {
  return `
<div style="background:#0a1b14;padding:24px 32px;display:flex;align-items:center;justify-content:space-between;">
  <div>
    <span style="color:#d4a96a;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">Wild Incas</span>
    <br><span style="color:white;font-size:13px;font-weight:600;">BACKPACKERS HOSTAL / CUENCA, ECUADOR</span>
  </div>
  <span style="color:white;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${title}</span>
</div>`;
}

function brandFooter(idempotencyKey) {
  return `
<div style="padding:16px 32px;background:#f5f5f0;border-top:1px solid #e0e0d8;color:#888;font-size:11px;">
  Gracias por elegir <strong>Wild Incas</strong>. Documento generado por SIMOT.<br>
  ID único de envío: ${idempotencyKey || ""}
</div>`;
}

function rowLine(label, value, highlight) {
  return `<tr style="border-bottom:1px solid #f0f0ea;">
    <td style="padding:10px 32px;color:#666;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${label}</td>
    <td style="padding:10px 32px;font-size:13px;font-weight:700;color:${highlight || "#1a1a1a"};text-align:right;">${value}</td>
  </tr>`;
}

// ── Build HTML per eventType ─────────────────────────────────────────────────

function buildPaymentEmail({ reservation, guest, payment, idempotencyKey }) {
  const res = reservation || {};
  const p = payment || {};
  const totalPaid = Number(res.totalPaid || p.amount || 0);
  const remaining = Math.max(0, Number(res.total || 0) - totalPaid);
  const date = new Date(p.paidAt || Date.now()).toLocaleString("es-EC", { timeZone: "America/Guayaquil", dateStyle: "medium", timeStyle: "short" });

  return {
    subject: `Pago confirmado - ${res.code || "Estadia Wild Incas"}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f0;">
<div style="max-width:540px;margin:32px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  ${brandHeader("Pago confirmado")}
  <div style="padding:24px 32px 0;">
    <p style="color:#333;font-size:14px;margin:0 0 16px;">Hola <strong>${guest?.name || "huesped"}</strong>, registramos correctamente tu pago.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    ${rowLine("Referencia", p.reference || p.id || "-", "#4a7c6f")}
    ${rowLine("Metodo", p.method || "Efectivo")}
    ${rowLine("Fecha", date)}
  </table>
  <div style="border-top:2px solid #f0f0ea;padding:16px 32px 8px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#666;font-size:12px;">Subtotal / total</td><td style="padding:6px 0;text-align:right;font-weight:700;">${money(res.total)}</td></tr>
      <tr><td style="padding:6px 0;font-size:15px;font-weight:700;color:#0a1b14;">Saldo</td><td style="padding:6px 0;text-align:right;font-size:15px;font-weight:700;color:${remaining > 0 ? "#c0392b" : "#27ae60"};">${money(remaining)}</td></tr>
    </table>
  </div>
  ${remaining <= 0 ? `<div style="margin:0 32px 20px;padding:12px 16px;background:#eafaf1;border-radius:6px;color:#1e8449;font-size:13px;font-weight:600;">Pago registrado. No existen valores pendientes en este comprobante.</div>` : `<div style="margin:0 32px 20px;padding:12px 16px;background:#fef9e7;border-radius:6px;color:#7d6608;font-size:13px;font-weight:600;">Saldo pendiente: ${money(remaining)}</div>`}
  ${brandFooter(idempotencyKey)}
</div></body></html>`
  };
}

function buildCheckInEmail({ reservation, guest, idempotencyKey }) {
  const res = reservation || {};
  return {
    subject: `Bienvenido a Wild Incas - Habitacion ${res.roomId || ""}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f0;">
<div style="max-width:540px;margin:32px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  ${brandHeader("Check-in confirmado")}
  <div style="padding:24px 32px;">
    <p style="color:#333;font-size:14px;margin:0 0 16px;">Hola <strong>${guest?.name || "huesped"}</strong>, bienvenido a Wild Incas Hostal. Tu estadia ha sido registrada correctamente.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    ${rowLine("Reserva", res.code || "-")}
    ${rowLine("Habitacion", `N° ${res.roomId}` || "-")}
    ${rowLine("Entrada", res.checkIn || "-")}
    ${rowLine("Salida prevista", res.checkOut || "-")}
    ${rowLine("Total estadia", money(res.total))}
  </table>
  <div style="padding:20px 32px;"><p style="color:#666;font-size:13px;margin:0;">Para cualquier necesidad, nuestro equipo de recepcion esta disponible las 24 horas.</p></div>
  ${brandFooter(idempotencyKey)}
</div></body></html>`
  };
}

function buildReservationEmail({ reservation, guest, idempotencyKey }, eventType) {
  const res = reservation || {};
  const title = eventType === "reservation-confirmed" ? "Reserva confirmada" : "Reserva actualizada";
  return {
    subject: `${title} - ${res.code || "Wild Incas"}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f0;">
<div style="max-width:540px;margin:32px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  ${brandHeader(title)}
  <div style="padding:24px 32px;">
    <p style="color:#333;font-size:14px;margin:0 0 16px;">Hola <strong>${guest?.name || "huesped"}</strong>, tu reserva en Wild Incas esta lista.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    ${rowLine("Reserva", res.code || "-")}
    ${rowLine("Habitacion", `N° ${res.roomId}` || "-")}
    ${rowLine("Entrada", res.checkIn || "-")}
    ${rowLine("Salida", res.checkOut || "-")}
    ${rowLine("Total", money(res.total), "#0a1b14")}
  </table>
  <div style="padding:20px 32px;">
    <p style="color:#666;font-size:13px;margin:0;">Presentate en recepcion el dia de tu llegada. Llevamos tu informacion registrada.</p>
  </div>
  ${brandFooter(idempotencyKey)}
</div></body></html>`
  };
}

function buildInvoiceEmail({ reservation, guest, invoice, idempotencyKey }) {
  const res = reservation || {};
  const inv = invoice || {};
  return {
    subject: `Factura final - ${res.code || "Wild Incas"}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f0;">
<div style="max-width:540px;margin:32px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  ${brandHeader("Factura de estadia")}
  <div style="padding:24px 32px;">
    <p style="color:#333;font-size:14px;margin:0 0 16px;">Hola <strong>${guest?.name || "huesped"}</strong>, gracias por hospedarte con nosotros. Aqui esta tu factura final.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    ${rowLine("Reserva", res.code || "-")}
    ${rowLine("Habitacion", `N° ${res.roomId}` || "-")}
    ${rowLine("Entrada", res.checkIn || "-")}
    ${rowLine("Salida", res.checkOut || "-")}
    ${rowLine("Total facturado", money(res.total), "#0a1b14")}
    ${rowLine("Pagado", money(res.totalPaid))}
    ${rowLine("Saldo final", money(Math.max(0, Number(res.total || 0) - Number(res.totalPaid || 0))), "#27ae60")}
  </table>
  <div style="padding:20px 32px;"><p style="color:#666;font-size:13px;margin:0;">Esperamos verte pronto. Gracias por elegir Wild Incas Backpackers Hostal.</p></div>
  ${brandFooter(idempotencyKey)}
</div></body></html>`
  };
}

function buildEmployeeEmail({ name, username, password, role, idempotencyKey }) {
  return {
    subject: "Acceso a SIMOT Wild Incas",
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f0;">
<div style="max-width:540px;margin:32px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  ${brandHeader("Cuenta de empleado creada")}
  <div style="padding:24px 32px;">
    <p style="color:#333;font-size:14px;margin:0 0 16px;">Hola <strong>${name || username}</strong>, tu cuenta fue creada.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    ${rowLine("Usuario", username || "-", "#4a7c6f")}
    ${rowLine("Contrasena temporal", password || "-", "#c0392b")}
    ${rowLine("Rol", role || "-")}
  </table>
  <div style="padding:20px 32px;">
    <a href="${process.env.APP_PUBLIC_URL || "https://fronted-wildincas-five.vercel.app"}" style="display:inline-block;background:#0a1b14;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">Ingresar al sistema</a>
  </div>
  ${brandFooter(idempotencyKey)}
</div></body></html>`
  };
}

// ── /events — main dispatcher ────────────────────────────────────────────────

app.post("/events", async (req, res) => {
  const { eventType, to, idempotencyKey, payload = {} } = req.body || {};
  if (!eventType || !to) return fail(res, "eventType y to son obligatorios", 422);

  // Idempotency check
  if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
    return ok(res, { ...idempotencyCache.get(idempotencyKey), idempotent: true });
  }

  let mailOptions;
  switch (eventType) {
    case "payment-confirmation": mailOptions = buildPaymentEmail({ ...payload, idempotencyKey }); break;
    case "check-in": mailOptions = buildCheckInEmail({ ...payload, idempotencyKey }); break;
    case "reservation-confirmed":
    case "reservation-modified": mailOptions = buildReservationEmail({ ...payload, idempotencyKey }, eventType); break;
    case "invoice-finalized": mailOptions = buildInvoiceEmail({ ...payload, idempotencyKey }); break;
    case "employee-welcome": mailOptions = buildEmployeeEmail({ ...payload, idempotencyKey }); break;
    default:
      return fail(res, `Tipo de evento desconocido: ${eventType}`, 400);
  }

  const record = { id: nanoid(8), eventType, to, idempotencyKey, status: "logged", sentAt: new Date().toISOString() };
  sent.unshift(record);

  const transport = createTransport();
  if (transport) {
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM || "Wild Incas <no-reply@wildincas.com>",
        to,
        subject: mailOptions.subject,
        html: mailOptions.html
      });
      record.status = "sent";
    } catch (err) {
      record.status = "error";
      record.error = err.message;
      console.error(`[notifications] Failed to send ${eventType} to ${to}: ${err.message}`);
    }
  }

  if (idempotencyKey) idempotencyCache.set(idempotencyKey, record);
  ok(res, record, 201);
});

app.get("/events", (_req, res) => ok(res, sent.slice(0, 100)));

// ── Legacy endpoints ─────────────────────────────────────────────────────────

app.post("/receipts", async (req, res) => {
  const receipt = { id: nanoid(8), to: req.body.to, guestName: req.body.guestName, amount: req.body.amount, concept: req.body.concept, status: "logged", createdAt: new Date().toISOString() };
  const transport = createTransport();
  if (transport) {
    try {
      await transport.sendMail({ from: process.env.MAIL_FROM || "SIMOT Wild Incas <no-reply@wildincas.local>", to: receipt.to, subject: `Comprobante SIMOT - ${receipt.concept}`, text: `Hola ${receipt.guestName}, se registra el comprobante por $${receipt.amount}. Concepto: ${receipt.concept}.` });
      receipt.status = "sent";
    } catch (_err) { receipt.status = "error"; }
  }
  sent.unshift(receipt);
  ok(res, receipt, 201);
});

app.get("/receipts", (_req, res) => ok(res, sent));

app.post("/campaigns", async (req, res) => {
  const { subject, body, guests = [] } = req.body;
  if (!subject || !body) return fail(res, "Asunto y cuerpo son obligatorios", 422);
  if (!Array.isArray(guests) || guests.length === 0) return fail(res, "Debes incluir al menos un destinatario", 422);
  const campaign = { id: nanoid(8), subject, body, total: guests.length, sent: 0, failed: 0, status: "sending", createdAt: new Date().toISOString(), results: [] };
  campaigns.unshift(campaign);
  (async () => {
    const transport = createTransport();
    for (const guest of guests) {
      const result = { guestId: guest.id, to: guest.email, guestName: guest.name, status: "logged" };
      if (transport && guest.email) {
        try {
          await transport.sendMail({ from: process.env.MAIL_FROM || "Wild Incas Hostal <no-reply@wildincas.local>", to: guest.email, subject, text: `Hola ${guest.name},\n\n${body}\n\n---\nWild Incas Backpackers Hostal | Cuenca, Ecuador\nSISTEMA SIMOT v2.0` });
          result.status = "sent"; campaign.sent++;
        } catch (_err) { result.status = "error"; campaign.failed++; }
      } else { result.status = "logged"; campaign.sent++; }
      campaign.results.push(result);
    }
    campaign.status = campaign.failed === campaign.total ? "failed" : "complete";
  })();
  ok(res, campaign, 201);
});

app.get("/campaigns", (_req, res) => ok(res, campaigns));
app.get("/campaigns/:id", (req, res) => {
  const campaign = campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return fail(res, "Campana no encontrada", 404);
  ok(res, campaign);
});

app.post("/email", async (req, res) => {
  const { to, subject, text, html } = req.body;
  const transport = createTransport();
  if (!transport) return ok(res, { status: "logged" });
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM || "SIMOT <no-reply@wildincas.local>", to, subject, text, html });
    ok(res, { status: "sent" });
  } catch (error) { fail(res, error.message, 500); }
});

app.get("/config", (_req, res) => ok(res, { configured: !!process.env.MAIL_HOST }));

listen();
