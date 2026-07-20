const standardAmenities = ["Bano privado", "Agua caliente", "Wi-Fi", "Smart TV", "Kit de aseo personal"];

export const rooms = [
  { id: "1", floor: 1, type: "Habitacion matrimonial", bedConfiguration: "1 cama matrimonial", capacity: 2, rate: 35, status: "available", amenities: standardAmenities, notes: "" },
  { id: "2", floor: 1, type: "Habitacion matrimonial", bedConfiguration: "1 cama matrimonial", capacity: 2, rate: 35, status: "available", amenities: standardAmenities, notes: "" },
  { id: "3", floor: 1, type: "Habitacion matrimonial", bedConfiguration: "1 cama matrimonial", capacity: 2, rate: 35, status: "available", amenities: standardAmenities, notes: "" },
  { id: "4", floor: 2, type: "Habitacion doble", bedConfiguration: "2 camas individuales", capacity: 2, rate: 45, status: "available", amenities: standardAmenities, notes: "" },
  { id: "5", floor: 2, type: "Habitacion matrimonial", bedConfiguration: "1 cama matrimonial", capacity: 2, rate: 35, status: "available", amenities: standardAmenities, notes: "" },
  { id: "6", floor: 2, type: "Habitacion doble", bedConfiguration: "2 camas individuales", capacity: 2, rate: 45, status: "available", amenities: standardAmenities, notes: "" },
  { id: "7", floor: 3, type: "Habitacion grupal / compartida", bedConfiguration: "6 camas individuales", capacity: 6, rate: 15, status: "available", amenities: standardAmenities, notes: "" }
];

export const guests = [];

export const employees = [
  { id: "e1", name: "Apolo", role: "Administrador", shift: "Flexible", hours: "Horario flexible", phone: "", email: "admin@wildincas.com", username: "apolo", modules: ["all"], since: "2026-01-01", status: "active" }
];

export const incidents = [];

export const movements = [];

export const shifts = [];
