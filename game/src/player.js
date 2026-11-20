// player.js — Marco Reyes: on-foot movement, fists and pistol, getting in
// and out of other people's cars, and the consequences (hospital, jail).
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};
  var City = PS.City;

  var Player = {
    x: 620, y: 1790, angle: -Math.PI / 2,
    health: 100, money: 100,
    hasPistol: false, ammo: 0,
    inCar: false, car: null,
    state: 'title',
    arrestProgress: 0, grabbed: false,
    punchCd: 0, fireCd: 0, hurtCd: 0, hurtFlash: 0,
    walkPhase: 0, moving: false
  };

  Player.reset = function (x, y) {
    Player.x = x; Player.y = y;
    Player.angle = -Math.PI / 2;
    Player.health = 100;
    Player.money = 100;
    Player.hasPistol = false;
    Player.ammo = 0;
    Player.inCar = false;
    Player.car = null;
    Player.arrestProgress = 0;
    Player.grabbed = false;
    Player.punchCd = 0; Player.fireCd = 0;
  };

  Player.addMoney = function (n) {
    Player.money += n;
    if (PS.FX) PS.FX.popup(Player.x, Player.y - 26, (n >= 0 ? '+$' : '-$') + Math.abs(n), n >= 0 ? '#7bf1a8' : '#ff8fa3');
    if (PS.Audio && n > 0) PS.Audio.cash();
  };

  Player.hurt = function (amount, cause) {
    if (Player.state !== 'playing' || amount <= 0) return;
    Player.health -= amount;
    Player.hurtFlash = Math.min(0.55, Player.hurtFlash + 0.25);
    if (Player.hurtCd <= 0) { Player.hurtCd = 0.35; if (PS.Audio) PS.Audio.hurt(); }
    if (Player.health <= 0) {
      Player.health = 0;
      Player.die();
    }
  };

  Player.die = function () {
    if (PS.Audio) { PS.Audio.engineStop(); PS.Audio.setSiren(false); }
    if (PS.Game) PS.Game.showWasted();
  };

  Player.busted = function () {
    if (Player.state !== 'playing') return;
    var fine = 150 + 100 * PS.Police.stars();
    Player.money = Math.max(0, Player.money - fine);
    Player.hasPistol = false;
    Player.ammo = 0;
    Player.arrestProgress = 0;
    if (PS.Audio) { PS.Audio.engineStop(); PS.Audio.setSiren(false); }
    if (PS.Game) PS.Game.showBusted(fine);
  };

  // ---- entering / exiting cars ---------------------------------------------
  function enterCar(car) {
    if (car.driver === 'traffic') {
      // Yank the driver out; they run, and somebody usually sees it.
      if (PS.Peds) {
        var pt = { x: car.x + PS.randRange(-20, 20), y: car.y + PS.randRange(-20, 20) };
        PS.Peds.list.push({ x: pt.x, y: pt.y, angle: 0, speed: 60, state: 'flee', tx: pt.x, ty: pt.y, shirt: '#eeeeee', skin: '#e0ac69', phase: 0, fleeT: 3, fleeFromX: Player.x, fleeFromY: Player.y, downT: 0, retargetT: 0 });
        PS.Peds.frighten(car.x, car.y, 120);
      }
      if (PS.Police) PS.Police.reportCrime('theft', car.x, car.y);
    } else if (car.driver === 'parked') {
      if (PS.Police) PS.Police.reportCrime('theft', car.x, car.y);
    }
    car.driver = 'player';
    car.input.throttle = 0; car.input.steer = 0; car.input.brake = false;
    Player.inCar = true;
    Player.car = car;
    if (PS.Audio) { PS.Audio.door(); PS.Audio.engineStart(); }
  }

  function exitCar() {
    var car = Player.car;
    if (!car) return;
    car.driver = 'parked';
    car.input.throttle = 0; car.input.steer = 0; car.input.brake = false; car.input.handbrake = false;
    var side = 1;
    var spots = [
      { x: car.x + Math.cos(car.angle + Math.PI / 2) * (car.h / 2 + 16), y: car.y + Math.sin(car.angle + Math.PI / 2) * (car.h / 2 + 16) },
      { x: car.x + Math.cos(car.angle - Math.PI / 2) * (car.h / 2 + 16), y: car.y + Math.sin(car.angle - Math.PI / 2) * (car.h / 2 + 16) },
      { x: car.x - Math.cos(car.angle) * (car.w / 2 + 16), y: car.y - Math.sin(car.angle) * (car.w / 2 + 16) }
    ];
    for (var i = 0; i < spots.length; i++) {
      if (!City.circleHitsSolid(spots[i].x, spots[i].y, 10)) {
        side = i;
        Player.x = spots[i].x; Player.y = spots[i].y;
        break;
      }
    }
    if (side === 1 && i === spots.length) { Player.x = car.x; Player.y = car.y + car.h; }
    Player.inCar = false;
    Player.car = null;
    if (PS.Audio) { PS.Audio.door(); PS.Audio.engineStop(); }
  }
  Player.exitCar = exitCar;

  // ---- combat ------------------------------------------------------------------
  function punch() {
    Player.punchCd = 0.34;
    if (PS.Audio) PS.Audio.punch();
    var hx = Player.x + Math.cos(Player.angle) * 26;
    var hy = Player.y + Math.sin(Player.angle) * 26;
    if (PS.FX) PS.FX.swipe(Player.x, Player.y, Player.angle);
    var i, hit = false;
    if (PS.Peds) {
      for (i = 0; i < PS.Peds.list.length; i++) {
        var p = PS.Peds.list[i];
        if (p.state !== 'down' && PS.dist(hx, hy, p.x, p.y) < 22) { PS.Peds.knockDown(p, true); hit = true; }
      }
    }
    if (PS.Police) {
      for (i = 0; i < PS.Police.officers.length; i++) {
        var o = PS.Police.officers[i];
        if (o.state !== 'down' && PS.dist(hx, hy, o.x, o.y) < 24) { PS.Police.damageOfficer(o, 26, true); hit = true; }
      }
    }
    if (!hit) {
      for (i = 0; i < PS.Vehicles.list.length; i++) {
        var c = PS.Vehicles.list[i];
        if (PS.dist(hx, hy, c.x, c.y) < c.radius + 8) {
          PS.Vehicles.damage(c, 2);
          if (PS.Police) PS.Police.reportCrime('vandalism', c.x, c.y);
          break;
        }
      }
    }
  }

  function shoot() {
    if (Player.ammo <= 0) {
      Player.fireCd = 0.3;
      if (PS.Audio) PS.Audio.emptyClick();
      if (PS.HUD) PS.HUD.flashMessage('Out of ammo — finish missions to earn more');
      return;
    }
    Player.fireCd = 0.21;
    Player.ammo--;
    if (PS.Audio) PS.Audio.shot();
    if (PS.Police) PS.Police.reportCrime('shooting', Player.x, Player.y);
    if (PS.Peds) PS.Peds.frighten(Player.x, Player.y, 320);
    var a = Player.angle;
    var mx = Player.x + Math.cos(a) * 16, my = Player.y + Math.sin(a) * 16;
    var maxR = 430, hitX = Player.x + Math.cos(a) * maxR, hitY = Player.y + Math.sin(a) * maxR;
    var i, step;
    outer:
    for (step = 14; step < maxR; step += 9) {
      var px = Player.x + Math.cos(a) * step, py = Player.y + Math.sin(a) * step;
      if (City.inBuilding(px, py, 0)) { hitX = px; hitY = py; if (PS.FX) PS.FX.sparks(px, py, 3); break; }
      if (PS.Police) {
        for (i = 0; i < PS.Police.officers.length; i++) {
          var o = PS.Police.officers[i];
          if (o.state !== 'down' && PS.dist(px, py, o.x, o.y) < 14) {
            PS.Police.damageOfficer(o, 34, true);
            hitX = px; hitY = py;
            break outer;
          }
        }
      }
      if (PS.Peds) {
        for (i = 0; i < PS.Peds.list.length; i++) {
          var p = PS.Peds.list[i];
          if (p.state !== 'down' && PS.dist(px, py, p.x, p.y) < 12) {
            PS.Peds.knockDown(p, true);
            hitX = px; hitY = py;
            break outer;
          }
        }
      }
      for (i = 0; i < PS.Vehicles.list.length; i++) {
        var c = PS.Vehicles.list[i];
        if (PS.dist(px, py, c.x, c.y) < c.radius + 16 && PS.pointInCarRect(px, py, c, 1)) {
          PS.Vehicles.damage(c, 9);
          if (c.type === 'armored' && PS.Missions) PS.Missions.onVanShot();
          if (PS.FX) PS.FX.sparks(px, py, 4);
          hitX = px; hitY = py;
          break outer;
        }
      }
    }
    if (PS.FX) {
      PS.FX.tracer(mx, my, hitX, hitY);
      PS.FX.flash(mx, my);
    }
  }

  // ---- per-frame update ---------------------------------------------------------
  Player.update = function (dt) {
    var In = PS.Input;
    Player.punchCd -= dt; Player.fireCd -= dt; Player.hurtCd -= dt;
    Player.hurtFlash = Math.max(0, Player.hurtFlash - dt * 1.4);

    if (Player.inCar && Player.car) {
      var car = Player.car;
      Player.x = car.x; Player.y = car.y;
      Player.angle = car.angle;
      var inp = car.input;
      inp.throttle = (In.keys.has('KeyW') || In.keys.has('ArrowUp')) ? 1 : 0;
      inp.brake = In.keys.has('KeyS') || In.keys.has('ArrowDown');
      inp.steer = 0;
      if (In.keys.has('KeyA') || In.keys.has('ArrowLeft')) inp.steer -= 1;
      if (In.keys.has('KeyD') || In.keys.has('ArrowRight')) inp.steer += 1;
      inp.handbrake = In.keys.has('Space');
      if (PS.Audio) PS.Audio.engineSet(car.speed / car.maxSpeed, inp.throttle > 0);
      if (In.pressed.has('KeyE')) { exitCar(); return; }
      if (car.wrecked) { exitCar(); if (PS.HUD) PS.HUD.flashMessage('This car is wrecked!'); return; }
      // Running people over is very much a crime.
      if (Math.abs(car.speed) > 45) {
        var i;
        if (PS.Peds) {
          for (i = 0; i < PS.Peds.list.length; i++) {
            var p = PS.Peds.list[i];
            if (p.state !== 'down' && PS.dist(car.x, car.y, p.x, p.y) < car.radius + 7) {
              PS.Peds.knockDown(p, false);
              if (PS.Police) PS.Police.reportCrime('runover', p.x, p.y);
              car.speed *= 0.82;
            }
          }
        }
        if (PS.Police) {
          for (i = 0; i < PS.Police.officers.length; i++) {
            var o = PS.Police.officers[i];
            if (o.state !== 'down' && PS.dist(car.x, car.y, o.x, o.y) < car.radius + 7) {
              PS.Police.damageOfficer(o, 55, true);
              car.speed *= 0.8;
            }
          }
        }
      }
      Player.moving = Math.abs(car.speed) > 8;
      return;
    }

    // On foot.
    var mx = 0, my = 0;
    if (In.keys.has('KeyW') || In.keys.has('ArrowUp')) my -= 1;
    if (In.keys.has('KeyS') || In.keys.has('ArrowDown')) my += 1;
    if (In.keys.has('KeyA') || In.keys.has('ArrowLeft')) mx -= 1;
    if (In.keys.has('KeyD') || In.keys.has('ArrowRight')) mx += 1;
    var aiming = Player.hasPistol && In.mouseDown;
    Player.moving = (mx !== 0 || my !== 0);
    if (aiming) {
      Player.angle = PS.angleTo(Player.x, Player.y, In.mouseWorldX, In.mouseWorldY);
    } else if (Player.moving) {
      Player.angle = Math.atan2(my, mx);
    }
    if (Player.moving) {
      var len = Math.sqrt(mx * mx + my * my);
      var sp = (In.keys.has('ShiftLeft') || In.keys.has('ShiftRight')) ? 188 : 122;
      if (Player.grabbed) sp *= 0.35;
      if (aiming) sp *= 0.55;
      var vx = (mx / len) * sp, vy = (my / len) * sp;
      var nx = Player.x + vx * dt, ny = Player.y + vy * dt;
      if (!City.circleHitsSolid(nx, ny, 11)) { Player.x = nx; Player.y = ny; }
      else if (!City.circleHitsSolid(nx, Player.y, 11)) Player.x = nx;
      else if (!City.circleHitsSolid(Player.x, ny, 11)) Player.y = ny;
      Player.walkPhase += dt * (sp > 150 ? 13 : 10);
    }
    if (In.pressed.has('KeyF') && Player.punchCd <= 0) punch();
    if (aiming && Player.fireCd <= 0) shoot();
    if (In.pressed.has('KeyE')) {
      var near = PS.Vehicles.nearestEnterable(Player.x, Player.y, 54);
      if (near) enterCar(near);
    }
  };

  Player.draw = function (g) {
    if (Player.inCar) return;
    g.save();
    g.translate(Player.x, Player.y);
    g.fillStyle = 'rgba(40,30,10,0.28)';
    g.beginPath(); g.ellipse(2, 4, 9, 5, 0, 0, PS.TAU); g.fill();
    g.rotate(Player.angle);
    var sw = Player.moving ? Math.sin(Player.walkPhase) * 5 : 0;
    g.fillStyle = '#263238';
    g.fillRect(-2 + sw * 0.4, -6.5, 6.5, 4.2);
    g.fillRect(-2 - sw * 0.4, 2.3, 6.5, 4.2);
    // Marco's crimson jacket.
    g.fillStyle = '#c1121f';
    g.beginPath(); g.ellipse(0, 0, 9, 7, 0, 0, PS.TAU); g.fill();
    g.fillStyle = '#9d0e1a';
    g.fillRect(-3, -10.5, 6.5, 3.6);
    g.fillRect(-3, 6.9, 6.5, 3.6);
    // Head + cap.
    g.fillStyle = '#e0ac69';
    g.beginPath(); g.arc(1.5, 0, 4.8, 0, PS.TAU); g.fill();
    g.fillStyle = '#14213d';
    g.beginPath(); g.arc(1, 0, 5, Math.PI * 0.55, Math.PI * 1.95); g.fill();
    g.fillRect(3.5, -1.6, 4.5, 3.2);
    if (Player.hasPistol) {
      g.fillStyle = '#111';
      g.fillRect(6, -1.6, 8, 3.2);
    }
    g.restore();
    // Arrest ring.
    if (Player.arrestProgress > 0.15) {
      g.strokeStyle = '#ffd60a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(Player.x, Player.y, 17, -Math.PI / 2, -Math.PI / 2 + (Player.arrestProgress / 2) * PS.TAU);
      g.stroke();
    }
  };

  PS.Player = Player;
})();
