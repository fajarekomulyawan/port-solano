// main.js — Port Solano's boot and heartbeat: input, the camera, the
// effects layer, the game-state machine (title / playing / paused /
// wasted / busted / ending), the main loop, and the deterministic
// ?shot= scenes used to take the entry's screenshots.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};
  var City = PS.City;

  PS.state = { mode: 'title', time: 0, playSeconds: 0 };
  PS.Input = {
    keys: new Set(), pressed: new Set(),
    mouseX: 0, mouseY: 0, mouseDown: false,
    mouseWorldX: 0, mouseWorldY: 0
  };

  var canvas = document.getElementById('game');
  var g = canvas.getContext('2d');
  var camX = 0, camY = 0;
  var frameCount = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- effects ---------------------------------------------------------------
  var fx = { tracers: [], flashes: [], sparks: [], smoke: [], popups: [], swipes: [] };
  PS.FX = {
    tracer: function (x1, y1, x2, y2) { fx.tracers.push({ x1: x1, y1: y1, x2: x2, y2: y2, t: 0.08 }); },
    flash: function (x, y) { fx.flashes.push({ x: x, y: y, t: 0.07 }); },
    sparks: function (x, y, n) {
      for (var i = 0; i < n; i++) {
        var a = PS.randRange(0, PS.TAU), sp = PS.randRange(40, 190);
        fx.sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: PS.randRange(0.15, 0.4) });
      }
    },
    smoke: function (x, y, n) {
      for (var i = 0; i < n; i++) {
        fx.smoke.push({ x: x + PS.randRange(-8, 8), y: y + PS.randRange(-6, 6), r: PS.randRange(5, 10), t: PS.randRange(0.5, 1) });
      }
    },
    popup: function (x, y, text, color) { fx.popups.push({ x: x, y: y, text: text, color: color, t: 1.15 }); },
    swipe: function (x, y, angle) { fx.swipes.push({ x: x, y: y, angle: angle, t: 0.16 }); }
  };
  function updateFX(dt) {
    var i, arr;
    var lists = ['tracers', 'flashes', 'popups', 'swipes'];
    for (var li = 0; li < lists.length; li++) {
      arr = fx[lists[li]];
      for (i = arr.length - 1; i >= 0; i--) { arr[i].t -= dt; if (arr[i].t <= 0) arr.splice(i, 1); }
    }
    for (i = fx.sparks.length - 1; i >= 0; i--) {
      var s = fx.sparks[i];
      s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt;
      if (s.t <= 0) fx.sparks.splice(i, 1);
    }
    for (i = fx.smoke.length - 1; i >= 0; i--) {
      var m = fx.smoke[i];
      m.t -= dt; m.y -= 26 * dt; m.r += 9 * dt;
      if (m.t <= 0) fx.smoke.splice(i, 1);
    }
    for (i = fx.popups.length - 1; i >= 0; i--) fx.popups[i].y -= 30 * dt;
  }
  function drawFX() {
    var i;
    for (i = 0; i < fx.smoke.length; i++) {
      var m = fx.smoke[i];
      g.fillStyle = 'rgba(70,70,78,' + (0.34 * Math.min(1, m.t)) + ')';
      g.beginPath(); g.arc(m.x, m.y, m.r, 0, PS.TAU); g.fill();
    }
    g.strokeStyle = 'rgba(255,240,170,0.9)';
    g.lineWidth = 2;
    for (i = 0; i < fx.tracers.length; i++) {
      var t = fx.tracers[i];
      g.globalAlpha = Math.max(0, t.t / 0.08);
      g.beginPath(); g.moveTo(t.x1, t.y1); g.lineTo(t.x2, t.y2); g.stroke();
    }
    g.globalAlpha = 1;
    for (i = 0; i < fx.flashes.length; i++) {
      var f = fx.flashes[i];
      g.fillStyle = 'rgba(255,210,90,0.85)';
      g.beginPath(); g.arc(f.x, f.y, 7, 0, PS.TAU); g.fill();
    }
    g.fillStyle = '#ffd166';
    for (i = 0; i < fx.sparks.length; i++) {
      var s2 = fx.sparks[i];
      g.fillRect(s2.x - 1.6, s2.y - 1.6, 3.2, 3.2);
    }
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 3;
    for (i = 0; i < fx.swipes.length; i++) {
      var sw = fx.swipes[i];
      g.beginPath(); g.arc(sw.x, sw.y, 24, sw.angle - 0.8, sw.angle + 0.8); g.stroke();
    }
    g.font = 'bold 15px Arial, sans-serif';
    g.textAlign = 'center';
    for (i = 0; i < fx.popups.length; i++) {
      var p = fx.popups[i];
      g.globalAlpha = Math.min(1, p.t);
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 3;
      g.strokeText(p.text, p.x, p.y);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
  }

  // ---- world construction ------------------------------------------------------
  function buildWorld(saveData) {
    PS.Vehicles.list.length = 0;
    PS.Peds.list.length = 0;
    PS.Police.officers.length = 0;
    PS.Police.clearWanted();
    PS.Missions.reset();
    fx.tracers.length = 0; fx.sparks.length = 0; fx.smoke.length = 0; fx.popups.length = 0;
    var start = City.landmarks.playerStart;
    PS.Player.reset(start.x, start.y);
    PS.Vehicles.spawnInitial();
    PS.Peds.spawnInitial();
    if (saveData) {
      var p = PS.Player;
      p.money = saveData.money;
      p.health = PS.clamp(saveData.health, 20, 100);
      p.hasPistol = !!saveData.hasPistol;
      p.ammo = saveData.ammo || 0;
      PS.state.playSeconds = saveData.playSeconds || 0;
      if (!City.circleHitsSolid(saveData.x, saveData.y, 11)) { p.x = saveData.x; p.y = saveData.y; }
      if (saveData.mission >= 1 && saveData.mission <= 4) PS.Missions.startMission(saveData.mission, true);
      else if (saveData.mission >= 5) PS.Missions.current = 5;
    }
  }

  function setMode(mode) {
    PS.state.mode = mode;
    PS.Player.state = mode;
  }

  function showOverlay(id, on) {
    var node = document.getElementById(id);
    if (node) node.classList.toggle('show', !!on);
  }

  function startPlaying() {
    showOverlay('titleScreen', false);
    showOverlay('pauseMenu', false);
    showOverlay('endingCard', false);
    PS.HUD.setVisible(true);
    setMode('playing');
  }

  // ---- game state machine (called from player.js / missions.js) -----------------
  var respawnTimer = null;
  PS.Game = {
    showWasted: function () {
      if (PS.state.mode !== 'playing') return;
      setMode('wasted');
      showOverlay('wastedScreen', true);
      respawnTimer = setTimeout(function () {
        showOverlay('wastedScreen', false);
        var p = PS.Player;
        if (p.inCar && p.car) { p.car.driver = 'parked'; p.inCar = false; p.car = null; }
        p.money = Math.max(0, p.money - 200);
        p.health = 100;
        p.arrestProgress = 0;
        p.x = City.landmarks.hospitalDoor.x;
        p.y = City.landmarks.hospitalDoor.y;
        PS.Police.clearWanted();
        PS.Police.officers.length = 0;
        setMode('playing');
      }, 2600);
    },
    showBusted: function (fine) {
      if (PS.state.mode !== 'playing') return;
      setMode('busted');
      document.getElementById('bustedFine').textContent =
        'The Port Solano PD impounded your pistol and fined you $' + fine + '.';
      showOverlay('bustedScreen', true);
      respawnTimer = setTimeout(function () {
        showOverlay('bustedScreen', false);
        var p = PS.Player;
        if (p.inCar && p.car) { p.car.driver = 'parked'; p.inCar = false; p.car = null; }
        p.health = Math.max(p.health, 55);
        p.arrestProgress = 0;
        p.x = City.landmarks.policeDoor.x;
        p.y = City.landmarks.policeDoor.y;
        PS.Police.clearWanted();
        PS.Police.officers.length = 0;
        setMode('playing');
      }, 2600);
    },
    showEnding: function () {
      setMode('ending');
      var mins = Math.floor(PS.state.playSeconds / 60);
      var secs = Math.floor(PS.state.playSeconds % 60);
      document.getElementById('endingStats').textContent =
        'Marco delivered the briefcase, shook a four-star manhunt and earned Dona Carla\'s trust. ' +
        'Final balance: $' + PS.Player.money + ' · Story time: ' + mins + 'm ' + secs + 's. ' +
        'Port Solano stays open — the streets, the cars and the PD are all yours now.';
      showOverlay('endingCard', true);
    }
  };

  // ---- input ----------------------------------------------------------------------
  window.addEventListener('keydown', function (e) {
    PS.Audio.init();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (!e.repeat) PS.Input.pressed.add(e.code);
    PS.Input.keys.add(e.code);
    if ((e.code === 'Escape' || e.code === 'KeyP') && !shotMode) {
      if (PS.state.mode === 'playing') pauseGame();
      else if (PS.state.mode === 'paused') resumeGame();
    }
    if (e.code === 'KeyM') toggleMute();
  });
  window.addEventListener('keyup', function (e) { PS.Input.keys.delete(e.code); });
  window.addEventListener('blur', function () { PS.Input.keys.clear(); PS.Input.mouseDown = false; });
  canvas.addEventListener('mousemove', function (e) {
    PS.Input.mouseX = e.clientX; PS.Input.mouseY = e.clientY;
  });
  canvas.addEventListener('mousedown', function (e) {
    PS.Audio.init();
    if (e.button === 0) PS.Input.mouseDown = true;
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) PS.Input.mouseDown = false;
  });

  function pauseGame() {
    setMode('paused');
    showOverlay('pauseMenu', true);
    if (PS.Audio) { PS.Audio.engineStop(); PS.Audio.setSiren(false); }
  }
  function resumeGame() {
    showOverlay('pauseMenu', false);
    setMode('playing');
  }
  function toggleMute() {
    var muted = PS.Audio.toggleMute();
    document.getElementById('btnMute').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  }

  // ---- buttons ----------------------------------------------------------------------
  document.getElementById('btnNewGame').addEventListener('click', function () {
    PS.Audio.init();
    buildWorld(null);
    PS.state.playSeconds = 0;
    PS.Missions.beginStory();
    startPlaying();
  });
  document.getElementById('btnContinue').addEventListener('click', function () {
    PS.Audio.init();
    var data = PS.Save.load();
    buildWorld(data);
    startPlaying();
    PS.HUD.flashMessage('Welcome back to Port Solano, Marco.');
  });
  document.getElementById('btnResume').addEventListener('click', resumeGame);
  document.getElementById('btnSaveGame').addEventListener('click', function () {
    var ok = PS.Save.save();
    document.getElementById('saveNote').textContent = ok ? 'Saved. Your story is safe in this browser.' : 'Save failed — storage unavailable.';
    refreshContinue();
  });
  document.getElementById('btnMute').addEventListener('click', toggleMute);
  document.getElementById('btnRestart').addEventListener('click', function () {
    buildWorld(null);
    PS.state.playSeconds = 0;
    PS.Missions.beginStory();
    showOverlay('pauseMenu', false);
    PS.HUD.setVisible(true);
    setMode('playing');
  });
  document.getElementById('btnFreeRoam').addEventListener('click', function () {
    showOverlay('endingCard', false);
    setMode('playing');
  });
  function refreshContinue() {
    document.getElementById('btnContinue').style.display = PS.Save.has() ? '' : 'none';
  }

  // ---- shot scenes -------------------------------------------------------------------
  var shotMode = null;
  // Remove ambient vehicles near a staged car so scenes never spawn overlapped
  // (an overlapped car takes collision damage and can wreck before the shot).
  function clearAround(x, y, r, keep) {
    for (var i = PS.Vehicles.list.length - 1; i >= 0; i--) {
      var c = PS.Vehicles.list[i];
      if (keep && keep(c)) continue;
      if (PS.dist(x, y, c.x, c.y) < r) PS.Vehicles.remove(c);
    }
  }
  function stageShot(name, seed) {
    PS.seedRandom(seed * 7919 + 13);
    buildWorld(null);
    var p = PS.Player;
    var L = City.landmarks;
    if (name === 'cover') {
      PS.Missions.startMission(1, true);
      var car = PS.Vehicles.create('convertible', 330, City.HY[4] + City.LANE, 0, 'player');
      car.color = '#ff5d8f';
      car.speed = 150;
      p.inCar = true; p.car = car; p.x = car.x; p.y = car.y;
      var t1 = PS.Vehicles.create('sedan', 560, City.HY[4] - City.LANE, Math.PI, 'traffic');
      t1.axis = 'h'; t1.c = City.HY[4]; t1.s = 560; t1.dir = -1; t1.cruise = 130; t1.speed = 130;
      var t2 = PS.Vehicles.create('taxi', 120, City.HY[4] + City.LANE, 0, 'traffic');
      t2.axis = 'h'; t2.c = City.HY[4]; t2.s = 120; t2.dir = 1; t2.cruise = 120; t2.speed = 120;
      clearAround(car.x, car.y, 120, function (c) { return c === car || c === t1 || c === t2; });
      PS.HUD.showBanner('MISSION 1 — FIRST WHEELS', 'Steal the red sports car at the beach motel');
    } else if (name === 'chase') {
      PS.Missions.startMission(3, true);
      var ride = PS.Vehicles.create('sports', City.VX[2] + City.LANE, 1150, -Math.PI / 2, 'player');
      ride.color = '#ff7b00';
      ride.speed = 265;
      p.inCar = true; p.car = ride; p.x = ride.x; p.y = ride.y; p.angle = -Math.PI / 2;
      PS.Police.heat = 3;
      var gaps = [130, 215, 305];
      for (var i = 0; i < gaps.length; i++) {
        var cop = PS.Vehicles.create('police', City.VX[2] + City.LANE + (i - 1) * 14, 1150 + gaps[i], -Math.PI / 2, 'police');
        cop.speed = 250;
        cop.ai = { stuckT: 0, reverseT: 0 };
      }
      clearAround(ride.x, ride.y, 380, function (c) { return c.driver === 'player' || c.driver === 'police' || c.type === 'armored'; });
      PS.HUD.showBanner('MISSION 3 — CONVOY TROUBLE', 'Three stars. Half the PD is behind you.');
    } else if (name === 'foot') {
      PS.Missions.startMission(2, true);
      p.x = 1002; p.y = 918; p.angle = PS.angleTo(p.x, p.y, L.plazaPackage.x, L.plazaPackage.y);
      var spots = [[960, 860], [1090, 800], [1140, 905], [985, 770], [1180, 830], [930, 950], [1065, 960], [1125, 745]];
      for (var j = 0; j < spots.length; j++) {
        PS.Peds.list.push({ x: spots[j][0], y: spots[j][1], angle: PS.randRange(0, PS.TAU), speed: 55, state: 'walk', tx: spots[j][0], ty: spots[j][1], shirt: PS.pick(['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#ffffff']), skin: '#e0ac69', phase: j, fleeT: 0, fleeFromX: 0, fleeFromY: 0, downT: 0, retargetT: 5 });
      }
    } else if (name === 'mission') {
      PS.Missions.startMission(2, true);
      PS.Missions.stage = 'deliver';
      PS.Missions.marker = L.warehouseZone;
      PS.Missions.timer = 87;
      PS.Police.heat = 2;
      var sedan = PS.Vehicles.create('sedan', 1740, City.HY[2] + City.LANE, 0, 'player');
      sedan.color = '#3d8bfd';
      sedan.speed = 205;
      p.inCar = true; p.car = sedan; p.x = sedan.x; p.y = sedan.y;
      p.hasPistol = false;
      clearAround(sedan.x, sedan.y, 130, function (c) { return c === sedan; });
      PS.HUD.showBanner('MISSION 2 — HOT PACKAGE', 'Deliver it to the north-east warehouse — the clock is running');
    }
    PS.HUD.setVisible(true);
    setMode('playing');
    showOverlay('titleScreen', false);
  }

  // ---- boot ----------------------------------------------------------------------------
  City.generate();
  PS.HUD.init();
  refreshContinue();
  buildWorld(null);
  var params = new URLSearchParams(window.location.search);
  if (params.get('shot')) {
    shotMode = params.get('shot');
    stageShot(shotMode, parseInt(params.get('seed') || '1', 10) || 1);
  }

  // ---- main loop ---------------------------------------------------------------------------
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    frameCount++;
    var mode = PS.state.mode;
    PS.Player.state = mode;

    if (mode === 'playing') {
      PS.state.time += dt;
      PS.state.playSeconds += dt;
      var p = PS.Player;
      PS.Input.mouseWorldX = PS.Input.mouseX + camX;
      PS.Input.mouseWorldY = PS.Input.mouseY + camY;
      PS.Player.update(dt);
      PS.Vehicles.update(dt);
      PS.Peds.update(dt);
      PS.Police.update(dt);
      PS.Missions.update(dt);
      if (PS.Audio) PS.Audio.update(dt);
      PS.HUD.update();
      // Camera follows Marco (or his car).
      var tx = (p.inCar && p.car ? p.car.x : p.x) - canvas.width / 2;
      var ty = (p.inCar && p.car ? p.car.y : p.y) - canvas.height / 2;
      camX = PS.clamp(tx, 0, Math.max(0, City.W - canvas.width));
      camY = PS.clamp(ty, 0, Math.max(0, City.H - canvas.height));
    } else {
      // Title / overlays: slow drift over downtown.
      PS.state.time += dt;
      camX = 760 + Math.sin(PS.state.time * 0.05) * 120;
      camY = 620 + Math.cos(PS.state.time * 0.04) * 80;
    }
    updateFX(dt);
    render();
    PS.Input.pressed.clear();
    if (shotMode && frameCount > 40 && !window.__shotReady) window.__shotReady = true;
  }

  function render() {
    var vw = canvas.width, vh = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1b9aaa';
    g.fillRect(0, 0, vw, vh);
    City.draw(g, Math.floor(camX), Math.floor(camY), vw, vh);
    g.save();
    g.translate(-Math.floor(camX), -Math.floor(camY));
    City.drawDynamic(g, camX, camY, vw, vh, PS.state.time);
    PS.Missions.drawMarker(g, PS.state.time);
    PS.Peds.draw(g, camX, camY, vw, vh);
    PS.Vehicles.draw(g, camX, camY, vw, vh, PS.state.time);
    PS.Police.drawOfficers(g, camX, camY, vw, vh);
    PS.Player.draw(g);
    drawFX();
    City.drawCanopy(g, camX, camY, vw, vh);
    g.restore();
    // Hurt vignette.
    if (PS.Player.hurtFlash > 0.01) {
      var grad = g.createRadialGradient(vw / 2, vh / 2, vh * 0.32, vw / 2, vh / 2, vh * 0.75);
      grad.addColorStop(0, 'rgba(180,0,20,0)');
      grad.addColorStop(1, 'rgba(180,0,20,' + PS.Player.hurtFlash + ')');
      g.fillStyle = grad;
      g.fillRect(0, 0, vw, vh);
    }
    if (PS.state.mode === 'wasted') {
      g.fillStyle = 'rgba(60,0,0,0.25)';
      g.fillRect(0, 0, vw, vh);
    }
  }

  requestAnimationFrame(frame);
})();
