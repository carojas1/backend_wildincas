import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT || process.env.GATEWAY_PORT || 8080);
const host = process.env.GATEWAY_HOST || "0.0.0.0";
const discoveryUrl = process.env.DISCOVERY_URL || "http://127.0.0.1:7000";
const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 12000);
const resolutionTimeoutMs = Number(process.env.SERVICE_RESOLUTION_TIMEOUT_MS || 20000);
const resolutionRetryMs = Number(process.env.SERVICE_RESOLUTION_RETRY_MS || 350);

const routes = {
  "/api/auth": "auth",
  "/api/rooms": "rooms",
  "/api/guests": "guests",
  "/api/reservations": "reservations",
  "/api/operations": "operations",
  "/api/finance": "finance",
  "/api/employees": "employees",
  "/api/notifications": "notifications"
};

const routeModules = {
  auth: "users",
  rooms: "rooms",
  guests: "guests",
  reservations: "reservations",
  operations: "logbook",
  finance: "income",
  employees: "employees",
  notifications: "notifications"
};

const cache = new Map();
const resolutions = new Map();
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

async function resolveService(name) {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.at < 15000) return cached.url;
  if (resolutions.has(name)) return resolutions.get(name);

  const resolution = resolveWithRetry(name).finally(() => resolutions.delete(name));
  resolutions.set(name, resolution);
  return resolution;
}

async function resolveWithRetry(name) {
  const deadline = Date.now() + resolutionTimeoutMs;
  let lastMessage = `${name} is not registered`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${discoveryUrl}/services/${name}`);
      if (response.ok) {
        const payload = await response.json();
        const url = payload.data?.url;
        if (url) {
          cache.set(name, { url, at: Date.now() });
          return url;
        }
      } else {
        lastMessage = `${name} is not registered`;
      }
    } catch (error) {
      lastMessage = error.message;
    }

    if (String(process.env.LOCAL_SERVICE_FALLBACK || "true") !== "false" && localPorts[name]) {
      const url = `http://127.0.0.1:${localPorts[name]}`;
      if (await isHealthy(url)) {
        cache.set(name, { url, at: Date.now() });
        return url;
      }
    }

    await delay(resolutionRetryMs);
  }

  throw new Error(`${name} is not registered (${lastMessage})`);
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

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  const response = await fetch(`${discoveryUrl}/services`).catch(() => null);
  const payload = response?.ok ? await response.json() : { data: [] };
  res.json({ service: "api-gateway", status: "ok", discovery: discoveryUrl, services: payload.data });
});

for (const [path, serviceName] of Object.entries(routes)) {
  app.use(path, async (req, res) => {
    try {
      const authorization = await authorize(req, path, serviceName);
      if (!authorization.allowed) {
        return res.status(authorization.status).json({ ok: false, error: { message: authorization.message } });
      }
      const target = await resolveService(serviceName);
      const upstreamPath = req.originalUrl.replace(path, "") || "/";
      const headers = { "Content-Type": "application/json" };
      if (req.headers.authorization) headers.Authorization = req.headers.authorization;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
      const response = await fetch(`${target}${upstreamPath}`, {
        method: req.method,
        headers,
        signal: controller.signal,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body || {})
      }).finally(() => clearTimeout(timeout));
      for (const header of ["content-disposition", "content-type"]) {
        const value = response.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.status(response.status).send(buffer);
    } catch (error) {
      const timeout = error.name === "AbortError";
      res.status(timeout ? 504 : 503).json({ ok: false, error: { message: timeout ? `${serviceName} timeout` : error.message, service: serviceName } });
    }
  });
}

async function authorize(req, path, serviceName) {
  const subpath = req.originalUrl.replace(path, "").split("?")[0] || "/";
  if (serviceName === "auth" && req.method === "POST" && subpath === "/login") return { allowed: true };
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { allowed: false, status: 401, message: "Debes iniciar sesion" };
  try {
    const authUrl = await resolveService("auth");
    const response = await fetch(`${authUrl}/me`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) return { allowed: false, status: 401, message: "La sesion ya no es valida" };
    const user = payload.data;
    const modules = Array.isArray(user.modules) ? user.modules : [];
    if (modules.includes("all")) return { allowed: true, user };
    if (serviceName === "auth" && ["/me", "/logout"].includes(subpath)) return { allowed: true, user };
    const required = requiredModule(serviceName, subpath);
    return modules.includes(required)
      ? { allowed: true, user }
      : { allowed: false, status: 403, message: `Tu rol no permite usar el modulo ${required}` };
  } catch (error) {
    return { allowed: false, status: 503, message: `No se pudo validar el acceso: ${error.message}` };
  }
}

function requiredModule(serviceName, subpath) {
  if (serviceName === "finance") {
    if (subpath.startsWith("/shifts") || subpath === "/daily") return "cash";
    if (subpath.startsWith("/invoices") || subpath.startsWith("/payments")) return "billing";
  }
  if (serviceName === "operations" && subpath.startsWith("/checklist")) return "cash";
  if (serviceName === "auth") return "users";
  return routeModules[serviceName];
}

app.listen(port, host, () => console.log(`api-gateway listening on ${host}:${port}`));
