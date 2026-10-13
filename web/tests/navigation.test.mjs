import test from "node:test";
import assert from "node:assert/strict";
import {
  routeProgress,
  nextDirection,
  directionSymbol,
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
