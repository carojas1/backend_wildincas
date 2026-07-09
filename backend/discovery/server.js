import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.DISCOVERY_PORT || 7000);
const host = process.env.DISCOVERY_HOST || "127.0.0.1";
const ttlMs = Number(process.env.DISCOVERY_TTL_MS || 90000);
const services = new Map();

app.use(cors());
app.use(express.json());

app.post("/register", (req, res) => {
  const { name, url, description = "" } = req.body;
  if (!name || !url) {
    return res.status(400).json({ ok: false, error: "name and url are required" });
  }
  services.set(name, { name, url, description, lastHeartbeat: new Date().toISOString() });
  res.json({ ok: true, data: services.get(name) });
});

app.get("/services", (_req, res) => {
  res.json({ ok: true, data: [...services.values()].map(withStatus) });
});

app.get("/services/:name", (req, res) => {
  const service = services.get(req.params.name);
  if (!service) return res.status(404).json({ ok: false, error: "service not registered" });
  const current = withStatus(service);
  if (current.status !== "healthy") return res.status(503).json({ ok: false, error: "service heartbeat expired", data: current });
  res.json({ ok: true, data: current });
});

app.get("/health", (_req, res) => {
  const registered = [...services.values()].map(withStatus);
  res.json({ service: "discovery", status: "ok", registered: registered.length, healthy: registered.filter((item) => item.status === "healthy").length });
});

function withStatus(service) {
  const ageMs = Date.now() - new Date(service.lastHeartbeat).getTime();
  return { ...service, ageMs, status: ageMs <= ttlMs ? "healthy" : "stale" };
}

app.listen(port, host, () => console.log(`discovery listening on ${host}:${port}`));
