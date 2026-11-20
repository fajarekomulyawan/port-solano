// missions.js — Dona Carla's jobs: a four-mission story chain that tours
// the whole city (motel, plaza, the north street, the docks), teaches every
// system (stealing, timed delivery under heat, ramming, escaping a
// four-star manhunt) and pays for Marco's progression.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};
  var City = PS.City;
  var L = City.landmarks;

  var TITLES = {
    1: 'First Wheels',
    2: 'Hot Package',
    3: 'Convoy Trouble',
    4: 'Harbour Heat'
  };

  var Missions = {
    current: 0,        // 0 none, 1-4 active, 5 story complete
    stage: '',
    marker: null,      // {x, y} or a function returning one
    timer: null,       // seconds left, or null
    targetCar: null,
    van: null,
    startT: 0
  };

  function banner(title, sub) { if (PS.HUD) PS.HUD.showBanner(title, sub); }
  function objectiveFlash(msg) { if (PS.HUD) PS.HUD.flashMessage(msg); }

  Missions.reset = function () {
    if (Missions.targetCar) { PS.Vehicles.remove(Missions.targetCar); Missions.targetCar = null; }
    if (Missions.van) { PS.Vehicles.remove(Missions.van); Missions.van = null; }
    Missions.current = 0;
    Missions.stage = '';
    Missions.marker = null;
    Missions.timer = null;
    Missions.startT = 0;
  };

  Missions.beginStory = function () {
    Missions.startMission(1, true);
    banner('PORT SOLANO', 'Dona Carla, by phone: "Marco. You drive, I pay. First job — I need wheels."');
  };

  Missions.startMission = function (n, silent) {
    var V = PS.Vehicles;
    Missions.current = n;
    Missions.timer = null;
    if (n === 1) {
      Missions.stage = 'steal';
      if (!Missions.targetCar || Missions.targetCar.wrecked) {
        Missions.targetCar = V.create('sports', L.motelCarSpot.x, L.motelCarSpot.y, 0, 'parked');
        Missions.targetCar.color = '#d90429';
      }
      Missions.marker = function () { return Missions.targetCar; };
      if (!silent) banner('MISSION 1 — FIRST WHEELS', 'Steal the red sports car at the beach motel and deliver it to the docks.');
    } else if (n === 2) {
      Missions.stage = 'pickup';
      Missions.marker = L.plazaPackage;
      if (!silent) banner('MISSION 2 — HOT PACKAGE', 'Pick up the package at the plaza fountain. Careful — it is hot.');
    } else if (n === 3) {
      Missions.stage = 'chase';
      spawnVan();
      Missions.marker = function () { return Missions.van; };
      if (!silent) banner('MISSION 3 — CONVOY TROUBLE', 'An armored van is crossing the north street. Wreck it before it reaches the depot.');
    } else if (n === 4) {
      Missions.stage = 'pickup';
      Missions.marker = L.docksOffice;
      if (!silent) banner('MISSION 4 — HARBOUR HEAT', 'Take the briefcase from the marina office to the boat. Expect company.');
    }
  };

  function spawnVan() {
    if (Missions.van) PS.Vehicles.remove(Missions.van);
    Missions.van = PS.Vehicles.create('armored', 250, City.HY[0] + City.LANE, 0, 'mission');
    Missions.van.color = '#495057';
  }

  function completeMission(reward, extra) {
    var n = Missions.current;
    PS.Player.addMoney(reward);
    if (extra) extra();
    if (PS.Audio) PS.Audio.jingle();
    banner('MISSION COMPLETE', TITLES[n] + ' — $' + reward + ' earned');
    Missions.stage = 'done';
    Missions.marker = null;
    Missions.timer = null;
    Missions.startT = 3.2;
    if (PS.Save) PS.Save.save();
  }

  function failMission(msg) {
    if (PS.Audio) PS.Audio.fail();
    banner('MISSION FAILED', msg);
    if (Missions.current === 2) {
      Missions.stage = 'pickup';
      Missions.marker = L.plazaPackage;
      Missions.timer = null;
    } else if (Missions.current === 3) {
      spawnVan();
      objectiveFlash('The convoy is re-routing — hit the new van!');
    }
  }

  // Called from vehicles.js when the player rams something armored.
  Missions.onVanHit = function (impact) {
    if (Missions.current !== 3 || !Missions.van) return;
    PS.Vehicles.damage(Missions.van, impact * 0.05);
    if (PS.FX) PS.FX.popup(Missions.van.x, Missions.van.y - 34, 'HIT!', '#ffd60a');
  };
  // Bullets already damage the van in player.js; this is just feedback.
  Missions.onVanShot = function () {
    if (Missions.current === 3 && Missions.van && PS.FX) {
      PS.FX.popup(Missions.van.x, Missions.van.y - 34, 'PLINK', '#ced4da');
    }
  };

  function markerPos() {
    if (!Missions.marker) return null;
    return typeof Missions.marker === 'function' ? Missions.marker() : Missions.marker;
  }

  Missions.objective = function () {
    var p = PS.Player;
    var n = Missions.current, s = Missions.stage;
    if (n === 0) return { title: '', text: '' };
    if (n === 5) return { title: 'FREE ROAM', text: 'The city is yours, Marco. Earn, explore, stay out of jail.' };
    if (s === 'done') return { title: TITLES[n], text: 'Job done. Dona Carla will call with more work…' };
    if (n === 1 && s === 'steal') return { title: TITLES[1], text: 'Steal the red sports car at the beach motel' };
    if (n === 1 && s === 'deliver') return { title: TITLES[1], text: 'Deliver the car to the docks garage, east side' };
    if (n === 2 && s === 'pickup') return { title: TITLES[2], text: 'Pick up the package at the plaza fountain' };
    if (n === 2 && s === 'deliver') return { title: TITLES[2], text: 'Deliver the package to the north-east warehouse — fast!' };
    if (n === 3) return { title: TITLES[3], text: 'Wreck the armored van before it reaches the depot' };
    if (n === 4 && s === 'pickup') return { title: TITLES[4], text: 'Take the briefcase from the marina office at the docks' };
    if (n === 4 && s === 'escape') {
      if (PS.Police.stars() > 0) return { title: TITLES[4], text: 'Lose the police, then reach the boat at the pier' };
      return { title: TITLES[4], text: 'Clear! Get to the boat at the end of the docks pier' };
    }
    return { title: TITLES[n] || '', text: '' };
  };

  Missions.update = function (dt) {
    var p = PS.Player;
    var n = Missions.current;
    if (n === 0 || n === 5) return;
    if (Missions.stage === 'done') {
      Missions.startT -= dt;
      if (Missions.startT <= 0) {
        if (n >= 4) {
          Missions.current = 5;
          Missions.stage = '';
          if (PS.Game) PS.Game.showEnding();
          if (PS.Save) PS.Save.save();
        } else {
          Missions.startMission(n + 1, false);
        }
      }
      return;
    }
    var mp = markerPos();

    if (n === 1) {
      if (Missions.stage === 'steal') {
        if (!Missions.targetCar || Missions.targetCar.wrecked) {
          Missions.targetCar = PS.Vehicles.create('sports', L.motelCarSpot.x, L.motelCarSpot.y, 0, 'parked');
          Missions.targetCar.color = '#d90429';
        } else if (p.inCar && p.car === Missions.targetCar) {
          Missions.stage = 'deliver';
          Missions.marker = L.docksZone;
          objectiveFlash('Good. Now deliver it to the docks garage.');
          if (PS.Audio) PS.Audio.pickup();
        }
      } else if (Missions.stage === 'deliver') {
        if (p.inCar && p.car === Missions.targetCar && PS.dist(p.x, p.y, L.docksZone.x, L.docksZone.y) < 78) {
          // The fixer takes the car off your hands.
          var car = Missions.targetCar;
          p.exitCar();
          PS.Vehicles.remove(car);
          Missions.targetCar = null;
          completeMission(500);
        }
      }
    } else if (n === 2) {
      if (Missions.stage === 'pickup') {
        if (!p.inCar && PS.dist(p.x, p.y, L.plazaPackage.x, L.plazaPackage.y) < 32) {
          Missions.stage = 'deliver';
          Missions.marker = L.warehouseZone;
          Missions.timer = 120;
          PS.Police.setWanted(2);
          if (PS.Audio) PS.Audio.pickup();
          objectiveFlash('Package secured — the police are on you! Move!');
        }
      } else if (Missions.stage === 'deliver') {
        Missions.timer -= dt;
        if (Missions.timer <= 0) { failMission('The buyer gave up waiting. The package is still at the plaza.'); return; }
        if (PS.dist(p.x, p.y, L.warehouseZone.x, L.warehouseZone.y) < 78) {
          completeMission(800, function () {
            p.hasPistol = true;
            p.ammo += 60;
            objectiveFlash('Dona Carla left you a pistol. Mouse aims, click fires.');
          });
        }
      }
    } else if (n === 3) {
      var van = Missions.van;
      if (!van) { spawnVan(); van = Missions.van; }
      // The van driver holds the eastbound lane of the north street.
      var desired = PS.clamp((City.HY[0] + City.LANE - van.y) * 0.012, -0.35, 0.35);
      van.input.throttle = van.wrecked ? 0 : 0.9;
      van.input.steer = PS.clamp(PS.angleDiff(van.angle, desired) * 2.6, -1, 1);
      van.input.brake = false;
      if (van.wrecked || van.health <= 0) {
        completeMission(1200, function () { p.ammo += 24; });
        Missions.van = null;
      } else if (van.x > 2840) {
        failMission('The van reached the depot. Another convoy is rolling — stop it this time.');
      }
    } else if (n === 4) {
      if (Missions.stage === 'pickup') {
        if (!p.inCar && PS.dist(p.x, p.y, L.docksOffice.x, L.docksOffice.y) < 34) {
          Missions.stage = 'escape';
          Missions.marker = L.boat;
          PS.Police.setWanted(4);
          if (PS.Audio) PS.Audio.pickup();
          objectiveFlash('Briefcase in hand — every cop in Solano is coming!');
        }
      } else if (Missions.stage === 'escape') {
        if (PS.Police.stars() === 0 && PS.dist(p.x, p.y, L.boat.x, L.boat.y) < 105) {
          completeMission(2000);
        }
      }
    }
    // Keep marker position fresh for HUD distance readout.
    Missions.activeMarker = mp;
  };

  // The beacon of light + bouncing chevron every open-world game needs.
  Missions.drawMarker = function (g, t) {
    var mp = markerPos();
    if (!mp || Missions.stage === 'done' || Missions.current === 0 || Missions.current === 5) return;
    var pulse = 0.72 + Math.sin(t * 4) * 0.28;
    var grad = g.createLinearGradient(0, mp.y - 170, 0, mp.y);
    grad.addColorStop(0, 'rgba(255,214,10,0)');
    grad.addColorStop(1, 'rgba(255,214,10,' + (0.4 * pulse) + ')');
    g.fillStyle = grad;
    g.fillRect(mp.x - 13, mp.y - 170, 26, 170);
    g.fillStyle = 'rgba(255,214,10,' + (0.35 + 0.3 * pulse) + ')';
    g.beginPath(); g.ellipse(mp.x, mp.y, 24 + 5 * pulse, 11 + 2 * pulse, 0, 0, PS.TAU); g.fill();
    var bob = Math.sin(t * 3.2) * 6;
    g.fillStyle = '#ffd60a';
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(mp.x, mp.y - 118 + bob);
    g.lineTo(mp.x - 13, mp.y - 138 + bob);
    g.lineTo(mp.x + 13, mp.y - 138 + bob);
    g.closePath();
    g.fill(); g.stroke();
  };

  PS.Missions = Missions;
})();
