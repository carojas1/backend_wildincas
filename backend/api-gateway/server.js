import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT || process.env.GATEWAY_PORT || 8080);
const discoveryUrl = process.env.DISCOVERY_URL || "http://127.0.0.1:7000";

const routes = {
  "/api/auth": "auth",
  "/api/rooms": "rooms",
  "/api/guests": "guests",
  "/api/operations": "operations",
  "/api/finance": "finance",
  "/api/employees": "employees",
  "/api/notifications": "notifications"
};

const cache = new Map();

async function resolveService(name) {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.at < 15000) return cached.url;
  const response = await fetch(`${discoveryUrl}/services/${name}`);
  if (!response.ok) throw new Error(`${name} is not registered`);
  const payload = await response.json();
  cache.set(name, { url: payload.data.url, at: Date.now() });
  return payload.data.url;
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  const response = await fetch(`${discoveryUrl}/services`).catch(() => null);
  const payload = response?.ok ? await response.json() : { data: [] };
  res.json({ service: "api-gateway", status: "ok", discovery: discoveryUrl, services: payload.data });
});

for (const [path, serviceName] of Object.entries(routes)) {
  app.use(path, async (req, res) => {
    try {
      const target = await resolveService(serviceName);
      const upstreamPath = req.originalUrl.replace(path, "") || "/";
      const headers = { "Content-Type": "application/json" };
      if (req.headers.authorization) headers.Authorization = req.headers.authorization;
      const response = await fetch(`${target}${upstreamPath}`, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body || {})
      });
      for (const header of ["content-disposition", "content-type"]) {
        const value = response.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.status(response.status).send(buffer);
    } catch (error) {
      res.status(503).json({ ok: false, error: { message: error.message } });
    }
  });
}

app.listen(port, () => console.log(`api-gateway listening on ${port}`));
