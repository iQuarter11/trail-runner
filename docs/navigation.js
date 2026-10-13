import { distance } from "./core.js?v=run-follow-6";
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
    (step) =>
      step.type !== "depart" &&
      (step.type !== "arrive" || step.offset >= route.distance - 15) &&
      step.offset > along - 10,
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

export function splitRoute(line, progress) {
  if (!line.length) return { completed: [], remaining: [], point: null };
  let offset = 0;
  const completed = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const length = distance(line[i - 1], line[i]);
    if (offset + length > Math.max(0, progress)) {
      const t = length ? Math.max(0, (progress - offset) / length) : 0;
      const point = line[i - 1].map((v, j) => v + t * (line[i][j] - v));
      return {
        completed: [...completed, point],
        remaining: [point, ...line.slice(i)],
        point,
      };
    }
    completed.push(line[i]);
    offset += length;
  }
  return { completed, remaining: [], point: line.at(-1) };
}
export function bearing(a, b) {
  const rad = Math.PI / 180,
    lat1 = a[1] * rad,
    lat2 = b[1] * rad,
    lng = (b[0] - a[0]) * rad;
  return (
    ((Math.atan2(
      Math.sin(lng) * Math.cos(lat2),
      Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng),
    ) *
      180) /
      Math.PI +
      360) %
    360
  );
}
export function routeHeading(line, progress) {
  const a = splitRoute(line, Math.max(0, progress - 5)).point,
    b = splitRoute(line, progress + 25).point;
  return a && b ? bearing(a, b) : 0;
}
export function lookAhead(point, heading, meters = 25) {
  const rad = Math.PI / 180,
    d = meters / 6371000,
    lat = point[1] * rad,
    lng = point[0] * rad,
    h = heading * rad;
  const lat2 = Math.asin(
    Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(h),
  );
  const lng2 =
    lng +
    Math.atan2(
      Math.sin(h) * Math.sin(d) * Math.cos(lat),
      Math.cos(d) - Math.sin(lat) * Math.sin(lat2),
    );
  return [lng2 / rad, lat2 / rad];
}
export function offPathState(state = {}, away, accuracy) {
  if (!Number.isFinite(accuracy) || accuracy > 40 || !Number.isFinite(away))
    return state;
  const outside = away > Math.max(35, accuracy * 1.5),
    inside = away < 20;
  const bad = outside ? (state.bad || 0) + 1 : 0,
    good = inside ? (state.good || 0) + 1 : 0;
  return { bad, good, active: state.active ? good < 2 : bad >= 3 };
}
