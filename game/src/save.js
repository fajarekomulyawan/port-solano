// save.js — localStorage persistence for Port Solano.
// A save is taken at mission boundaries (and whenever the player asks via
// the pause menu): money, health, weapon, mission progress and position.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};
  var KEY = 'port-solano-save-v1';

  var Save = {};

  Save.has = function () {
    try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
  };

  Save.save = function () {
    if (!PS.Player || !PS.Missions) return false;
    var p = PS.Player;
    var data = {
      money: p.money,
      health: p.health,
      hasPistol: p.hasPistol,
      ammo: p.ammo,
      mission: PS.Missions.current,
      x: Math.round(p.x),
      y: Math.round(p.y),
      playSeconds: Math.round(PS.state ? PS.state.playSeconds : 0)
    };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  };

  Save.load = function () {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data.money !== 'number') return null;
      return data;
    } catch (e) {
      return null;
    }
  };

  Save.clear = function () {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
  };

  PS.Save = Save;
})();
