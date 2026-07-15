import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { loadState, saveState } from "../../shared/cloudStore.js";
import { createService, fail, ok } from "../../shared/service.js";

const port = Number(process.env.AUTH_PORT || 7101);
const { app, listen } = createService({ name: "auth", port, description: "Autenticacion y usuarios efimeros" });

const roles = [
  { id: "admin", name: "Administrador", modules: ["all"], description: "Configuracion, usuarios, operacion, caja, facturacion y reportes." },
  { id: "gerencia", name: "Gerencia", modules: ["dashboard", "rooms", "reservations", "guests", "cleaning", "logbook", "cash", "billing", "income", "employees", "notifications"], description: "Supervision operativa y financiera sin administrar credenciales." },
  { id: "recepcion", name: "Recepcion", modules: ["dashboard", "rooms", "reservations", "guests", "cleaning", "logbook", "billing", "notifications"], description: "Reservas, huespedes, check-in, consumos, checkout y comprobantes." },
  { id: "caja", name: "Caja", modules: ["dashboard", "reservations", "cash", "billing", "income", "notifications"], description: "Pagos, facturas, apertura y cierre de caja." },
  { id: "contabilidad", name: "Contabilidad", modules: ["dashboard", "cash", "billing", "income", "notifications"], description: "Ingresos, gastos, saldos, cierres y exportacion Excel." },
  { id: "limpieza", name: "Limpieza", modules: ["rooms", "cleaning", "logbook"], description: "Limpieza, disponibilidad fisica y tareas asignadas." },
  { id: "mantenimiento", name: "Mantenimiento", modules: ["rooms", "cleaning", "logbook"], description: "Incidencias tecnicas y habitaciones fuera de servicio." },
  { id: "huesped", name: "Huesped", modules: ["portal"], description: "Consulta exclusiva de reservas y facturas propias." }
];

let users = [
  { id: "u1", username: "apolo", password: "admin123", name: "Apolo", email: "admin@wildincas.com", roleId: "admin", role: "Administrador", modules: ["all"], status: "active" },
  { id: "u2", username: "vmora", password: "recep123", name: "Valentina Mora", email: "vmora@wildincas.com", roleId: "recepcion", role: "Recepcion", modules: ["dashboard", "rooms", "guests", "cash", "income", "notifications"], status: "active" }
];
users = await loadState("auth_users", users);

function persistUsers() {
  saveState("auth_users", users);
}

const sessions = new Map();

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find((item) => item.username === username && verifyPassword(item, password) && item.status === "active");
  if (!user) return fail(res, "Credenciales invalidas", 401);
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId: user.id, createdAt: new Date().toISOString() });
  ok(res, { token, user: sanitize(user) });
});

app.get("/me", (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const session = sessions.get(token);
  if (!session) return fail(res, "Sesion no encontrada", 401);
  const user = users.find((item) => item.id === session.userId);
  ok(res, sanitize(user));
});

app.post("/logout", (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  sessions.delete(token);
  ok(res, { loggedOut: true });
});

app.get("/roles", (_req, res) => ok(res, roles));

app.get("/users", (_req, res) => {
  ok(res, users.map(sanitize));
});

app.post("/users", (req, res) => {
  const { username, password, name, email, roleId = "recepcion" } = req.body;
  if (!username || !password || !name) return fail(res, "Nombre, usuario y contrasena son obligatorios", 422);
  if (users.some((item) => item.username === username)) return fail(res, "El usuario ya existe", 409);
  const role = roles.find((item) => item.id === roleId) || roles.find((item) => item.id === "recepcion");
  const user = {
    id: nanoid(8),
    username,
    passwordHash: hashPassword(password),
    name,
    email,
    roleId: role.id,
    role: role.name,
    modules: Array.isArray(req.body.modules) && req.body.modules.length ? req.body.modules : role.modules,
    status: "active",
    createdAt: new Date().toISOString()
  };
  users.unshift(user);
  persistUsers();
  ok(res, sanitize(user), 201);
});

app.patch("/users/:id", (req, res) => {
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return fail(res, "Usuario no encontrado", 404);
  if (req.body.roleId) {
    const role = roles.find((item) => item.id === req.body.roleId);
    if (!role) return fail(res, "Rol no encontrado", 404);
    user.roleId = role.id;
    user.role = role.name;
    user.modules = role.modules;
  }
  if (Array.isArray(req.body.modules)) user.modules = req.body.modules;
  for (const field of ["name", "email", "status"]) {
    if (req.body[field] !== undefined) user[field] = req.body[field];
  }
  persistUsers();
  ok(res, sanitize(user));
});

function sanitize(user) {
  const { password, passwordHash, ...safe } = user;
  return safe;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(user, password) {
  if (user.passwordHash) {
    const [salt, expected] = user.passwordHash.split(":");
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(String(password), salt, 64);
    const target = Buffer.from(expected, "hex");
    return actual.length === target.length && crypto.timingSafeEqual(actual, target);
  }
  return user.password === password;
}

listen();
