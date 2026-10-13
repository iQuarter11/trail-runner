import { locatePosition, locationErrorMessage } from "./location.js?v=location-fix-4";
import {
  miles,
  distance,
  pathDistance,
  offRoute,
  weekStart,
  weeklyTotals,
  pace,
  loadData,
  saveData,
  walkingRoute,
} from "./core.js?v=location-fix-4";
const $ = (id) => document.getElementById(id);
let data = { routes: [], workouts: [] },
  storageOK = true,
  token = "",
  points = [],
  preview = null,
  controller = null,
  routeTimer = null,
  week = new Date(),
  run = null,
  watch = null,
  map,
  layer,
  runLayer,
  locationMarker,
  tileErrors = 0;
function status(message, error = false) {
  $("status").textContent = message;
  $("status").hidden = !message;
  $("status").className = error ? "error" : "";
}
try {
  data = loadData(localStorage);
  token = localStorage.getItem("trail-runner-mapbox") || "";
} catch {
  storageOK = false;
  status(
    "Saved data could not be opened. Saving is disabled to protect existing data. Check browser storage settings.",
    true,
  );
}
function persist(next) {
  if (!storageOK) {
    status(
      "Browser storage is unavailable. Your data has not been saved.",
      true,
    );
    return false;
  }
  try {
    saveData(localStorage, next);
    data = next;
    return true;
  } catch {
    status(
      "Could not save. Browser storage may be full or blocked. Export a backup and try again.",
      true,
    );
    return false;
  }
}
function element(tag, text = "", className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(label, handler, kind = "ghost") {
  const node = element("button", label, kind);
  node.addEventListener("click", handler);
  return node;
}
function switchTab(tab) {
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== tab;
  });
  document
    .querySelectorAll("[data-tab]")
    .forEach((node) =>
      node.setAttribute("aria-selected", String(node.dataset.tab === tab)),
    );
  if (tab === "plan") requestAnimationFrame(() => map?.invalidateSize());
  if (tab === "routes") renderRoutes();
  if (tab === "workouts") renderWorkouts();
}
document
  .querySelectorAll("[data-tab]")
  .forEach((node) =>
    node.addEventListener("click", () => switchTab(node.dataset.tab)),
  );
document
  .querySelectorAll("[data-go]")
  .forEach((node) =>
    node.addEventListener("click", () => switchTab(node.dataset.go)),
  );
document
  .querySelectorAll("[data-close]")
  .forEach((node) =>
    node.addEventListener("click", () => $(node.dataset.close).close()),
  );
