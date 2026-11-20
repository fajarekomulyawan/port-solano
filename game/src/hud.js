// hud.js — everything drawn over the world: health, money, wanted stars,
// weapon, the mission banner and objective line, context prompts, the
// countdown chip, and the minimap with its police blips.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};

  var el = {};
  var bannerTimer = null;
  var flashTimer = null;
  var last = {};

  var HUD = {};

  HUD.init = function () {
    var ids = ['hud', 'healthFill', 'money', 'stars', 'weapon', 'banner', 'bannerTitle', 'bannerSub',
      'objective', 'objTitle', 'objText', 'prompt', 'timer', 'flash', 'minimap', 'missionChip', 'arrestBar', 'arrestFill'];
    for (var i = 0; i < ids.length; i++) el[ids[i]] = document.getElementById(ids[i]);
    el.mapCtx = el.minimap ? el.minimap.getContext('2d') : null;
  };

  HUD.setVisible = function (v) {
    if (el.hud) el.hud.style.display = v ? 'block' : 'none';
  };

  HUD.showBanner = function (title, sub) {
    if (!el.banner) return;
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.banner.classList.remove('show'); }, 3800);
  };

  HUD.flashMessage = function (msg) {
    if (!el.flash) return;
    el.flash.textContent = msg;
    el.flash.classList.add('show');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.flash.classList.remove('show'); }, 2400);
  };

  function fmtMoney(n) {
    var s = String(Math.abs(n));
    var out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return '$' + s + out;
  }

  function setText(node, key, text) {
    if (last[key] !== text) { last[key] = text; node.textContent = text; }
  }

  HUD.update = function () {
    if (!el.hud) return;
    var p = PS.Player, M = PS.Missions, Pol = PS.Police;

    // Health.
    var hp = PS.clamp(p.health, 0, 100);
    el.healthFill.style.width = hp + '%';
    el.healthFill.style.background = hp > 45 ? '#57cc5e' : (hp > 22 ? '#ffb703' : '#e63946');
    setText(el.money, 'money', fmtMoney(p.money));

    // Wanted stars; they pulse while the trail goes cold.
    var stars = Pol.stars();
    var starStr = '';
    for (var i = 0; i < 5; i++) starStr += i < stars ? '★' : '☆';
    setText(el.stars, 'stars', starStr);
    el.stars.style.opacity = (stars > 0 && Pol.unseenT > 1.5) ? (0.45 + 0.35 * Math.sin(PS.state.time * 7)) : 1;
    el.stars.style.color = stars > 0 ? '#ffd60a' : 'rgba(255,255,255,0.35)';

    setText(el.weapon, 'weapon', p.hasPistol ? 'PISTOL · ' + p.ammo : 'FISTS');

    // Objective line (+ distance to the marker).
    var obj = M.objective();
    var text = obj.text;
    var mp = M.activeMarker;
    if (mp && obj.text) {
      var d = Math.round(PS.dist(p.x, p.y, mp.x, mp.y) / 10);
      text += '  ·  ' + d + 'm';
    }
    setText(el.objTitle, 'objTitle', obj.title);
    setText(el.objText, 'objText', text);
    el.objective.style.display = obj.text ? 'block' : 'none';

    // Countdown / mission chips.
    if (M.timer !== null && M.timer !== undefined && M.stage !== 'done') {
      var secs = Math.max(0, Math.ceil(M.timer));
      el.timer.style.display = 'block';
      setText(el.timer, 'timer', Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2));
      el.timer.style.color = secs <= 20 ? '#ff5d73' : '#ffffff';
    } else {
      el.timer.style.display = 'none';
    }
    if (M.current === 2 && M.stage === 'deliver') {
      el.missionChip.style.display = 'block';
      setText(el.missionChip, 'chip', 'PACKAGE ON BOARD');
    } else if (M.current === 3 && M.van) {
      el.missionChip.style.display = 'block';
      setText(el.missionChip, 'chip', 'VAN ARMOR ' + Math.max(0, Math.ceil(M.van.health / M.van.maxHealth * 100)) + '%');
    } else if (M.current === 4 && M.stage === 'escape') {
      el.missionChip.style.display = 'block';
      setText(el.missionChip, 'chip', 'BRIEFCASE ON BOARD');
    } else {
      el.missionChip.style.display = 'none';
    }

    // Arrest progress.
    if (p.arrestProgress > 0.05 && !p.inCar) {
      el.arrestBar.style.display = 'block';
      el.arrestFill.style.width = PS.clamp(p.arrestProgress / 2 * 100, 0, 100) + '%';
    } else {
      el.arrestBar.style.display = 'none';
    }

    // Context prompt.
    var prompt = '';
    if (p.state === 'playing') {
      if (p.inCar) {
        if (Math.abs(p.car.speed) < 20) prompt = 'E — get out · WASD — drive · SPACE — handbrake';
      } else {
        var near = PS.Vehicles.nearestEnterable(p.x, p.y, 54);
        if (near) prompt = 'Press E to ' + (near.driver === 'parked' ? 'steal the ' : 'take the ') + near.type;
        else if (M.current === 2 && M.stage === 'pickup' && PS.dist(p.x, p.y, PS.City.landmarks.plazaPackage.x, PS.City.landmarks.plazaPackage.y) < 90) prompt = 'Walk to the glowing marker to grab the package';
        else if (M.current === 4 && M.stage === 'pickup' && PS.dist(p.x, p.y, PS.City.landmarks.docksOffice.x, PS.City.landmarks.docksOffice.y) < 110) prompt = 'Walk to the marker to take the briefcase';
      }
    }
    setText(el.prompt, 'prompt', prompt);
    el.prompt.style.display = prompt ? 'block' : 'none';

    drawMinimap();
  };

  function drawMinimap() {
    var g = el.mapCtx;
    if (!g) return;
    var City = PS.City, p = PS.Player;
    var W = el.minimap.width, H = el.minimap.height;
    var sx = W / City.W, sy = H / City.H;
    // Land + sea.
    g.fillStyle = '#79b657';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#eed9a0';
    g.fillRect(0, City.BEACH_Y * sy, W, (City.SEA_Y - City.BEACH_Y) * sy);
    g.fillStyle = '#1b9aaa';
    g.fillRect(0, City.SEA_Y * sy, W, H - City.SEA_Y * sy);
    // Roads.
    g.strokeStyle = 'rgba(30,32,38,0.85)';
    g.lineWidth = 3;
    var i;
    for (i = 0; i < City.VX.length; i++) {
      g.beginPath(); g.moveTo(City.VX[i] * sx, 0); g.lineTo(City.VX[i] * sx, 1905 * sy); g.stroke();
    }
    g.lineWidth = 2.4;
    for (i = 0; i < City.HY.length; i++) {
      g.beginPath(); g.moveTo(0, City.HY[i] * sy); g.lineTo(W, City.HY[i] * sy); g.stroke();
    }
    // Police blips (alternating red/blue, like the lightbar).
    var units = PS.Police.units();
    var phase = Math.floor(PS.state.time * 3) % 2 === 0;
    for (i = 0; i < units.length; i++) {
      g.fillStyle = phase ? '#ff2e4d' : '#2e7bff';
      g.beginPath(); g.arc(units[i].x * sx, units[i].y * sy, 3, 0, PS.TAU); g.fill();
    }
    // Mission marker.
    var mp = PS.Missions.activeMarker;
    if (mp) {
      g.fillStyle = '#ffd60a';
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      var pulse = 3.4 + Math.sin(PS.state.time * 5) * 1.1;
      g.beginPath(); g.arc(mp.x * sx, mp.y * sy, pulse, 0, PS.TAU); g.fill(); g.stroke();
    }
    // Player arrow.
    var px = p.x * sx, py = p.y * sy;
    g.save();
    g.translate(px, py);
    g.rotate(p.angle);
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.beginPath();
    g.moveTo(6, 0); g.lineTo(-4.5, -4); g.lineTo(-4.5, 4);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  PS.HUD = HUD;
})();
