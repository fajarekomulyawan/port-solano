// rng.js — seeded randomness and small math helpers for Port Solano.
// Everything in the game that needs chance goes through here so that the
// screenshot scenes (?shot=...&seed=1) render deterministically.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};

  PS.TAU = Math.PI * 2;

  // mulberry32: tiny, fast, seedable PRNG.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  PS.mulberry32 = mulberry32;

  // The live game RNG. main.js reseeds it for shot scenes.
  var live = mulberry32(20261120);
  PS.seedRandom = function (seed) { live = mulberry32(seed >>> 0); };
  PS.random = function () { return live(); };
  PS.randRange = function (a, b) { return a + live() * (b - a); };
  PS.randInt = function (a, b) { return a + Math.floor(live() * (b - a + 1)); };
  PS.pick = function (arr) { return arr[Math.floor(live() * arr.length) % arr.length]; };
  PS.chance = function (p) { return live() < p; };

  // ---- math helpers -------------------------------------------------------
  PS.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  PS.lerp = function (a, b, t) { return a + (b - a) * t; };
  PS.dist = function (x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  };
  PS.dist2 = function (x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  };
  PS.angleTo = function (x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); };
  // Smallest signed difference from a to b, in (-PI, PI].
  PS.angleDiff = function (a, b) {
    var d = (b - a) % PS.TAU;
    if (d > Math.PI) d -= PS.TAU;
    if (d < -Math.PI) d += PS.TAU;
    return d;
  };
  PS.angleLerp = function (a, b, t) { return a + PS.angleDiff(a, b) * t; };
  // Move an angle toward a target by at most maxStep.
  PS.turnToward = function (a, target, maxStep) {
    var d = PS.angleDiff(a, target);
    if (Math.abs(d) <= maxStep) return target;
    return a + Math.sign(d) * maxStep;
  };
  // Point-in-rotated-rect test used for cheap oriented collision checks.
  PS.pointInCarRect = function (px, py, car, pad) {
    var dx = px - car.x, dy = py - car.y;
    var c = Math.cos(-car.angle), s = Math.sin(-car.angle);
    var lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= car.w / 2 + pad && Math.abs(ly) <= car.h / 2 + pad;
  };
})();
