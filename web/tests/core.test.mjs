import test from "node:test";
import assert from "node:assert/strict";
import {
  distance,
  pathDistance,
  offRoute,
  weekStart,
  weeklyTotals,
  pace,
  loadData,
  saveData,
  walkingRoute,
} from "../dist/core.js";
test("distance and off-route projection use metres", () => {
  assert.equal(distance([0, 0], [0, 0]), 0);
  assert.ok(Math.abs(distance([0, 0], [0, 1]) - 111195) < 10);
  assert.ok(
    offRoute(
      [0.005, 0],
      [
        [0, 0],
        [0.01, 0],
      ],
    ) < 1,
  );
  assert.ok(
    offRoute(
      [0.005, 0.001],
      [
        [0, 0],
        [0.01, 0],
      ],
    ) > 100,
  );
  assert.ok(
    pathDistance([
      [0, 0],
      [0, 0.5],
      [0, 1],
    ]) > 111000,
  );
});
test("weekly totals include Monday and exclude next Monday; pace is weighted", () => {
  const monday = new Date("2026-10-12T12:00:00");
  assert.equal(weekStart(monday).getDay(), 1);
  const runs = [
    { date: "2026-10-12T00:00:00", distance: 1609.344, seconds: 600, gain: 50 },
    {
      date: "2026-10-18T23:59:00",
      distance: 3218.688,
      seconds: 1200,
      gain: 100,
    },
    { date: "2026-10-19T00:00:00", distance: 900, seconds: 400, gain: 20 },
  ];
  const stats = weeklyTotals(runs, monday);
  assert.equal(stats.runs.length, 2);
  assert.equal(stats.gain, 150);
  assert.equal(pace(stats.distance, stats.seconds), "10:00");
  runs[0].gain = null;
  assert.equal(weeklyTotals(runs, monday).gain, null);
});
test("storage failure leaves caller data intact, corrupt data is reported", () => {
  const data = { routes: [], workouts: [] };
  assert.throws(
    () =>
      saveData(
        {
          setItem() {
            throw new Error("Quota");
          },
        },
        data,
      ),
    /Quota/,
  );
  assert.deepEqual(data, { routes: [], workouts: [] });
  assert.throws(() => loadData({ getItem: () => "broken" }));
  assert.deepEqual(loadData({ getItem: () => null }), data);
});
test("walking directions use the walking profile and reject unavailable routes", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(url, /mapbox\/walking/);
      return {
        ok: true,
        json: async () => ({
          code: "Ok",
          routes: [
            {
              distance: 100,
              geometry: {
                coordinates: [
                  [0, 0],
                  [0, 1],
                ],
              },
              legs: [{ steps: [{ maneuver: { instruction: "Turn left" } }] }],
            },
          ],
        }),
      };
    };
    const result = await walkingRoute(
      [
        [0, 0],
        [0, 1],
      ],
      "pk.test",
    );
    assert.deepEqual(result.steps, ["Turn left"]);
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ code: "NoRoute" }),
    });
    await assert.rejects(
      walkingRoute(
        [
          [0, 0],
          [0, 1],
        ],
        "pk.test",
      ),
      /No walking route/,
    );
    await assert.rejects(
      walkingRoute(
        [
          [0, 0],
          [0, 1],
        ],
        "sk.secret",
      ),
      /public Mapbox/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("default walking service returns full path geometry without a token", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(
        url,
        /routing.openstreetmap.de\/routed-foot\/route\/v1\/foot/,
      );
      assert.match(url, /overview=full/);
      assert.match(url, /radiuses=100;100/);
      return {
        ok: true,
        json: async () => ({
          code: "Ok",
          waypoints: [{ location: [0, 0] }, { location: [0.01, 0] }],
          routes: [
            {
              distance: 2000,
              geometry: {
                coordinates: [
                  [0, 0],
                  [0.005, 0.005],
                  [0.01, 0],
                ],
              },
              legs: [
                {
                  steps: [
                    {
                      maneuver: { type: "turn", modifier: "left" },
                      name: "Park path",
                    },
                  ],
                },
              ],
            },
          ],
        }),
      };
    };
    const route = await walkingRoute([
      [0, 0],
      [0.01, 0],
    ]);
    assert.equal(route.points.length, 3);
    assert.equal(route.distance, 2000);
    assert.deepEqual(route.snapped, [
      [0, 0],
      [0.01, 0],
    ]);
    assert.equal(route.steps[0], "Turn left on Park path");
    assert.equal(route.mode, "walking");
  } finally {
    globalThis.fetch = original;
  }
});
test("walking failures never return a straight-line fallback", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ code: "NoSegment" }),
    });
    await assert.rejects(
      walkingRoute([
        [0, 0],
        [0.01, 0],
      ]),
      /No walking route/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
