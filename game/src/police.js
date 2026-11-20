// police.js — the Port Solano PD: the wanted system and its response.
// Crimes raise a hidden "heat" value; the stars the player sees are its
// floor. Heat only cools while no police unit can see the player, so
// breaking line of sight down alleys and across the beach is how you
// lose a tail. Police cars hunt in packs sized by the star count, and at
// three stars and up, officers on foot join in — and they can arrest you.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};
  var City = PS.City;

  var SEVERITY = { theft: 1, vandalism: 1, assault: 1, runover: 2, shooting: 2, policeHit: 3 };
  var CAR_COUNT = [0, 1, 2, 3, 4, 6];

  var Police = {
    heat: 0,
    officers: [],
    unseenT: 0,
    spawnT: 0
  };

  Police.stars = function () {
    return PS.clamp(Math.floor(Police.heat + 0.0001), 0, 5);
  };

  Police.setWanted = function (n) {
    Police.heat = Math.max(Police.heat, n);
    Police.unseenT = 0;
  };

  Police.clearWanted = function () {
    Police.heat = 0;
    Police.unseenT = 0;
  };

  // Was there a witness (pedestrian or officer) near the crime?
  function witnessed(x, y) {
    var i;
    if (PS.Peds) {
      for (i = 0; i < PS.Peds.list.length; i++) {
        var p = PS.Peds.list[i];
        if (p.state !== 'down' && PS.dist(x, y, p.x, p.y) < 300) return true;
      }
    }
    for (i = 0; i < Police.officers.length; i++) {
      if (PS.dist(x, y, Police.officers[i].x, Police.officers[i].y) < 320) return true;
    }
    for (i = 0; i < PS.Vehicles.list.length; i++) {
      var c = PS.Vehicles.list[i];
      if (c.driver === 'police' && PS.dist(x, y, c.x, c.y) < 340) return true;
    }
    return false;
  }

  Police.reportCrime = function (kind, x, y) {
    var sev = SEVERITY[kind] || 1;
    var loud = kind === 'shooting' || kind === 'policeHit';
    if (loud || witnessed(x, y)) {
      Police.heat = Math.min(5.99, Math.max(Police.heat, sev) + (Police.heat >= sev ? 0.25 : 0));
      if (Police.heat < sev) Police.heat = sev;
      Police.unseenT = 0;
    } else {
      // Unwitnessed petty crime: a whisper of heat, never a full star alone.
      Police.heat = Math.min(0.9, Police.heat + 0.3);
    }
    if (PS.Peds && kind !== 'theft') PS.Peds.frighten(x, y, 240);
  };

  function policeCars() {
    var out = [];
    for (var i = 0; i < PS.Vehicles.list.length; i++) {
      if (PS.Vehicles.list[i].driver === 'police') out.push(PS.Vehicles.list[i]);
    }
    return out;
  }

  function playerSeen() {
    var p = PS.Player;
    if (!p) return false;
    var i;
    var cars = policeCars();
    for (i = 0; i < cars.length; i++) if (PS.dist(p.x, p.y, cars[i].x, cars[i].y) < 430) return true;
    for (i = 0; i < Police.officers.length; i++) if (PS.dist(p.x, p.y, Police.officers[i].x, Police.officers[i].y) < 330) return true;
    return false;
  }

  function spawnPoliceCar() {
    var p = PS.Player;
    var pt = City.roadPointNear(p.x, p.y, 520, 700);
    var angle = PS.angleTo(pt.x, pt.y, p.x, p.y);
    var car = PS.Vehicles.create('police', pt.x, pt.y, angle, 'police');
    car.ai = { stuckT: 0, reverseT: 0 };
    return car;
  }

  function drivePoliceCar(car, dt) {
    var p = PS.Player;
    var ai = car.ai || (car.ai = { stuckT: 0, reverseT: 0 });
    var tx = p.inCar && p.car ? p.car.x : p.x;
    var ty = p.inCar && p.car ? p.car.y : p.y;
    // Aim a little ahead of a moving target.
    if (p.inCar && p.car) {
      tx += Math.cos(p.car.angle) * p.car.speed * 0.35;
      ty += Math.sin(p.car.angle) * p.car.speed * 0.35;
    }
    var d = PS.dist(car.x, car.y, tx, ty);
    var desired = PS.angleTo(car.x, car.y, tx, ty);
    var diff = PS.angleDiff(car.angle, desired);
    var inp = car.input;
    inp.steer = PS.clamp(diff * 2.4, -1, 1);
    inp.handbrake = false;
    if (ai.reverseT > 0) {
      ai.reverseT -= dt;
      inp.throttle = 0;
      inp.brake = true;
      inp.steer = PS.clamp(-diff * 2.4, -1, 1);
    } else {
      inp.brake = false;
      inp.throttle = Math.abs(diff) > 1.15 ? 0.3 : 1;
      // Do not plough endlessly into a player on foot: pull up alongside.
      if (!p.inCar && d < 52) inp.throttle = 0.12;
      if (Math.abs(car.speed) < 10 && inp.throttle > 0.5) ai.stuckT += dt; else ai.stuckT = 0;
      if (ai.stuckT > 1.25) { ai.stuckT = 0; ai.reverseT = 0.75; }
    }
    if (car.wrecked) { inp.throttle = 0; inp.brake = false; }
  }

  function makeOfficer(x, y) {
    return {
      x: x, y: y, angle: 0, health: 60, state: 'chase',
      shootCd: PS.randRange(0.4, 1.2), phase: PS.randRange(0, 6), downT: 0
    };
  }

  Police.damageOfficer = function (officer, amt, byPlayer) {
    if (officer.state === 'down') return;
    officer.health -= amt;
    if (officer.health <= 0) {
      officer.state = 'down';
      officer.downT = 25;
      if (byPlayer) Police.reportCrime('policeHit', officer.x, officer.y);
    }
  };

  function updateOfficer(o, dt) {
    var p = PS.Player;
    if (o.state === 'down') { o.downT -= dt; return; }
    var target = p.inCar && p.car ? p.car : p;
    var d = PS.dist(o.x, o.y, target.x, target.y);
    o.angle = PS.angleTo(o.x, o.y, target.x, target.y);
    var playerFast = p.inCar && p.car && Math.abs(p.car.speed) > 130;
    if (!playerFast && d > 34) {
      var sp = 122;
      var nx = o.x + Math.cos(o.angle) * sp * dt;
      var ny = o.y + Math.sin(o.angle) * sp * dt;
      if (!City.pointBlocked(nx, ny)) { o.x = nx; o.y = ny; }
      else if (!City.pointBlocked(nx, o.y)) o.x = nx;
      else if (!City.pointBlocked(o.x, ny)) o.y = ny;
      o.phase += dt * 11;
    }
    // Arrest pressure.
    if (!p.inCar && d < 32 && Police.stars() >= 1) {
      p.arrestProgress += dt;
      p.grabbed = true;
    }
    // Shooting.
    o.shootCd -= dt;
    if (d < 235 && o.shootCd <= 0 && Police.stars() >= 3) {
      o.shootCd = PS.randRange(0.95, 1.35);
      if (PS.Audio) PS.Audio.shot();
      var tx = target.x + PS.randRange(-8, 8), ty = target.y + PS.randRange(-8, 8);
      if (PS.FX) PS.FX.tracer(o.x, o.y, tx, ty);
      var hitChance = PS.clamp(0.62 - d / 600, 0.15, 0.6);
      if (PS.chance(hitChance)) {
        if (p.inCar && p.car) PS.Vehicles.damage(p.car, 3);
        else p.hurt(6, 'shot');
      } else if (PS.FX) {
        PS.FX.sparks(tx, ty, 2);
      }
    }
  }

  Police.update = function (dt) {
    var p = PS.Player;
    var stars = Police.stars();
    var i;

    // Heat decay while unseen.
    if (stars > 0) {
      if (playerSeen()) Police.unseenT = 0;
      else {
        Police.unseenT += dt;
        var need = 8 + stars * 1.5;
        if (Police.unseenT >= need) {
          Police.unseenT = 0;
          Police.heat = Math.max(0, Math.ceil(Police.heat) - 1); // one star cooler
          if (PS.HUD) PS.HUD.flashMessage('The heat is cooling off…');
        }
      }
    }

    // Police cars: spawn to quota, drive, stand down when clean.
    var cars = policeCars();
    Police.spawnT -= dt;
    if (stars > 0 && cars.length < CAR_COUNT[stars] && Police.spawnT <= 0) {
      Police.spawnT = 1.6;
      cars.push(spawnPoliceCar());
    }
    for (i = 0; i < cars.length; i++) {
      if (stars === 0) {
        // Stand down: the car leaves service and joins normal traffic.
        var car = cars[i];
        var nearestV = City.VX[0], bestD = 1e9;
        for (var vi = 0; vi < City.VX.length; vi++) {
          var dv = Math.abs(car.x - City.VX[vi]);
          if (dv < bestD) { bestD = dv; nearestV = City.VX[vi]; }
        }
        car.driver = 'traffic';
        car.axis = 'v'; car.c = nearestV; car.s = car.y;
        car.dir = Math.sin(car.angle) >= 0 ? 1 : -1;
        car.cruise = 150;
      } else {
        drivePoliceCar(cars[i], dt);
      }
    }

    // Foot officers at 3+ stars.
    var wantOfficers = stars >= 3 ? (stars - 2) * 2 : 0;
    var alive = 0;
    for (i = 0; i < Police.officers.length; i++) if (Police.officers[i].state !== 'down') alive++;
    if (alive < wantOfficers && Police.spawnT <= 0) {
      Police.spawnT = 1.2;
      var pt = City.walkPointNear(p.x, p.y, 290, 470);
      if (PS.dist(pt.x, pt.y, p.x, p.y) > 240) Police.officers.push(makeOfficer(pt.x, pt.y));
    }
    p.grabbed = false;
    for (i = Police.officers.length - 1; i >= 0; i--) {
      var o = Police.officers[i];
      updateOfficer(o, dt);
      if ((o.state === 'down' && o.downT <= 0) || PS.dist(p.x, p.y, o.x, o.y) > 1000 || (stars < 3 && o.state !== 'down' && PS.dist(p.x, p.y, o.x, o.y) > 260)) {
        Police.officers.splice(i, 1);
      }
    }
    if (!p.grabbed) p.arrestProgress = Math.max(0, p.arrestProgress - dt * 1.6);
    if (p.arrestProgress >= 2 && !p.inCar) p.busted();

    // Siren when the law is close.
    if (PS.Audio) {
      var anyNear = false;
      for (i = 0; i < cars.length; i++) if (PS.dist(p.x, p.y, cars[i].x, cars[i].y) < 620) { anyNear = true; break; }
      PS.Audio.setSiren(anyNear && stars > 0);
    }
  };

  // Positions for the minimap.
  Police.units = function () {
    var out = [];
    var cars = policeCars();
    for (var i = 0; i < cars.length; i++) out.push(cars[i]);
    for (var j = 0; j < Police.officers.length; j++) {
      if (Police.officers[j].state !== 'down') out.push(Police.officers[j]);
    }
    return out;
  };

  Police.drawOfficers = function (g, camX, camY, vw, vh) {
    for (var i = 0; i < Police.officers.length; i++) {
      var o = Police.officers[i];
      if (o.x < camX - 30 || o.x > camX + vw + 30 || o.y < camY - 30 || o.y > camY + vh + 30) continue;
      g.save();
      g.translate(o.x, o.y);
      g.fillStyle = 'rgba(40,30,10,0.25)';
      g.beginPath(); g.ellipse(2, 4, 8, 4.5, 0, 0, PS.TAU); g.fill();
      if (o.state === 'down') {
        g.rotate(o.angle + Math.PI / 2);
        g.fillStyle = '#1d3557';
        g.beginPath(); g.ellipse(0, 0, 13, 6, 0, 0, PS.TAU); g.fill();
        g.fillStyle = '#f1c27d';
        g.beginPath(); g.arc(-13, 0, 4.6, 0, PS.TAU); g.fill();
        g.restore();
        continue;
      }
      g.rotate(o.angle);
      var sw = Math.sin(o.phase) * 4;
      g.fillStyle = '#14213d';
      g.fillRect(-2 + sw * 0.4, -6, 6, 4);
      g.fillRect(-2 - sw * 0.4, 2, 6, 4);
      g.fillStyle = '#1d3557';
      g.beginPath(); g.ellipse(0, 0, 8.5, 6.5, 0, 0, PS.TAU); g.fill();
      g.fillStyle = '#ffd60a';
      g.fillRect(2, -4, 3, 8); // badge stripe
      g.fillStyle = '#f1c27d';
      g.beginPath(); g.arc(1.5, 0, 4.6, 0, PS.TAU); g.fill();
      g.fillStyle = '#14213d';
      g.beginPath(); g.arc(2.5, 0, 4.8, Math.PI * 0.6, Math.PI * 1.9); g.fill(); // cap
      // Pistol.
      g.fillStyle = '#111';
      g.fillRect(7, -1.5, 7, 3);
      g.restore();
    }
  };

  PS.Police = Police;
})();
