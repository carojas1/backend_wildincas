import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.DISCOVERY_PORT || 7000);
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
  res.json({ ok: true, data: [...services.values()] });
});

app.get("/services/:name", (req, res) => {
  const service = services.get(req.params.name);
  if (!service) return res.status(404).json({ ok: false, error: "service not registered" });
  res.json({ ok: true, data: service });
});

app.get("/health", (_req, res) => {
  res.json({ service: "discovery", status: "ok", registered: services.size });
});

app.listen(port, () => console.log(`discovery listening on ${port}`));
