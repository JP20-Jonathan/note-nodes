export const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const pad2 = (n) => String(n).padStart(2, "0");

export function monthKey(year, month) { return `${year}-${pad2(month)}`; }
export function addMonthKey(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return monthKey(ny, nm);
}
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const name = MONTH_NAMES[m - 1] || "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}
export function mondayOf(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const offset = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}
export function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}
export function shortDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}
// Hora real de Medellín (America/Bogota), sin importar el huso del navegador.
export function todayInMedellin() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}
