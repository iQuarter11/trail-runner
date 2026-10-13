import { distance } from "./core.js?v=run-view-5";
export function routeProgress(point, line, previous = 0) {
  let offset = 0,
    best = { progress: previous, away: Infinity };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      length = distance(a, b),
      cos = Math.cos((point[1] * Math.PI) / 180);
    const ax = (a[0] - point[0]) * cos,
      ay = a[1] - point[1],
      dx = (b[0] - a[0]) * cos,
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    const progress = offset + t * length,
      away = distance(point, [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1]),
      ]);
    if (
      progress >= previous - 25 &&
      progress <= previous + 350 &&
      away < best.away - 0.5
    )
      best = { progress, away };
    offset += length;
  }
  return {
    progress: best.away <= 60 ? Math.max(previous, best.progress) : previous,
    away: best.away,
    length: offset,
  };
}
export function nextDirection(
  route,
  progress = 0,
  geometryLength = route.distance,
) {
  const along = geometryLength
    ? (progress * route.distance) / geometryLength
    : 0;
  const next = route.maneuvers?.find(
    (step) => step.type !== "depart" && (step.type !== "arrive" || step.offset >= route.distance - 15) && step.offset > along - 10,
  );
  if (next) return { ...next, remaining: Math.max(0, next.offset - along) };
  if (route.maneuvers?.length)
    return {
      instruction: "Continue to the finish",
      type: "arrive",
      modifier: "",
      remaining: Math.max(0, route.distance - along),
    };
  return {
    instruction: "Follow your route on the map",
    type: "continue",
    modifier: "",
    remaining: null,
  };
}
export function directionSymbol(step) {
  if (step?.type === "arrive") return "⚑";
  if (step?.modifier?.includes("uturn")) return "↶";
  if (step?.modifier?.includes("left")) return "↰";
  if (step?.modifier?.includes("right")) return "↱";
  return "↑";
}
