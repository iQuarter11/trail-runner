export const miles = m => (m / 1609.344).toFixed(2);
export function distance(a, b) {
  const rad = Math.PI / 180;
  const lat = (b[1] - a[1]) * rad, lng = (b[0] - a[0]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export const pathDistance = points => points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0);
export function offRoute(point, line) {
  if (!line.length) return Infinity;
  const k = Math.PI / 180 * 6371000, cos = Math.cos(point[1] * Math.PI / 180);
  const xy = p => [(p[0] - point[0]) * k * cos, (p[1] - point[1]) * k];
  if (line.length === 1) return distance(point, line[0]);
  return Math.min(...line.slice(1).map((p, i) => {
    const a = xy(line[i]), b = xy(p), dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(a[0] + t * dx, a[1] + t * dy);
  }));
}
export function weekStart(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d;
}
export function weeklyTotals(workouts, date = new Date()) {
  const start = weekStart(date), end = new Date(start); end.setDate(end.getDate() + 7);
  const runs = workouts.filter(run => new Date(run.date) >= start && new Date(run.date) < end);
  return { runs, distance: runs.reduce((s, r) => s + r.distance, 0), seconds: runs.reduce((s, r) => s + r.seconds, 0), gain: runs.length && runs.every(r => Number.isFinite(r.gain)) ? runs.reduce((s, r) => s + r.gain, 0) : null };
}
export function pace(meters, seconds) {
  if (meters < 1 || seconds <= 0) return '—';
  const s = Math.round(seconds / (meters / 1609.344)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function loadData(storage) {
  const raw = storage.getItem('trail-runner-data');
  if (!raw) return { routes: [], workouts: [] };
  const data = JSON.parse(raw);
  if (!Array.isArray(data.routes) || !Array.isArray(data.workouts)) throw new Error('Invalid saved data');
  return data;
}
export function saveData(storage, data) { storage.setItem('trail-runner-data', JSON.stringify(data)); }
export async function walkingRoute(points, token, signal) {
  if (!token.startsWith('pk.')) throw new Error('Add a public Mapbox token beginning with pk. in Settings.');
  if (points.length < 2 || points.length > 25) throw new Error('Choose 2–25 points.');
  const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${points.map(p => p.join(',')).join(';')}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(token)}`, { signal });
  if (!response.ok) throw new Error(`Route request failed (${response.status}). Check your token and connection.`);
  const data = await response.json(), route = data.routes?.[0];
  if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) throw new Error('No walking route found. Move points closer to mapped paths.');
  return { points: route.geometry.coordinates, distance: route.distance, mode: 'walking', steps: route.legs.flatMap(leg => leg.steps.map(step => step.maneuver.instruction)) };
}
