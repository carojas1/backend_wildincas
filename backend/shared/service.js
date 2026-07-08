import cors from "cors";
import express from "express";

const DISCOVERY_URL = process.env.DISCOVERY_URL || "http://127.0.0.1:7000";

export function createService({ name, port, description }) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ service: name, status: "ok", uptime: process.uptime() });
  });

  app.get("/meta", (_req, res) => {
    res.json({ name, description, port });
  });

  app.use((req, res, next) => {
    req.context = { service: name, now: new Date().toISOString() };
    next();
  });

  function listen() {
    app.listen(port, () => {
      console.log(`${name} listening on ${port}`);
      registerService(name, port, description);
      setInterval(() => registerService(name, port, description), 25000).unref();
    });
  }

  return { app, listen };
}

export async function registerService(name, port, description = "") {
  try {
    const serviceUrl = process.env.SERVICE_URL || `http://127.0.0.1:${port}`;
    await fetch(`${DISCOVERY_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        url: serviceUrl,
        registeredAt: new Date().toISOString()
      })
    });
  } catch (error) {
    console.warn(`${name} could not register in discovery: ${error.message}`);
  }
}

export function ok(res, data, status = 200) {
  res.status(status).json({ ok: true, data });
}

export function fail(res, message, status = 400, details = null) {
  res.status(status).json({ ok: false, error: { message, details } });
}

export function parseMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}