if (window.L) {
  map = L.map("map", { zoomControl: false, doubleClickZoom: false }).setView(
    [40.782, -73.965],
    14,
  );
  L.control.zoom({ position: "topright" }).addTo(map);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  tiles.on("tileerror", () => {
    tileErrors++;
    if (tileErrors === 3)
      status(
        "Some map tiles could not load. Check your internet connection.",
        true,
      );
  });
  layer = L.layerGroup().addTo(map);
  runLayer = L.layerGroup().addTo(map);
  map.on("click", (event) => {
    if (run) return;
    if (points.length >= 25)
      return status(
        "Use up to 25 shaping points. Undo a point to add another.",
        true,
      );
    edit([...points, [event.latlng.lng, event.latlng.lat]]);
  });
} else {
  $("map-error").hidden = false;
  status("Map library could not load. Check your connection and reload.", true);
}
function cancelRequest() {
  clearTimeout(routeTimer);
  controller?.abort();
  controller = null;
  $("preview").textContent = "Find walking route →";
}
function edit(next) {
  cancelRequest();
  points = next;
  preview = null;
  if (storageOK) status("");
  draw();
  if (points.length >= 2 && $("route-mode").value === "walking")
    routeTimer = setTimeout(generateRoute, 1200);
}
function currentRoute() {
  return (
    preview ||
    ($("route-mode").value === "trace" && points.length >= 2
      ? {
          points: [...points],
          distance: pathDistance(points),
          mode: "trace",
          steps: [],
        }
      : null)
  );
}
function draw() {
  const route = currentRoute();
  layer?.clearLayers();
  if (map && points.length) {
    if (route || $("route-mode").value === "trace")
      L.polyline(
        (route?.points || points).map((p) => [p[1], p[0]]),
        { color: "#17694b", weight: 5, dashArray: route ? undefined : "8 8" },
      ).addTo(layer);
    (preview?.snapped || points).forEach((p, i) =>
      L.marker([p[1], p[0]], {
        icon: L.divIcon({
          className: "point-icon",
          html: String(i + 1),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(layer),
    );
  }
  $("point-count").textContent = points.length;
  $("route-distance").textContent = miles(route?.distance || 0);
  $("undo").disabled = !points.length || !!run;
  $("clear").disabled = !points.length || !!run;
  $("preview").hidden = $("route-mode").value === "trace";
  $("preview").disabled = points.length < 2 || !!controller || !!run;
  $("save-route").disabled =
    !route || !$("route-name").value.trim() || !storageOK || !!run;
  $("start-run").disabled =
    !route || !!run || !storageOK || !navigator.geolocation;
  $("route-mode").disabled = !!run;
  $("route-description").textContent =
    $("route-mode").value === "trace"
      ? "Trace mode connects your points directly. Add points along the path to measure it."
      : preview
        ? `Route follows mapped paths via ${preview.provider || "walking routing"}. Points snap within 100 m. Review the chosen paths.`
        : "Add 2–25 points near paths. Your route follows the mapped pedestrian network automatically; roads may be included.";
  $("directions").hidden = !route?.steps.length;
  $("steps").replaceChildren(
    ...(route?.steps || []).map((step) => element("li", step)),
  );
}
$("undo").onclick = () => edit(points.slice(0, -1));
$("clear").onclick = () => {
  edit([]);
  $("route-name").value = "";
  draw();
};
$("route-name").oninput = draw;
$("route-mode").onchange = () => edit(points);
async function generateRoute() {
  cancelRequest();
  const request = new AbortController();
  controller = request;
  const timeout = setTimeout(
    () => request.abort(new Error("Request timed out. Try again.")),
    20000,
  );
  draw();
  $("preview").textContent = "Finding your route…";
  status("");
  try {
    const route = await walkingRoute(points, token, request.signal);
    if (controller === request) {
      preview = route;
      status("Walking route ready. Give it a name to save.");
    }
  } catch (error) {
    if (controller === request)
      status(error.message || "Could not find a route.", true);
  } finally {
    clearTimeout(timeout);
    if (controller === request) {
      controller = null;
      $("preview").textContent = "Find walking route →";
      draw();
    }
  }
}
$("preview").onclick = generateRoute;
$("save-route").onclick = () => {
  const route = currentRoute(),
    name = $("route-name").value.trim();
  if (!route || !name) return;
  const next = {
    ...data,
    routes: [
      {
        ...route,
        waypoints: [...points],
        name,
        id: crypto.randomUUID(),
        created: new Date().toISOString(),
      },
      ...data.routes,
    ],
  };
  if (persist(next)) {
    status("Route saved in this browser.");
    switchTab("routes");
  }
};
function empty(title, description, label, handler) {
  const node = element("div", "", "empty");
  node.append(element("h3", title), element("p", description));
  if (handler) node.append(button(label, handler, "primary"));
  return node;
}
function renderRoutes() {
  $("route-list").replaceChildren();
  if (!data.routes.length)
    $("route-list").append(
      empty(
        "An open map. Endless possibilities.",
        "Your saved routes will live here. Start with somewhere you love.",
        "Plan a route →",
        () => switchTab("plan"),
      ),
    );
  for (const route of data.routes) {
    const card = element("article", "", "card"),
      actions = element("div", "", "row");
    card.append(
      element(
        "p",
        route.mode === "walking" ? "ROADS & TRAILS" : "HAND-TRACED ROUTE",
        "eyebrow",
      ),
      element("h3", route.name),
    );
    const metric = element("p", miles(route.distance), "big");
    metric.append(element("small", " miles"));
    card.append(
      metric,
      element(
        "p",
        `${route.waypoints.length} shaping points · ${new Date(route.created).toLocaleDateString()}`,
        "note",
      ),
    );
    actions.append(
      button(
        "View route ↗",
        () => {
          if (run)
            return status(
              "Finish your active run before changing routes.",
              true,
            );
          cancelRequest();
          points = route.waypoints;
          preview = route;
          $("route-mode").value = route.mode;
          $("route-name").value = route.name;
          switchTab("plan");
          draw();
          requestAnimationFrame(() => {
            map?.invalidateSize();
            map?.fitBounds(
              route.points.map((p) => [p[1], p[0]]),
              { padding: [35, 35] },
            );
          });
        },
        "primary",
      ),
      button("Delete", () => {
        if (
          confirm(`Delete “${route.name}”?`) &&
          persist({
            ...data,
            routes: data.routes.filter((r) => r.id !== route.id),
          })
        )
          renderRoutes();
      }),
    );
    card.append(actions);
    $("route-list").append(card);
  }
}
$("locate").onclick = async () => {
  const button = $("locate");
  button.disabled = true; button.textContent = "Locating…";
  $("location-help").hidden = true;
  status("Finding your location. Allow the browser's location prompt if it appears.");
  try {
    const position = await locatePosition(navigator.geolocation, window.isSecureContext);
    const p = [position.coords.latitude, position.coords.longitude];
    map?.setView(p, position.coords.accuracy > 500 ? 12 : 15);
    if (map) {
      locationMarker?.remove();
      locationMarker = L.circleMarker(p, { radius: 7, color: "#fff", weight: 3, fillColor: "#347bb6", fillOpacity: 1 }).addTo(map);
    }
    status(`Location found (approximately ±${Math.round(position.coords.accuracy)} m). Tap the map to plan your route.`);
  } catch (error) {
    status(locationErrorMessage(error), true);
    $("location-help").hidden = false;
  } finally { button.disabled = false; button.textContent = "◎ Find me"; }
};
$("copy-app-link").onclick = async () => {
  try { await navigator.clipboard.writeText("https://iquarter11.github.io/trail-runner/"); status("Link copied. Paste it into Safari or Chrome, then tap Find me."); }
  catch { status("Open this address in Safari or Chrome: https://iquarter11.github.io/trail-runner/"); }
};
$("settings-open").onclick = () => {
  $("mapbox-token").value = token;
  $("settings").showModal();
};
$("settings-form").onsubmit = (event) => {
  event.preventDefault();
  const next = $("mapbox-token").value.trim();
  if (next && !next.startsWith("pk.")) {
    alert("Use a public token starting with pk., not a secret token.");
    return;
  }
  try {
    localStorage.setItem("trail-runner-mapbox", next);
    token = next;
    $("settings").close();
    status(
      next
        ? "Mapbox connected. Mapped-path routing will use your token."
        : "Token removed. Mapped-path routing will use the public walking service.",
    );
  } catch {
    alert("Could not store settings. Check browser storage permissions.");
  }
};
function dateInput(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}
$("log-open").onclick = () => {
  $("workout-date").value = dateInput();
  $("log").showModal();
};
$("log-form").onsubmit = (event) => {
  event.preventDefault();
  const meters = Number($("workout-miles").value) * 1609.344,
    seconds = Number($("workout-minutes").value) * 60,
    gainInput = $("workout-gain").value;
  const date = new Date(`${$("workout-date").value}T12:00:00`);
  if (
    !Number.isFinite(meters) ||
    meters <= 0 ||
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    isNaN(date)
  )
    return;
  const workout = {
    id: crypto.randomUUID(),
    name: $("workout-name").value.trim(),
    date: date.toISOString(),
    distance: meters,
    seconds,
    gain: gainInput === "" ? null : Number(gainInput),
    points: [],
  };
  if (persist({ ...data, workouts: [workout, ...data.workouts] })) {
    week = date;
    $("log").close();
    $("log-form").reset();
    renderWorkouts();
    status("Workout saved.");
  }
};
function renderWorkouts() {
  const stats = weeklyTotals(data.workouts, week),
    start = weekStart(week),
    end = new Date(start);
  end.setDate(end.getDate() + 6);
  $("week-label").textContent =
    `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  $("weekly-stats").replaceChildren(
    ...[
      [stats.runs.length, "RUNS"],
      [miles(stats.distance), "MILES"],
      [
        stats.gain === null ? "—" : Math.round(stats.gain),
        "ELEVATION GAIN · FT",
      ],
      [pace(stats.distance, stats.seconds), "AVERAGE PACE / MI"],
    ].map(([value, label]) => {
      const node = element("div");
      node.append(element("strong", value), element("span", label));
      return node;
    }),
  );
  const prior = new Date(start);
  prior.setDate(prior.getDate() - 7);
  const previous = weeklyTotals(data.workouts, prior);
  $("weekly-compare").textContent = previous.distance
    ? `${Math.abs((stats.distance / previous.distance - 1) * 100).toFixed(0)}% ${stats.distance >= previous.distance ? "more" : "less"} mileage than the prior week · Weeks start Monday.`
    : "No mileage in the prior week to compare. Weeks start Monday.";
  $("workout-list").replaceChildren();
  if (!stats.runs.length)
    $("workout-list").append(
      empty(
        "Every run starts somewhere.",
        "No workouts this week. Record a run or log one you’ve already completed.",
      ),
    );
  for (const workout of [...stats.runs].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  )) {
    const card = element("article", "", "card");
    card.append(
      element(
        "p",
        new Date(workout.date)
          .toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })
          .toUpperCase(),
        "eyebrow",
      ),
      element("h3", workout.name),
    );
    const metric = element("p", miles(workout.distance), "big");
    metric.append(element("small", " miles"));
    card.append(
      metric,
      element(
        "p",
        `${Math.round(workout.seconds / 60)} min · ${pace(workout.distance, workout.seconds)} /mi · ${workout.gain === null ? "elevation not recorded" : workout.gain + " ft gain"}`,
        "note",
      ),
    );
    card.append(
      button("Delete workout", () => {
        if (
          confirm(`Delete “${workout.name}”?`) &&
          persist({
            ...data,
            workouts: data.workouts.filter((r) => r.id !== workout.id),
          })
        )
          renderWorkouts();
      }),
    );
    $("workout-list").append(card);
  }
}
$("previous-week").onclick = () => {
  week.setDate(week.getDate() - 7);
  renderWorkouts();
};
$("next-week").onclick = () => {
  week.setDate(week.getDate() + 7);
  renderWorkouts();
};
$("export").onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, ...data }, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `trail-runner-${dateInput()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function elapsed() {
  return run
    ? run.seconds + (run.paused ? 0 : (Date.now() - run.segmentStart) / 1000)
    : 0;
}
function checkpoint() {
  if (run) {
    try {
      localStorage.setItem(
        "trail-runner-active",
        JSON.stringify({
          ...run,
          seconds: elapsed(),
          paused: true,
          segmentStart: null,
          last: null,
        }),
      );
    } catch {
      status(
        "Active run could not be backed up. Finish and export your workout soon.",
        true,
      );
    }
  }
}
function clearWatch() {
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
}
function watchRun() {
  watch = navigator.geolocation.watchPosition(
    (position) => {
      if (!run || run.paused) return;
      const coords = position.coords,
        p = [coords.longitude, coords.latitude];
      if (coords.accuracy > 40) {
        $("run-guidance").textContent =
          "GPS accuracy is low. Waiting for a better signal…";
        return;
      }
      const stamp = position.timestamp;
      if (run.last) {
        const dt = (stamp - run.last.stamp) / 1000,
          segment = distance(run.last.point, p);
        if (dt <= 0 || dt > 30 || segment / dt > 10) {
          run.last = { point: p, stamp };
          $("run-guidance").textContent =
            "GPS gap or jump detected; distance across this gap was skipped.";
          return;
        }
        if (segment < 3) return;
        run.distance += segment;
      }
      run.last = { point: p, stamp };
      run.points.push(p);
      runLayer?.clearLayers();
      if (map) {
        L.polyline(
          run.points.map((p) => [p[1], p[0]]),
          { color: "#d37d3e", weight: 4 },
        ).addTo(runLayer);
        locationMarker?.remove();
        locationMarker = L.circleMarker([p[1], p[0]], {
          radius: 7,
          color: "#fff",
          weight: 3,
          fillColor: "#347bb6",
          fillOpacity: 1,
        }).addTo(map);
      }
      const away = offRoute(p, run.route.points);
      run.offCount = away > 60 ? (run.offCount || 0) + 1 : 0;
      $("run-guidance").textContent =
        run.offCount >= 3
          ? `Off route · about ${Math.round(away)} m from your planned line.`
          : `GPS recording · ±${Math.round(coords.accuracy)} m accuracy`;
      if (run.offCount >= 3 && Date.now() - (run.lastAlert || 0) > 60000) {
        run.lastAlert = Date.now();
        status("You appear to be off your planned route. Check the map.", true);
      }
      checkpoint();
      updateRun();
    },
    (error) => {
      if (!run) return;
      pauseRun();
      status(
        `${locationErrorMessage(error)} Your run is paused.`,
        true,
      );
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
}
function updateRun() {
  if (!run) {
    $("run-panel").hidden = true;
    return;
  }
  $("run-panel").hidden = false;
  const seconds = Math.floor(elapsed());
  $("run-distance").textContent = `${miles(run.distance)} mi`;
  $("run-time").textContent =
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  $("run-pace").textContent = pace(run.distance, seconds);
  $("run-state").textContent = run.paused
    ? "PAUSED · RESUME WHEN READY"
    : "RECORDING · KEEP THIS PAGE OPEN";
  $("pause-run").textContent = run.paused ? "Resume" : "Pause";
}
function pauseRun() {
  if (!run || run.paused) return;
  run.seconds = elapsed();
  run.paused = true;
  run.last = null;
  clearWatch();
  checkpoint();
  updateRun();
}
$("start-run").onclick = () => {
  if (!navigator.geolocation || !currentRoute() || run) return;
  run = {
    name: $("route-name").value.trim() || "Outdoor run",
    date: new Date().toISOString(),
    route: currentRoute(),
    points: [],
    distance: 0,
    seconds: 0,
    paused: false,
    segmentStart: Date.now(),
    last: null,
  };
  draw();
  updateRun();
  checkpoint();
  watchRun();
  status(
    "Recording starts with a good GPS fix. Keep this page visible and your phone unlocked.",
  );
  $("run-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
};
$("pause-run").onclick = () => {
  if (!run) return;
  if (!run.paused) pauseRun();
  else {
    if (document.hidden) return;
    run.paused = false;
    run.segmentStart = Date.now();
    run.last = null;
    watchRun();
    updateRun();
  }
};
$("finish-run").onclick = () => {
  if (!run || !confirm("Finish this run and save it to your workout log?"))
    return;
  pauseRun();
  const workout = {
    id: crypto.randomUUID(),
    name: run.name,
    date: run.date,
    points: run.points,
    distance: run.distance,
    seconds: Math.round(run.seconds),
    gain: null,
  };
  if (!persist({ ...data, workouts: [workout, ...data.workouts] })) return;
  try {
    localStorage.removeItem("trail-runner-active");
  } catch {
    /* saved workout remains durable */
  }
  run = null;
  runLayer?.clearLayers();
  updateRun();
  draw();
  week = new Date(workout.date);
  switchTab("workouts");
  status("Run saved. Elevation is not measured in this version.");
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && run && !run.paused) {
    pauseRun();
    status(
      "Your run paused because the app became hidden. Resume when you return.",
    );
  }
});
window.addEventListener("pagehide", () => {
  if (run) pauseRun();
});
setInterval(() => {
  if (run && !run.paused) {
    updateRun();
    checkpoint();
  }
}, 1000);
try {
  const active = JSON.parse(
    localStorage.getItem("trail-runner-active") || "null",
  );
  if (active?.route && Array.isArray(active.points)) {
    run = { ...active, paused: true, last: null };
    points =
      active.route.points.length <= 25
        ? active.route.points
        : [active.route.points[0], active.route.points.at(-1)];
    preview = active.route;
    $("route-mode").value = active.route.mode;
    $("route-name").value = active.name;
    updateRun();
    status("Recovered your unfinished run. It is paused; resume or finish it.");
    if (map && active.points.length)
      L.polyline(
        active.points.map((p) => [p[1], p[0]]),
        { color: "#d37d3e", weight: 4 },
      ).addTo(runLayer);
  }
} catch {
  status("An unfinished run could not be recovered.", true);
}
draw();
renderRoutes();
renderWorkouts();
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {
    /* online app works without an offline shell */
  });
