import cors from "cors";
import express from "express";

const DISCOVERY_URL = process.env.DISCOVERY_URL || "http://127.0.0.1:7000";
const serviceCache = new Map();
const serviceResolutions = new Map();
const resolutionTimeoutMs = Number(process.env.SERVICE_RESOLUTION_TIMEOUT_MS || 20000);
const resolutionRetryMs = Number(process.env.SERVICE_RESOLUTION_RETRY_MS || 350);
const localPorts = {
  auth: process.env.AUTH_PORT || 7101,
  rooms: process.env.ROOMS_PORT || 7102,
  guests: process.env.GUESTS_PORT || 7103,
  operations: process.env.OPERATIONS_PORT || 7104,
  finance: process.env.FINANCE_PORT || 7105,
  employees: process.env.EMPLOYEES_PORT || 7106,
  notifications: process.env.NOTIFICATIONS_PORT || 7107,
  reservations: process.env.RESERVATIONS_PORT || 7108
};

export function createService({ name, port, description }) {
  const app = express();
  const host = process.env.SERVICE_BIND_HOST || "127.0.0.1";
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
    app.listen(port, host, () => {
      console.log(`${name} listening on ${host}:${port}`);
      registerUntilAvailable(name, port, description);
      setInterval(() => registerService(name, port, description), 25000).unref();
    });
  }

  return { app, listen };
}

export async function registerService(name, port, description = "") {
  try {
    const serviceUrl = process.env.SERVICE_URL || `http://127.0.0.1:${port}`;
    const response = await fetch(`${DISCOVERY_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        url: serviceUrl,
        registeredAt: new Date().toISOString()
      })
    });
    if (!response.ok) throw new Error(`discovery respondio ${response.status}`);
    return true;
  } catch (error) {
    console.warn(`${name} could not register in discovery: ${error.message}`);
    return false;
  }
}

async function registerUntilAvailable(name, port, description) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await registerService(name, port, description)) return;
    await delay(500);
  }
  console.warn(`${name} will continue registration through the heartbeat interval`);
}

export async function resolveService(name) {
  const cached = serviceCache.get(name);
  if (cached && Date.now() - cached.at < 10000) return cached.url;
  if (serviceResolutions.has(name)) return serviceResolutions.get(name);

  const resolution = resolveWithRetry(name).finally(() => serviceResolutions.delete(name));
  serviceResolutions.set(name, resolution);
  return resolution;
}

async function resolveWithRetry(name) {
  const deadline = Date.now() + resolutionTimeoutMs;
  let lastMessage = `El servicio ${name} no esta registrado`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${DISCOVERY_URL}/services/${name}`);
      if (response.ok) {
        const payload = await response.json();
        const url = payload.data?.url;
        if (url) {
          serviceCache.set(name, { url, at: Date.now() });
          return url;
        }
      } else {
        lastMessage = `El servicio ${name} no esta registrado`;
      }
    } catch (error) {
      lastMessage = error.message;
    }

    if (String(process.env.LOCAL_SERVICE_FALLBACK || "true") !== "false" && localPorts[name]) {
      const url = `http://127.0.0.1:${localPorts[name]}`;
      if (await isHealthy(url)) {
        serviceCache.set(name, { url, at: Date.now() });
        return url;
      }
    }

    await delay(resolutionRetryMs);
  }

  throw new Error(`El servicio ${name} no esta disponible (${lastMessage})`);
}

async function isHealthy(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function serviceRequest(name, path, options = {}) {
  const target = await resolveService(name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 8000));
  try {
    const response = await fetch(`${target}${path}`, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error?.message || `${name} respondio ${response.status}`);
    }
    return payload.data;
  } finally {
    clearTimeout(timeout);
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
