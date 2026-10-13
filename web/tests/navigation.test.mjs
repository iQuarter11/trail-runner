import test from "node:test";
import assert from "node:assert/strict";
import {
  routeProgress,
  nextDirection,
  directionSymbol,
  splitRoute,
  routeHeading,
  bearing,
  lookAhead,
  offPathState,
} from "../dist/navigation.js";
test("guidance advances at maneuvers rather than using total recorded mileage", () => {
  const route = {
    distance: 1000,
    maneuvers: [
      { offset: 0, instruction: "Start" },
      { offset: 200, instruction: "Turn left", modifier: "left" },
      { offset: 1000, instruction: "Arrive", type: "arrive" },
    ],
  };
  assert.equal(nextDirection(route, 50, 1000).instruction, "Turn left");
  assert.equal(nextDirection(route, 210, 1000).instruction, "Arrive");
  assert.equal(directionSymbol(nextDirection(route, 50, 1000)), "↰");
});
test("loop start does not match its finish or jump across far progress", () => {
  const line = [
    [0, 0],
    [0.001, 0],
    [0.001, 0.001],
    [0, 0.001],
    [0, 0],
  ];
  assert.equal(routeProgress([0, 0], line).progress, 0);
  const match = routeProgress([0.0005, 0], line);
  assert.ok(match.progress > 50 && match.progress < 60);
  assert.equal(
    routeProgress([1, 1], line, match.progress).progress,
    match.progress,
  );
});
test("legacy and manual routes do not fabricate turn instructions", () => {
  assert.equal(nextDirection({ distance: 1000 }, 100, 1000).remaining, null);
  assert.match(nextDirection({ distance: 1000 }).instruction, /map/);
});

test("shaping points do not announce arrival at the final destination", () => {
  const route = {
    distance: 1000,
    maneuvers: [
      { type: "arrive", offset: 200, instruction: "Arrive" },
      { type: "depart", offset: 200, instruction: "Start" },
      { type: "turn", offset: 400, instruction: "Turn right" },
      { type: "arrive", offset: 1000, instruction: "Arrive" },
    ],
  };
  assert.equal(nextDirection(route, 190, 1000).instruction, "Turn right");
});

test("completed and remaining paths share the exact progress point", () => {
  const line = [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
  ];
  const parts = splitRoute(line, 55);
  assert.ok(parts.point[0] > 0.0004 && parts.point[0] < 0.0006);
  assert.deepEqual(parts.completed.at(-1), parts.remaining[0]);
  assert.deepEqual(splitRoute(line, Infinity).remaining, []);
  assert.deepEqual(splitRoute(line, 0).point, line[0]);
});
test("heading follows the upcoming route and camera lookahead", () => {
  assert.ok(Math.abs(bearing([0, 0], [0.001, 0]) - 90) < 0.01);
  assert.ok(
    Math.abs(
      routeHeading(
        [
          [0, 0],
          [0, 0.001],
        ],
        20,
      ),
    ) < 0.01,
  );
  assert.ok(lookAhead([0, 0], 90)[0] > 0);
});
test("off-path alerts reject noisy fixes, persist, and clear after return", () => {
  let state = {};
  for (let i = 0; i < 2; i++) state = offPathState(state, 45, 10);
  assert.equal(state.active, false);
  state = offPathState(state, 45, 10);
  assert.equal(state.active, true);
  assert.equal(offPathState(state, 1, 100), state);
  state = offPathState(state, 30, 10);
  assert.equal(state.active, true);
  state = offPathState(state, 10, 10);
  assert.equal(state.active, true);
  state = offPathState(state, 10, 10);
  assert.equal(state.active, false);
});
