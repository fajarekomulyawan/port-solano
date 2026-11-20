// pedestrians.js — the people of Port Solano. They stroll the sidewalks,
// the plaza, the park and the beach, and they run screaming when the
// shooting starts or a car mounts the kerb. They are also witnesses:
// crimes committed in front of them are what really feeds the wanted level.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};
  var City = PS.City;

  var SHIRTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#ffffff', '#8ac926', '#ff9f1c', '#6a4c93'];
  var SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

  var Peds = { list: [] };

  function makePed(x, y) {
    return {
      x: x, y: y,
      angle: PS.randRange(0, PS.TAU),
      speed: PS.randRange(48, 74),
      state: 'walk',           // walk | flee | down
      tx: x, ty: y,
      shirt: PS.pick(SHIRTS),
      skin: PS.pick(SKIN),
      phase: PS.randRange(0, 6),
      fleeT: 0, fleeFromX: 0, fleeFromY: 0,
      downT: 0,
      retargetT: PS.randRange(0, 2)
    };
  }

  Peds.spawnInitial = function () {
    var start = City.landmarks.playerStart;
    for (var i = 0; i < 22; i++) {
      var pt = City.walkPointNear(start.x, start.y, 120, 800);
      Peds.list.push(makePed(pt.x, pt.y));
    }
  };

  // Something loud or violent happened at (x, y): nearby peds run from it.
  Peds.frighten = function (x, y, radius) {
    for (var i = 0; i < Peds.list.length; i++) {
      var p = Peds.list[i];
      if (p.state === 'down') continue;
      if (PS.dist(x, y, p.x, p.y) < radius) {
        p.state = 'flee';
        p.fleeT = PS.randRange(2.2, 3.8);
        p.fleeFromX = x; p.fleeFromY = y;
      }
    }
  };

  Peds.knockDown = function (ped, byPlayer) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = 20;
    if (byPlayer && PS.Police) PS.Police.reportCrime('assault', ped.x, ped.y);
    if (PS.Audio) PS.Audio.punch();
  };

  var spawnT = 0;
  Peds.update = function (dt) {
    var player = PS.Player;
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.7;
      if (Peds.list.length < 24 && player) {
        var pt = City.walkPointNear(player.x, player.y, 520, 860);
        Peds.list.push(makePed(pt.x, pt.y));
      }
    }
    for (var i = Peds.list.length - 1; i >= 0; i--) {
      var p = Peds.list[i];
      if (player && PS.dist(player.x, player.y, p.x, p.y) > 1150) { Peds.list.splice(i, 1); continue; }
      if (p.state === 'down') {
        p.downT -= dt;
        if (p.downT <= 0) Peds.list.splice(i, 1);
        continue;
      }
      var vx = 0, vy = 0, sp = p.speed;
      if (p.state === 'flee') {
        p.fleeT -= dt;
        var away = PS.angleTo(p.fleeFromX, p.fleeFromY, p.x, p.y);
        // Add a little sideways jitter so crowds do not move as one blob.
        away += Math.sin(p.phase * 7) * 0.35;
        vx = Math.cos(away); vy = Math.sin(away);
        sp = 158;
        p.angle = PS.angleLerp(p.angle, away, 0.25);
        if (p.fleeT <= 0) { p.state = 'walk'; p.retargetT = 0; }
      } else {
        p.retargetT -= dt;
        var d = PS.dist(p.x, p.y, p.tx, p.ty);
        if (d < 14 || p.retargetT <= 0) {
          var nt = City.walkPointNear(p.x, p.y, 40, 300);
          p.tx = nt.x; p.ty = nt.y;
          p.retargetT = PS.randRange(4, 9);
          d = PS.dist(p.x, p.y, p.tx, p.ty);
        }
        if (d > 4) {
          vx = (p.tx - p.x) / d; vy = (p.ty - p.y) / d;
          p.angle = PS.angleLerp(p.angle, Math.atan2(vy, vx), 0.18);
        }
      }
      var nx = p.x + vx * sp * dt, ny = p.y + vy * sp * dt;
      if (!City.pointBlocked(nx, ny)) { p.x = nx; p.y = ny; }
      else if (!City.pointBlocked(nx, p.y)) { p.x = nx; }
      else if (!City.pointBlocked(p.x, ny)) { p.y = ny; }
      else if (p.state === 'walk') { p.retargetT = 0; }
      p.phase += dt * (sp > 100 ? 13 : 8);
    }
  };

  Peds.draw = function (g, camX, camY, vw, vh) {
    for (var i = 0; i < Peds.list.length; i++) {
      var p = Peds.list[i];
      if (p.x < camX - 30 || p.x > camX + vw + 30 || p.y < camY - 30 || p.y > camY + vh + 30) continue;
      drawPed(g, p);
    }
  };

  function drawPed(g, p) {
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(40,30,10,0.25)';
    g.beginPath(); g.ellipse(2, 4, 8, 4.5, 0, 0, PS.TAU); g.fill();
    if (p.state === 'down') {
      g.rotate(p.angle + Math.PI / 2);
      g.fillStyle = p.shirt;
      g.beginPath(); g.ellipse(0, 0, 13, 6, 0, 0, PS.TAU); g.fill();
      g.fillStyle = p.skin;
      g.beginPath(); g.arc(-13, 0, 4.6, 0, PS.TAU); g.fill();
      g.restore();
      return;
    }
    g.rotate(p.angle);
    // Legs (walk cycle).
    var sw = Math.sin(p.phase) * 4.5;
    g.fillStyle = '#2f3542';
    g.fillRect(-2 + sw * 0.4, -6, 6, 4);
    g.fillRect(-2 - sw * 0.4, 2, 6, 4);
    // Body.
    g.fillStyle = p.shirt;
    g.beginPath(); g.ellipse(0, 0, 8.5, 6.5, 0, 0, PS.TAU); g.fill();
    // Arms.
    g.fillStyle = p.shirt;
    g.fillRect(-3, -10, 6, 3.4);
    g.fillRect(-3, 6.6, 6, 3.4);
    // Head.
    g.fillStyle = p.skin;
    g.beginPath(); g.arc(1.5, 0, 4.6, 0, PS.TAU); g.fill();
    g.restore();
    if (p.state === 'flee') {
      g.fillStyle = '#ffffff';
      g.font = 'bold 13px Arial';
      g.textAlign = 'center';
      g.fillText('!', p.x, p.y - 16);
    }
  }

  PS.Peds = Peds;
})();
