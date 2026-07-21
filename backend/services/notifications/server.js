import nodemailer from "nodemailer";
import { nanoid } from "nanoid";
import { createService, ok, fail } from "../../shared/service.js";

const port = Number(process.env.NOTIFICATIONS_PORT || 7107);
const { app, listen } = createService({ name: "notifications", port, description: "Comprobantes, campanas y notificaciones" });
const sent = [];
const campaigns = [];

function createTransport() {
  if (!process.env.MAIL_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined
  });
}

// --- Comprobantes individuales ---
app.post("/receipts", async (req, res) => {
  const receipt = {
    id: nanoid(8),
    to: req.body.to,
    guestName: req.body.guestName,
    amount: req.body.amount,
    concept: req.body.concept,
    status: "logged",
    createdAt: new Date().toISOString()
  };
  const transport = createTransport();
  if (transport) {
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM || "SIMOT Wild Incas <no-reply@wildincas.local>",
        to: receipt.to,
        subject: `Comprobante SIMOT - ${receipt.concept}`,
        text: `Hola ${receipt.guestName}, se registra el comprobante por $${receipt.amount}. Concepto: ${receipt.concept}.`
      });
      receipt.status = "sent";
    } catch (_err) {
      receipt.status = "error";
    }
  }
  sent.unshift(receipt);
  ok(res, receipt, 201);
});

app.get("/receipts", (_req, res) => ok(res, sent));

// --- Campanas masivas a huespedes ---
app.post("/campaigns", async (req, res) => {
  const { subject, body, guests = [] } = req.body;
  if (!subject || !body) return fail(res, "Asunto y cuerpo son obligatorios", 422);
  if (!Array.isArray(guests) || guests.length === 0) return fail(res, "Debes incluir al menos un destinatario", 422);

  const campaign = {
    id: nanoid(8),
    subject,
    body,
    total: guests.length,
    sent: 0,
    failed: 0,
    status: "sending",
    createdAt: new Date().toISOString(),
    results: []
  };
  campaigns.unshift(campaign);

  // Enviar en background, responder inmediatamente
  (async () => {
    const transport = createTransport();
    for (const guest of guests) {
      const result = { guestId: guest.id, to: guest.email, guestName: guest.name, status: "logged" };
      if (transport && guest.email) {
        try {
          await transport.sendMail({
            from: process.env.MAIL_FROM || "Wild Incas Hostal <no-reply@wildincas.local>",
            to: guest.email,
            subject,
            text: `Hola ${guest.name},\n\n${body}\n\n---\nWild Incas Backpackers Hostal | Cuenca, Ecuador\nSISTEMA SIMOT v2.0`
          });
          result.status = "sent";
          campaign.sent++;
        } catch (_err) {
          result.status = "error";
          campaign.failed++;
        }
      } else {
        result.status = "logged";
        campaign.sent++;
      }
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
    await transport.sendMail({
      from: process.env.MAIL_FROM || "SIMOT <no-reply@wildincas.local>",
      to,
      subject,
      text,
      html
    });
    ok(res, { status: "sent" });
  } catch (error) {
    fail(res, error.message, 500);
  }
});

app.get("/config", (_req, res) => {
  ok(res, { configured: !!process.env.MAIL_HOST });
});

listen();
