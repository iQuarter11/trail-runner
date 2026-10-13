export type Coordinate = [number, number];
export type PlannedRoute = {
  id: string;
  name: string;
  createdAt: string;
  waypoints: Coordinate[];
  geometry: { type: 'LineString'; coordinates: Coordinate[] };
  distanceMeters: number;
  instructions: string[];
};
export const miles = (meters: number) => (meters / 1609.344).toFixed(2);
export async function fetchRoute(points: Coordinate[], token: string, signal?: AbortSignal): Promise<Omit<PlannedRoute, 'id' | 'name' | 'createdAt'>> {
  if (points.length < 2 || points.length > 25) throw new Error('Choose between 2 and 25 points.');
  const coordinates = points.map(point => point.join(',')).join(';');
  const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(token)}`, { signal });
  if (!response.ok) throw new Error(`Routing failed (${response.status}). Check your connection and Mapbox token.`);
  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route || route.geometry?.coordinates?.length < 2) throw new Error('No walking route found. Try points closer to mapped roads or trails.');
  return { waypoints: points, geometry: route.geometry, distanceMeters: route.distance, instructions: route.legs.flatMap((leg: { steps: { maneuver: { instruction: string } }[] }) => leg.steps.map(step => step.maneuver.instruction)) };
}
