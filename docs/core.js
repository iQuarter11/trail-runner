export const miles = (m) => (m / 1609.344).toFixed(2);
export function distance(a, b) {
  const rad = Math.PI / 180;
  const lat = (b[1] - a[1]) * rad,
    lng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export const pathDistance = (points) =>
  points
    .slice(1)
    .reduce((sum, point, i) => sum + distance(points[i], point), 0);
export function offRoute(point, line) {
  if (!line.length) return Infinity;
  const k = (Math.PI / 180) * 6371000,
    cos = Math.cos((point[1] * Math.PI) / 180);
  const xy = (p) => [(p[0] - point[0]) * k * cos, (p[1] - point[1]) * k];
  if (line.length === 1) return distance(point, line[0]);
  return Math.min(
    ...line.slice(1).map((p, i) => {
      const a = xy(line[i]),
        b = xy(p),
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)),
      );
      return Math.hypot(a[0] + t * dx, a[1] + t * dy);
    }),
  );
}
export function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function weeklyTotals(workouts, date = new Date()) {
  const start = weekStart(date),
    end = new Date(start);
  end.setDate(end.getDate() + 7);
  const runs = workouts.filter(
    (run) => new Date(run.date) >= start && new Date(run.date) < end,
  );
  return {
    runs,
    distance: runs.reduce((s, r) => s + r.distance, 0),
    seconds: runs.reduce((s, r) => s + r.seconds, 0),
    gain:
      runs.length && runs.every((r) => Number.isFinite(r.gain))
        ? runs.reduce((s, r) => s + r.gain, 0)
        : null,
  };
}
export function pace(meters, seconds) {
  if (meters < 1 || seconds <= 0) return "—";
  const s = Math.round(seconds / (meters / 1609.344));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function loadData(storage) {
  const raw = storage.getItem("trail-runner-data");
  if (!raw) return { routes: [], workouts: [] };
  const data = JSON.parse(raw);
  if (!Array.isArray(data.routes) || !Array.isArray(data.workouts))
    throw new Error("Invalid saved data");
  return data;
}
export function saveData(storage, data) {
  storage.setItem("trail-runner-data", JSON.stringify(data));
}
let lastRoutingRequest = 0;
export async function walkingRoute(points, token = "", signal) {
  if (token && !token.startsWith("pk."))
    throw new Error("Use a public Mapbox token beginning with pk.");
  if (points.length < 2 || points.length > 25)
    throw new Error("Choose 2–25 points.");
  const coordinates = points.map((p) => p.join(",")).join(";");
  const mapbox = !!token;
  const url = mapbox
    ? `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&overview=full&steps=true&radiuses=${points.map(() => 100).join(";")}&access_token=${encodeURIComponent(token)}`
    : `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordinates}?geometries=geojson&overview=full&steps=true&radiuses=${points.map(() => 100).join(";")}`;
  if (!mapbox) {
    const delay = Math.max(0, 1100 - (Date.now() - lastRoutingRequest));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    signal?.throwIfAborted();
    lastRoutingRequest = Date.now();
  }
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (data.code === "NoSegment" || data.code === "NoRoute")
    throw new Error(
      "No walking route found. Place each point within 100 m of a mapped path, then retry.",
    );
  if (!response.ok)
    throw new Error(
      `Walking routing unavailable (${response.status}). Try again shortly; no straight-line route was substituted.`,
    );
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route?.geometry?.coordinates?.length)
    throw new Error(
      "No walking route found. Place each point within 100 m of a mapped path, then retry.",
    );
  return {
    maneuvers: (() => {
      let offset = 0;
      return route.legs.flatMap((leg) =>
        leg.steps.map((step) => {
          const result = {
            instruction:
              step.maneuver.instruction ||
              `${step.maneuver.type === "depart" ? "Start" : step.maneuver.type === "arrive" ? "Arrive at your destination" : step.maneuver.type === "turn" ? "Turn" : "Continue"}${step.maneuver.modifier ? " " + step.maneuver.modifier : ""}${step.name ? " on " + step.name : ""}`,
            modifier: step.maneuver.modifier || "",
            type: step.maneuver.type,
            location: step.maneuver.location,
            offset,
          };
          offset += step.distance || 0;
          return result;
        }),
      );
    })(),
    points: route.geometry.coordinates,
    snapped: data.waypoints?.map((point) => point.location),
    distance: route.distance,
    mode: "walking",
    provider: mapbox ? "Mapbox" : "FOSSGIS / OSRM",
    steps: route.legs.flatMap((leg) =>
      leg.steps.map((step) => {
        if (step.maneuver.instruction) return step.maneuver.instruction;
        const type = step.maneuver.type;
        const action =
          type === "depart"
            ? "Start"
            : type === "arrive"
              ? "Arrive at your destination"
              : type === "turn"
                ? "Turn"
                : "Continue";
        return `${action}${step.maneuver.modifier ? " " + step.maneuver.modifier : ""}${step.name ? " on " + step.name : ""}`;
      }),
    ),
  };
}
