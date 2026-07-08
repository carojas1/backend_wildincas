import nodemailer from "nodemailer";
import { nanoid } from "nanoid";
import { createService, ok } from "../../shared/service.js";

const port = Number(process.env.NOTIFICATIONS_PORT || 7107);
const { app, listen } = createService({ name: "notifications", port, description: "Envio de comprobantes y notificaciones" });
const sent = [];

function createTransport() {
  if (!process.env.MAIL_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined
  });
}

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
    await transport.sendMail({
      from: process.env.MAIL_FROM || "SIMOT Wild Incas <no-reply@wildincas.local>",
      to: receipt.to,
      subject: `Comprobante SIMOT - ${receipt.concept}`,
      text: `Hola ${receipt.guestName}, se registra el comprobante por $${receipt.amount}. Concepto: ${receipt.concept}.`
    });
    receipt.status = "sent";
  }
  sent.unshift(receipt);
  ok(res, receipt, 201);
});

app.get("/receipts", (_req, res) => ok(res, sent));

listen();
