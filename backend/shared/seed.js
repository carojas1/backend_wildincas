export const rooms = [
  { id: "101", floor: 1, type: "Dormitorio Compartido", capacity: 6, rate: 15, status: "cleaning", lastCleaned: "2026-05-26", notes: "" },
  { id: "102", floor: 1, type: "Dormitorio Compartido", capacity: 4, rate: 15, status: "occupied", lastCleaned: "2026-05-22", guestId: "g1" },
  { id: "201", floor: 2, type: "Habitacion Privada", capacity: 2, rate: 35, status: "cleaning", lastCleaned: "2026-05-25", notes: "Revisar grifo del bano" },
  { id: "202", floor: 2, type: "Habitacion Privada", capacity: 2, rate: 35, status: "available", lastCleaned: "2026-05-26" },
  { id: "203", floor: 2, type: "Suite Doble", capacity: 2, rate: 55, status: "occupied", lastCleaned: "2026-05-24", guestId: "g2", notes: "Solicito desayuno temprano" },
  { id: "301", floor: 3, type: "Suite Doble", capacity: 2, rate: 55, status: "available", lastCleaned: "2026-05-26" },
  { id: "302", floor: 3, type: "Habitacion Privada", capacity: 2, rate: 35, status: "cleaning", lastCleaned: "2026-05-25" },
  { id: "401", floor: 4, type: "Suite Premium", capacity: 2, rate: 95, status: "occupied", lastCleaned: "2026-05-26", guestId: "g4" }
];

export const guests = [
  { id: "g1", name: "Maria Lopez", country: "Colombiana", documentType: "Cedula", documentNumber: "1234567890", email: "maria@example.com", roomId: "102", roomType: "Dormitorio Compartido", checkIn: "2026-05-22", checkOut: "2026-05-27", exitTime: "11:00", paid: 75, total: 75, status: "active" },
  { id: "g2", name: "Carlos Ruiz", country: "Estadounidense", documentType: "Pasaporte", documentNumber: "US8765432", email: "carlos@example.com", roomId: "203", roomType: "Suite Doble", checkIn: "2026-05-24", checkOut: "2026-05-28", exitTime: "12:00", paid: 110, total: 220, status: "active" },
  { id: "g3", name: "Ana Garcia", country: "Espanola", documentType: "Pasaporte", documentNumber: "ES123456", email: "ana@example.com", roomId: null, roomType: null, checkIn: "2026-05-18", checkOut: "2026-05-22", exitTime: "10:00", paid: 140, total: 140, status: "checkout" },
  { id: "g4", name: "James Wilson", country: "Britanico", documentType: "Pasaporte", documentNumber: "GB123456", email: "james@example.com", roomId: "401", roomType: "Suite Premium", checkIn: "2026-05-26", checkOut: "2026-05-30", exitTime: "11:00", paid: 380, total: 380, status: "active" }
];

export const employees = [
  { id: "e1", name: "Valentina Mora", role: "Recepcionista", shift: "Manana", hours: "6:00 - 14:00", phone: "+57 310 234 5678", email: "vmora@wildincas.com", username: "vmora", modules: ["habitaciones", "huespedes", "bitacora"], since: "2025-01-15", status: "active" },
  { id: "e2", name: "Laura Sanchez", role: "Recepcionista", shift: "Tarde", hours: "14:00 - 22:00", phone: "+57 312 456 7890", email: "lsanchez@wildincas.com", username: "lsanchez", modules: ["caja", "ingresos", "habitaciones"], since: "2025-06-01", status: "active", note: "Estudiante de turismo" },
  { id: "e3", name: "Apolo Administrador", role: "Administrador", shift: "Noche", hours: "22:00 - 6:00", phone: "+593 99 555 0101", email: "admin@wildincas.com", username: "apolo", modules: ["all"], since: "2024-12-01", status: "active" }
];

export const incidents = [
  { id: "n1", title: "Revisar grifo del bano", description: "Habitacion 201 reporta goteo leve.", category: "mantenimiento", status: "open", priority: "media", createdAt: "2026-05-27T08:10:00.000Z", createdBy: "Valentina Mora" },
  { id: "n2", title: "Huesped solicita desayuno temprano", description: "Carlos Ruiz requiere salida con desayuno 06:30.", category: "huesped", status: "open", priority: "baja", createdAt: "2026-05-27T10:30:00.000Z", createdBy: "Laura Sanchez" }
];

export const movements = [
  { id: "m1", type: "income", concept: "Check-in Hab. 401 - James Wilson", date: "2026-05-29", method: "Efectivo", amount: 380, guestId: "g4" },
  { id: "m2", type: "expense", concept: "Utiles de oficina y papeleria", date: "2026-05-26", method: "Efectivo", amount: 25 },
  { id: "m3", type: "expense", concept: "Mantenimiento bano Hab. 201", date: "2026-05-25", method: "Efectivo", amount: 30 },
  { id: "m4", type: "income", concept: "Adelanto 50% Hab. 203", date: "2026-05-24", method: "Tarjeta", amount: 110, guestId: "g2" },
  { id: "m5", type: "income", concept: "Check-in Hab. 102", date: "2026-05-22", method: "Efectivo", amount: 75, guestId: "g1" },
  { id: "m6", type: "expense", concept: "Suministros de limpieza", date: "2026-05-20", method: "Efectivo", amount: 45 }
];

export const shifts = [
  { id: "s1", date: "2026-05-25", shift: "Tarde", responsible: "Laura Sanchez", initial: 120, closed: 268, expected: 273, difference: -5, status: "closed" },
  { id: "s2", date: "2026-05-25", shift: "Manana", responsible: "Valentina Mora", initial: 100, closed: 235, expected: 235, difference: 0, status: "closed" }
];
