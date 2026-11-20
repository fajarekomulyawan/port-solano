// vehicles.js — every car in Port Solano: the factory, the arcade driving
// physics, the lane-following traffic AI and the rendering. Player-driven,
// police and mission cars share the same physics; traffic cars follow
// parametric lanes along the road grid so they never get lost.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};
  var City = PS.City;

  var TYPES = {
    sedan:       { w: 46, h: 22, maxSpeed: 305, accel: 195, colors: ['#e07a5f', '#3d8bfd', '#81b29a', '#f2cc8f', '#9d8189', '#6a8eae', '#e5e5e5'] },
    hatch:       { w: 40, h: 21, maxSpeed: 272, accel: 185, colors: ['#ef476f', '#06d6a0', '#118ab2', '#ffd166', '#c77dff'] },
    taxi:        { w: 46, h: 22, maxSpeed: 300, accel: 195, colors: ['#ffc300'] },
    convertible: { w: 47, h: 22, maxSpeed: 335, accel: 235, colors: ['#ff5d8f', '#00c2a8', '#ffd60a', '#4cc9f0'] },
    sports:      { w: 49, h: 21, maxSpeed: 405, accel: 305, colors: ['#d90429', '#ff7b00', '#7209b7', '#00f5d4'] },
    van:         { w: 58, h: 27, maxSpeed: 238, accel: 150, colors: ['#e5e5e5', '#8ecae6', '#a7c957', '#bc6c25'] },
    armored:     { w: 60, h: 28, maxSpeed: 205, accel: 130, colors: ['#495057'] },
    police:      { w: 47, h: 22, maxSpeed: 385, accel: 285, colors: ['#14213d'] }
  };

  var Vehicles = {
    list: [],
    TYPES: TYPES
  };

  var nextId = 1;

  Vehicles.create = function (type, x, y, angle, driver) {
    var t = TYPES[type] || TYPES.sedan;
    var car = {
      id: nextId++,
      type: type,
      x: x, y: y, angle: angle || 0,
      speed: 0,
      w: t.w, h: t.h,
      radius: Math.max(t.w, t.h) / 2 * 0.86,
      maxSpeed: t.maxSpeed,
      accel: t.accel,
      color: PS.pick(t.colors),
      driver: driver || 'parked',   // parked | traffic | player | police | mission
      health: type === 'armored' ? 240 : 100,
      maxHealth: type === 'armored' ? 240 : 100,
      input: { throttle: 0, steer: 0, brake: false, handbrake: false },
      // traffic lane state
      axis: null, c: 0, dir: 1, s: 0, cruise: 0, turnCd: 0, fleeT: 0,
      smokeT: 0,
      wrecked: false
    };
    Vehicles.list.push(car);
    return car;
  };

  Vehicles.remove = function (car) {
    var i = Vehicles.list.indexOf(car);
    if (i >= 0) Vehicles.list.splice(i, 1);
  };

  Vehicles.nearestEnterable = function (x, y, maxD) {
    var best = null, bestD = maxD;
    for (var i = 0; i < Vehicles.list.length; i++) {
      var c = Vehicles.list[i];
      if (c.wrecked) continue;
      if (c.driver !== 'parked' && !(c.driver === 'traffic' && Math.abs(c.speed) < 14)) continue;
      var d = PS.dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };

  Vehicles.damage = function (car, amt) {
    if (car.wrecked) return;
    car.health -= amt;
    if (car.health <= 0) {
      car.health = 0;
      car.wrecked = true;
      if (PS.FX) { PS.FX.smoke(car.x, car.y, 14); PS.FX.sparks(car.x, car.y, 10); }
      if (PS.Audio) PS.Audio.crash(true);
    }
  };

  // ---- spawning -------------------------------------------------------------
  function laneSpawn(minD, maxD) {
    var p = PS.Player;
    var cx = p ? p.x : 1600, cy = p ? p.y : 1200;
    for (var t = 0; t < 24; t++) {
      var vertical = PS.chance(0.5);
      var axis, c, s, dir = PS.chance(0.5) ? 1 : -1;
      if (vertical) { axis = 'v'; c = PS.pick(City.VX); s = PS.randRange(70, 1840); }
      else { axis = 'h'; c = PS.pick(City.HY); s = PS.randRange(70, 3130); }
      var x, y;
      if (axis === 'v') { x = c + (dir < 0 ? City.LANE : -City.LANE); y = s; }
      else { y = c + (dir > 0 ? City.LANE : -City.LANE); x = s; }
      var d = PS.dist(cx, cy, x, y);
      if (d < minD || d > maxD) continue;
      var clear = true;
      for (var i = 0; i < Vehicles.list.length; i++) {
        if (PS.dist(x, y, Vehicles.list[i].x, Vehicles.list[i].y) < 90) { clear = false; break; }
      }
      if (!clear) continue;
      return { axis: axis, c: c, s: s, dir: dir, x: x, y: y };
    }
    return null;
  }

  function makeTraffic(spawn) {
    var type = PS.pick(['sedan', 'sedan', 'hatch', 'taxi', 'convertible', 'van', 'sports']);
    var angle = spawn.axis === 'v' ? (spawn.dir < 0 ? -Math.PI / 2 : Math.PI / 2) : (spawn.dir > 0 ? 0 : Math.PI);
    var car = Vehicles.create(type, spawn.x, spawn.y, angle, 'traffic');
    car.axis = spawn.axis; car.c = spawn.c; car.s = spawn.s; car.dir = spawn.dir;
    car.cruise = PS.randRange(120, 185);
    car.speed = car.cruise;
    return car;
  }

  Vehicles.spawnInitial = function () {
    var i, sp;
    for (i = 0; i < 12; i++) {
      sp = laneSpawn(250, 1500);
      if (sp) makeTraffic(sp);
    }
    // Parked cars along curbs and in the motel / docks lots.
    var spots = [];
    for (i = 0; i < City.VX.length; i++) {
      for (var k = 0; k < 3; k++) {
        spots.push({ x: City.VX[i] + (PS.chance(0.5) ? 42 : -42), y: PS.randRange(120, 1750), a: Math.PI / 2 });
      }
    }
    for (i = 0; i < City.HY.length - 1; i++) {
      for (var m = 0; m < 2; m++) {
        spots.push({ x: PS.randRange(150, 3050), y: City.HY[i] + (PS.chance(0.5) ? 42 : -42), a: 0 });
      }
    }
    spots.push({ x: 470, y: 1700, a: 0.2 }, { x: 640, y: 1706, a: -0.15 }, { x: 2960, y: 1740, a: Math.PI / 2 }, { x: 3080, y: 1740, a: Math.PI / 2 });
    for (i = 0; i < spots.length; i++) {
      var s = spots[i];
      if (City.inBuilding(s.x, s.y, 20) || City.isWater(s.x, s.y)) continue;
      var ok = true;
      for (var j = 0; j < Vehicles.list.length; j++) {
        if (PS.dist(s.x, s.y, Vehicles.list[j].x, Vehicles.list[j].y) < 70) { ok = false; break; }
      }
      if (ok) Vehicles.create(PS.pick(['sedan', 'hatch', 'convertible', 'van', 'sports']), s.x, s.y, s.a, 'parked');
    }
  };

  // ---- physics for driven cars ------------------------------------------------
  Vehicles.stepCar = function (car, dt) {
    var inp = car.input;
    if (car.wrecked) {
      car.speed = PS.lerp(car.speed, 0, 1 - Math.pow(0.02, dt));
    } else {
      if (inp.throttle > 0) {
        car.speed += car.accel * inp.throttle * dt;
        if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
      } else if (inp.brake) {
        if (car.speed > 8) car.speed -= 340 * dt;
        else { car.speed -= 130 * dt; if (car.speed < -95) car.speed = -95; }
      }
      // Drag + rolling resistance.
      car.speed -= car.speed * 0.55 * dt;
      if (!inp.throttle && !inp.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
      if (inp.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 300 * dt);
      // Steering: sharper at low speed, calmer at high speed.
      var sf = PS.clamp(Math.abs(car.speed) / 130, 0, 1);
      var turn = 2.35 * (0.35 + 0.65 * sf) * (inp.handbrake ? 1.45 : 1);
      if (Math.abs(car.speed) > 2) {
        car.angle += inp.steer * turn * dt * (car.speed >= 0 ? 1 : -1);
      }
      if (inp.handbrake && Math.abs(car.speed) > 170 && PS.chance(0.3) && PS.Audio) PS.Audio.skid();
    }
    var px = car.x, py = car.y;
    var nx = car.x + Math.cos(car.angle) * car.speed * dt;
    var ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Sand and pier wood slow you down a touch.
    if (ny > City.BEACH_Y && !City.onPier(nx, ny)) car.speed -= car.speed * 0.8 * dt;
    if (!City.circleHitsSolid(nx, ny, car.radius)) {
      car.x = nx; car.y = ny;
    } else if (!City.circleHitsSolid(nx, py, car.radius)) {
      car.x = nx; impact(car, px, py);
    } else if (!City.circleHitsSolid(px, ny, car.radius)) {
      car.y = ny; impact(car, px, py);
    } else {
      impact(car, px, py);
    }
    car.x = PS.clamp(car.x, 24, City.W - 24);
    car.y = PS.clamp(car.y, 24, City.H - 24);
  };

  function impact(car, px, py) {
    var sp = Math.abs(car.speed);
    if (sp > 110) {
      Vehicles.damage(car, (sp - 100) * 0.09);
      if (PS.Audio) PS.Audio.crash(sp > 240);
      if (PS.FX) PS.FX.sparks(car.x, car.y, Math.min(12, 3 + sp / 30));
      if (car.driver === 'player' && PS.Player) PS.Player.hurt((sp - 110) * 0.02, 'crash');
    }
    car.speed = -car.speed * 0.22;
    car.x = px; car.y = py;
  }

  // ---- traffic AI ---------------------------------------------------------------
  function trafficAheadBlocked(car) {
    var dx = car.axis === 'v' ? 0 : car.dir, dy = car.axis === 'v' ? car.dir : 0;
    var ax = car.x + dx * 52, ay = car.y + dy * 52;
    var i, o;
    for (i = 0; i < Vehicles.list.length; i++) {
      o = Vehicles.list[i];
      if (o === car) continue;
      if (PS.dist(ax, ay, o.x, o.y) < o.radius + 26) return true;
    }
    if (PS.Peds) {
      for (i = 0; i < PS.Peds.list.length; i++) {
        o = PS.Peds.list[i];
        if (o.state !== 'down' && PS.dist(ax, ay, o.x, o.y) < 30) return true;
      }
    }
    var p = PS.Player;
    if (p && !p.inCar && PS.dist(ax, ay, p.x, p.y) < 32) return true;
    return false;
  }

  function stepTraffic(car, dt) {
    car.turnCd -= dt;
    if (car.fleeT > 0) car.fleeT -= dt;
    var blocked = trafficAheadBlocked(car);
    var target = blocked ? 0 : car.cruise * (car.fleeT > 0 ? 1.3 : 1);
    if (car.wrecked) target = 0;
    var rate = target > car.speed ? 120 : 320;
    car.speed += PS.clamp(target - car.speed, -rate * dt, rate * dt);
    var prevS = car.s;
    car.s += car.speed * car.dir * dt;

    var crossings = car.axis === 'v' ? City.HY : City.VX;
    var limit = car.axis === 'v' ? 1885 : 3160;
    var turned = false;
    if (car.turnCd <= 0) {
      for (var i = 0; i < crossings.length; i++) {
        var cross = crossings[i];
        var passed = car.dir > 0 ? (prevS < cross && car.s >= cross) : (prevS > cross && car.s <= cross);
        if (passed && PS.chance(car.fleeT > 0 ? 0.1 : 0.38)) {
          var oldC = car.c;
          car.axis = car.axis === 'v' ? 'h' : 'v';
          car.c = cross;
          car.s = oldC;
          car.dir = PS.chance(0.5) ? 1 : -1;
          car.turnCd = 1.2;
          turned = true;
          break;
        }
      }
    }
    if (!turned && (car.s < 45 || car.s > limit)) {
      // End of the road: swing onto the crossing street if there is one, else U-turn.
      var endCross = car.axis === 'v' ? 1830 : (car.s < 45 ? City.VX[0] : City.VX[City.VX.length - 1]);
      var nearEnd = car.axis === 'v' ? (car.s > limit ? 1830 : null) : null;
      if (car.axis === 'v' && car.s > limit && nearEnd) {
        var oc = car.c;
        car.axis = 'h'; car.c = 1830; car.s = oc;
        car.dir = oc < 1600 ? 1 : -1;
        car.turnCd = 1.2;
      } else {
        car.dir *= -1;
        car.s = PS.clamp(car.s, 46, limit - 1);
      }
    }
    // Convert lane state back to world position.
    if (car.axis === 'v') {
      car.x = car.c + (car.dir < 0 ? City.LANE : -City.LANE);
      car.y = car.s;
      car.angle = car.dir < 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      car.y = car.c + (car.dir > 0 ? City.LANE : -City.LANE);
      car.x = car.s;
      car.angle = car.dir > 0 ? 0 : Math.PI;
    }
  }

  // ---- car vs car -----------------------------------------------------------------
  function collideCars(dt) {
    var list = Vehicles.list;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        var rr = a.radius + b.radius;
        var d2 = PS.dist2(a.x, a.y, b.x, b.y);
        if (d2 > rr * rr || d2 === 0) continue;
        var d = Math.sqrt(d2);
        var ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
        var overlap = (rr - d) / 2 + 0.5;
        var aMovable = a.driver !== 'parked', bMovable = b.driver !== 'parked';
        if (aMovable || !bMovable) { a.x -= ux * overlap; a.y -= uy * overlap; }
        if (bMovable || !aMovable) { b.x += ux * overlap; b.y += uy * overlap; }
        var rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
        var closing = (a.speed * Math.cos(a.angle) + b.speed * -Math.cos(b.angle)) * ux +
                      (a.speed * Math.sin(a.angle) - b.speed * Math.sin(b.angle)) * uy;
        if (Math.abs(closing) > 60 || rel > 150) {
          var dmg = Math.min(26, (Math.abs(closing) - 40) * 0.12 + 2);
          if (dmg > 2) {
            Vehicles.damage(a, dmg * 0.7);
            Vehicles.damage(b, dmg * 0.7);
            if (PS.Audio) PS.Audio.crash(Math.abs(closing) > 200);
            if (PS.FX) PS.FX.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
            // Ramming the mission van counts, whoever is at fault — but the
            // mission only credits the player's own hits.
            if (PS.Missions) {
              if (a.type === 'armored' && b.driver === 'player') PS.Missions.onVanHit(Math.abs(closing));
              if (b.type === 'armored' && a.driver === 'player') PS.Missions.onVanHit(Math.abs(closing));
            }
            if (a.driver === 'player' && PS.Player) PS.Player.hurt(dmg * 0.12, 'crash');
            if (b.driver === 'player' && PS.Player) PS.Player.hurt(dmg * 0.12, 'crash');
          }
          var swap = (a.speed + b.speed) / 2;
          a.speed = PS.lerp(a.speed, swap, 0.55);
          b.speed = PS.lerp(b.speed, swap, 0.55);
        }
      }
    }
  }

  var spawnT = 0;
  Vehicles.update = function (dt) {
    var p = PS.Player;
    var i, car;
    for (i = Vehicles.list.length - 1; i >= 0; i--) {
      car = Vehicles.list[i];
      if (car.driver === 'traffic') {
        stepTraffic(car, dt);
        if (p && PS.dist(p.x, p.y, car.x, car.y) > 1200) Vehicles.remove(car);
      } else if (car.driver === 'player' || car.driver === 'police' || car.driver === 'mission') {
        Vehicles.stepCar(car, dt);
      }
      if (car.health < 40 && !car.wrecked) {
        car.smokeT -= dt;
        if (car.smokeT <= 0) { car.smokeT = 0.14; if (PS.FX) PS.FX.smoke(car.x, car.y, 1); }
      }
    }
    collideCars(dt);
    // Keep the streets populated.
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.8;
      var trafficCount = 0;
      for (i = 0; i < Vehicles.list.length; i++) if (Vehicles.list[i].driver === 'traffic') trafficCount++;
      if (trafficCount < 13 && p && p.state === 'playing') {
        var sp = laneSpawn(430, 1000);
        if (sp) makeTraffic(sp);
      }
    }
  };

  // ---- rendering ------------------------------------------------------------------
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  Vehicles.draw = function (g, camX, camY, vw, vh, t) {
    var sorted = Vehicles.list.slice().sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < sorted.length; i++) {
      var car = sorted[i];
      if (car.x < camX - 90 || car.x > camX + vw + 90 || car.y < camY - 90 || car.y > camY + vh + 90) continue;
      drawCar(g, car, t);
    }
  };

  function drawCar(g, car, t) {
    g.save();
    g.translate(car.x, car.y);
    // Shadow.
    g.fillStyle = 'rgba(40,30,10,0.28)';
    rr(g, -car.w / 2 + 5, -car.h / 2 + 7, car.w, car.h, 7);
    g.fill();
    g.rotate(car.angle);
    var hw = car.w / 2, hh = car.h / 2;
    // Wheels.
    g.fillStyle = '#17181c';
    var ww = 9, wh = 5;
    g.fillRect(-hw + 4, -hh - 2, ww, wh);
    g.fillRect(hw - ww - 4, -hh - 2, ww, wh);
    g.fillRect(-hw + 4, hh - 3, ww, wh);
    g.fillRect(hw - ww - 4, hh - 3, ww, wh);
    // Body.
    g.fillStyle = car.color;
    rr(g, -hw, -hh, car.w, car.h, 6);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.5;
    g.stroke();
    if (car.type === 'police') {
      g.fillStyle = '#f8f9fa';
      rr(g, -8, -hh + 2, 18, car.h - 4, 3);
      g.fill();
      g.fillStyle = '#14213d';
      g.font = 'bold 7px Arial';
      g.textAlign = 'center';
      g.fillText('POLICE', 1, 2.5);
    }
    if (car.type === 'armored') {
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.fillRect(-hw + 6, -hh + 4, car.w - 12, 4);
      g.fillRect(-hw + 6, hh - 8, car.w - 12, 4);
      g.fillStyle = '#343a40';
      g.fillRect(hw - 16, -hh + 5, 8, car.h - 10);
    }
    if (car.type === 'van') {
      g.fillStyle = 'rgba(255,255,255,0.20)';
      g.fillRect(-hw + 10, -hh + 3, car.w - 30, car.h - 6);
    }
    // Cabin: convertible shows its interior, everything else gets glass + roof.
    if (car.type === 'convertible') {
      g.fillStyle = '#8a5a3b';
      rr(g, -12, -hh + 3, 24, car.h - 6, 4);
      g.fill();
      g.fillStyle = 'rgba(20,30,45,0.85)';
      g.fillRect(9, -hh + 3, 6, car.h - 6); // windscreen
      if (car.driver !== 'parked') {
        g.fillStyle = '#f1c27d';
        g.beginPath(); g.arc(-2, 0, 5, 0, PS.TAU); g.fill();
      }
    } else {
      g.fillStyle = 'rgba(18,28,42,0.88)';
      rr(g, hw - 19, -hh + 3, 8, car.h - 6, 2); g.fill();       // windscreen
      rr(g, -hw + 5, -hh + 3, 6, car.h - 6, 2); g.fill();        // rear glass
      g.fillStyle = car.type === 'police' ? '#e9ecef' : shade(car.color, -18);
      rr(g, -hw + 13, -hh + 4, car.w - 34, car.h - 8, 4); g.fill(); // roof
      if (car.driver === 'player' || car.driver === 'police' || car.driver === 'traffic') {
        g.fillStyle = 'rgba(241,194,125,0.9)';
        g.beginPath(); g.arc(-2, 0, 4.4, 0, PS.TAU); g.fill();   // driver head through glass
      }
    }
    if (car.type === 'taxi') {
      g.fillStyle = '#111';
      g.fillRect(-4, -5, 9, 10);
      g.fillStyle = '#ffd60a';
      g.font = 'bold 6px Arial';
      g.textAlign = 'center';
      g.fillText('TAXI', 0.5, 2);
    }
    if (car.type === 'sports') {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(-hw + 2, -hh + 2, 7, car.h - 4); // rear spoiler shadow line
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(-6, -2, 16, 4); // racing stripe hint
    }
    // Lights.
    g.fillStyle = '#fff7ae';
    g.fillRect(hw - 3, -hh + 3, 3, 5);
    g.fillRect(hw - 3, hh - 8, 3, 5);
    g.fillStyle = '#e63946';
    g.fillRect(-hw, -hh + 3, 3, 5);
    g.fillRect(-hw, hh - 8, 3, 5);
    // Police lightbar.
    if (car.type === 'police') {
      var phase = Math.floor(t * 3.4 + car.id) % 2 === 0;
      g.fillStyle = phase ? '#ff2e4d' : '#5e3000';
      g.fillRect(-3, -7, 7, 6);
      g.fillStyle = phase ? '#123a6d' : '#2e7bff';
      g.fillRect(-3, 1, 7, 6);
    }
    if (car.wrecked) {
      g.fillStyle = 'rgba(15,15,18,0.45)';
      rr(g, -hw, -hh, car.w, car.h, 6);
      g.fill();
    }
    g.restore();
    // Mission-van health bar.
    if (car.type === 'armored' && !car.wrecked && PS.Missions && PS.Missions.current === 3) {
      var wpx = 64, ratio = PS.clamp(car.health / car.maxHealth, 0, 1);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(car.x - wpx / 2, car.y - 46, wpx, 8);
      g.fillStyle = ratio > 0.35 ? '#ffd60a' : '#e63946';
      g.fillRect(car.x - wpx / 2 + 1, car.y - 45, (wpx - 2) * ratio, 6);
    }
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = PS.clamp((n >> 16) + amt, 0, 255);
    var gg = PS.clamp(((n >> 8) & 255) + amt, 0, 255);
    var b = PS.clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  PS.Vehicles = Vehicles;
})();
