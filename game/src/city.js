// city.js — Port Solano itself: a procedural sun-soaked coastal city.
// Avenues run north-south, streets east-west, the sea fills the south edge
// behind a beach and a palm-lined promenade. The whole static city is
// rendered once onto an offscreen canvas; per-frame work is just a blit
// plus a little animated water. Also owns every collision query.
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};

  var City = {
    W: 3200,
    H: 2400,
    SEA_Y: 2050,      // water starts here
    BEACH_Y: 1960,    // sand starts here
    ROAD_HALF: 55,
    LANE: 27,
    VX: [300, 800, 1300, 1800, 2300, 2800],   // avenue centre lines (x)
    HY: [250, 650, 1050, 1450, 1830],          // street centre lines (y)
    buildings: [],
    palms: [],
    piers: [
      { x: 2920, y: 1930, w: 180, h: 360 },    // docks pier, reaches into the sea
      { x: 420, y: 1930, w: 110, h: 240 }      // west fishing pier
    ],
    landmarks: {
      hospitalDoor: { x: 738, y: 450 },
      policeDoor: { x: 1876, y: 450 },
      motel: { x: 550, y: 1640 },
      motelCarSpot: { x: 560, y: 1812 },
      plazaPackage: { x: 1050, y: 895 },
      fountain: { x: 1050, y: 850 },
      warehouseZone: { x: 2550, y: 450 },
      docksZone: { x: 3000, y: 1640 },
      docksOffice: { x: 2985, y: 1560 },
      depot: { x: 2900, y: 277 },
      boat: { x: 3010, y: 2240 },
      playerStart: { x: 620, y: 1790 }
    }
  };

  // Block ranges between roads (pavement edges), used for generation.
  var BLOCK_X = [[8, 245], [355, 745], [855, 1245], [1355, 1745], [1855, 2245], [2355, 2745], [2855, 3192]];
  var BLOCK_Y = [[8, 195], [305, 595], [705, 995], [1105, 1395], [1505, 1775]];

  var PASTELS = ['#f6c390', '#f2a65a', '#e88ca0', '#a8d5ba', '#8ecae6', '#f9dc5c',
    '#ffb4a2', '#b5838d', '#90be6d', '#f9844a', '#cdb4db', '#ffc8dd', '#a2d2ff'];
  var ROOF_DARK = 'rgba(0,0,0,0.16)';

  var staticCanvas = null;

  function blockKey(xi, yi) { return xi + ',' + yi; }
  var SPECIAL = {
    '2,2': 'plaza',
    '3,1': 'park',
    '1,1': 'hospital',
    '4,1': 'police',
    '5,1': 'warehouse',
    '1,4': 'motel',
    '6,4': 'docks'
  };

  function addBuilding(x, y, w, h, color, kind) {
    City.buildings.push({ x: x, y: y, w: w, h: h, color: color, kind: kind || 'block' });
  }

  City.generate = function () {
    var rng = PS.mulberry32(777); // the city is the same on every run
    var R = function (a, b) { return a + rng() * (b - a); };
    City.buildings.length = 0;
    City.palms.length = 0;

    for (var yi = 0; yi < BLOCK_Y.length; yi++) {
      for (var xi = 0; xi < BLOCK_X.length; xi++) {
        var bx = BLOCK_X[xi][0] + 14, bx2 = BLOCK_X[xi][1] - 14;
        var by = BLOCK_Y[yi][0] + 14, by2 = BLOCK_Y[yi][1] - 14;
        var kind = SPECIAL[blockKey(xi, yi)];
        if (kind === 'plaza' || kind === 'park') continue; // open ground
        if (kind === 'hospital') { addBuilding(bx + 30, by + 20, 300, 230, '#f4f6f6', 'hospital'); continue; }
        if (kind === 'police') { addBuilding(bx + 40, by + 20, 290, 230, '#5d7a99', 'police'); continue; }
        if (kind === 'warehouse') { addBuilding(bx + 20, by + 25, 330, 220, '#8d99ae', 'warehouse'); continue; }
        if (kind === 'motel') {
          addBuilding(bx + 10, by + 90, 340, 90, '#2a9d8f', 'motel');
          addBuilding(bx + 10, by + 10, 120, 60, '#e9c46a', 'motel-office');
          continue;
        }
        if (kind === 'docks') {
          addBuilding(bx + 30, by + 120, 260, 130, '#7f5539', 'warehouse');
          addBuilding(bx + 180, by + 10, 120, 80, '#606c38', 'office');
          continue;
        }
        // Generic block: subdivide into 1-4 buildings with gaps.
        var cols = (bx2 - bx) > 300 ? 2 : 1;
        var rows = (by2 - by) > 240 ? 2 : 1;
        var cw = (bx2 - bx) / cols, ch = (by2 - by) / rows;
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            if (rng() < 0.12) continue; // occasional parking gap
            var gx = bx + c * cw, gy = by + r * ch;
            var w = cw - R(26, 54), h = ch - R(26, 54);
            var x = gx + (cw - w) / 2, y = gy + (ch - h) / 2;
            addBuilding(x, y, w, h, PASTELS[Math.floor(rng() * PASTELS.length)], rng() < 0.3 ? 'shop' : 'block');
          }
        }
      }
    }

    // Palms: promenade row, plaza corners, park clusters, motel front.
    var px, i;
    for (px = 90; px < 3150; px += 128) {
      if (px > 2880 && px < 3160) continue; // keep the docks frontage clear
      City.palms.push({ x: px + R(-8, 8), y: 1922 + R(-5, 5), s: R(0.85, 1.2) });
    }
    var plazaPalms = [[880, 730], [1220, 730], [880, 970], [1220, 970], [1050, 722]];
    for (i = 0; i < plazaPalms.length; i++) City.palms.push({ x: plazaPalms[i][0], y: plazaPalms[i][1], s: 1 });
    for (i = 0; i < 16; i++) City.palms.push({ x: R(1390, 1710), y: R(340, 560), s: R(0.8, 1.25) });
    for (i = 0; i < 5; i++) City.palms.push({ x: 390 + i * 80, y: 1560, s: R(0.9, 1.1) });

    renderStatic(R);
  };

  // ---- geometry queries -----------------------------------------------------
  City.isRoad = function (x, y) {
    var i;
    if (y < City.BEACH_Y + 40) {
      for (i = 0; i < City.VX.length; i++) if (Math.abs(x - City.VX[i]) <= City.ROAD_HALF) return true;
    }
    for (i = 0; i < City.HY.length; i++) if (Math.abs(y - City.HY[i]) <= City.ROAD_HALF) return true;
    return false;
  };
  City.onPier = function (x, y) {
    for (var i = 0; i < City.piers.length; i++) {
      var p = City.piers[i];
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
    }
    return false;
  };
  City.isWater = function (x, y) { return y >= City.SEA_Y && !City.onPier(x, y); };
  City.inBuilding = function (x, y, pad) {
    pad = pad || 0;
    for (var i = 0; i < City.buildings.length; i++) {
      var b = City.buildings[i];
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
    }
    return null;
  };
  City.pointBlocked = function (x, y) {
    if (x < 12 || x > City.W - 12 || y < 12 || y > City.H - 12) return true;
    if (City.inBuilding(x, y, 1)) return true;
    if (City.isWater(x, y)) return true;
    var f = City.landmarks.fountain;
    if (PS.dist(x, y, f.x, f.y) < 30) return true;
    for (var i = 0; i < City.palms.length; i++) {
      var p = City.palms[i];
      if (Math.abs(p.x - x) < 10 && Math.abs(p.y - y) < 10 && PS.dist(x, y, p.x, p.y) < 8) return true;
    }
    return false;
  };
  City.circleHitsSolid = function (x, y, r) {
    if (City.pointBlocked(x, y)) return true;
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * PS.TAU;
      if (City.pointBlocked(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
    }
    return false;
  };
  // A random drivable point on a road lane, roughly between minD and maxD from (x, y).
  City.roadPointNear = function (x, y, minD, maxD) {
    for (var t = 0; t < 30; t++) {
      var vertical = PS.chance(0.5);
      var px, py;
      if (vertical) {
        var cx = PS.pick(City.VX);
        px = cx + (PS.chance(0.5) ? City.LANE : -City.LANE);
        py = PS.randRange(60, 1860);
      } else {
        var cy = PS.pick(City.HY);
        py = cy + (PS.chance(0.5) ? City.LANE : -City.LANE);
        px = PS.randRange(60, 3140);
      }
      var d = PS.dist(x, y, px, py);
      if (d >= minD && d <= maxD) return { x: px, y: py };
    }
    return { x: 1300, y: 1050 };
  };
  // A random walkable off-road point (sidewalk, plaza, park, beach) near (x, y).
  City.walkPointNear = function (x, y, minD, maxD) {
    for (var t = 0; t < 30; t++) {
      var a = PS.randRange(0, PS.TAU), d = PS.randRange(minD, maxD);
      var px = PS.clamp(x + Math.cos(a) * d, 30, City.W - 30);
      var py = PS.clamp(y + Math.sin(a) * d, 30, City.BEACH_Y + 60);
      if (!City.pointBlocked(px, py) && !City.isRoad(px, py)) return { x: px, y: py };
    }
    return { x: 1050, y: 900 };
  };

  // ---- static rendering -------------------------------------------------------
  function renderStatic(R) {
    staticCanvas = document.createElement('canvas');
    staticCanvas.width = City.W;
    staticCanvas.height = City.H;
    var g = staticCanvas.getContext('2d');

    // Base: warm grass.
    g.fillStyle = '#8fbf6f';
    g.fillRect(0, 0, City.W, City.H);

    // Block pavements.
    g.fillStyle = '#d8d2c2';
    for (var yi = 0; yi < BLOCK_Y.length; yi++) {
      for (var xi = 0; xi < BLOCK_X.length; xi++) {
        g.fillRect(BLOCK_X[xi][0], BLOCK_Y[yi][0], BLOCK_X[xi][1] - BLOCK_X[xi][0], BLOCK_Y[yi][1] - BLOCK_Y[yi][0]);
      }
    }
    // Park: richer grass + crossing paths.
    g.fillStyle = '#79b657';
    g.fillRect(1355, 305, 390, 290);
    g.fillStyle = '#d8d2c2';
    g.fillRect(1355, 435, 390, 26);
    g.fillRect(1537, 305, 26, 290);
    // Plaza: warm tiles + border.
    g.fillStyle = '#e8dcc0';
    g.fillRect(855, 705, 390, 290);
    g.strokeStyle = '#c9b586';
    g.lineWidth = 4;
    g.strokeRect(859, 709, 382, 282);
    g.strokeStyle = 'rgba(160,130,80,0.35)';
    g.lineWidth = 1;
    for (var tx = 885; tx < 1245; tx += 30) { g.beginPath(); g.moveTo(tx, 705); g.lineTo(tx, 995); g.stroke(); }
    for (var ty = 735; ty < 995; ty += 30) { g.beginPath(); g.moveTo(855, ty); g.lineTo(1245, ty); g.stroke(); }
    // Motel pool.
    g.fillStyle = '#39c2d7';
    g.fillRect(395, 1545, 110, 56);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.strokeRect(395, 1545, 110, 56);

    // Beach + sea.
    g.fillStyle = '#eed9a0';
    g.fillRect(0, City.BEACH_Y, City.W, City.SEA_Y - City.BEACH_Y);
    var seaGrad = g.createLinearGradient(0, City.SEA_Y, 0, City.H);
    seaGrad.addColorStop(0, '#2bb3a3');
    seaGrad.addColorStop(0.25, '#1b9aaa');
    seaGrad.addColorStop(1, '#0f5e73');
    g.fillStyle = seaGrad;
    g.fillRect(0, City.SEA_Y, City.W, City.H - City.SEA_Y);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, City.SEA_Y, City.W, 4);
    // Sea sparkle flecks (static layer; animated ones come on top).
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (var si = 0; si < 260; si++) {
      g.fillRect(R(10, City.W - 40), R(City.SEA_Y + 14, City.H - 16), R(14, 42), 2.5);
    }

    // Piers: wooden planks over the water.
    for (var pi = 0; pi < City.piers.length; pi++) {
      var pier = City.piers[pi];
      g.fillStyle = '#a98467';
      g.fillRect(pier.x, pier.y, pier.w, pier.h);
      g.strokeStyle = 'rgba(90,60,35,0.5)';
      g.lineWidth = 2;
      for (var py2 = pier.y + 12; py2 < pier.y + pier.h; py2 += 16) {
        g.beginPath(); g.moveTo(pier.x, py2); g.lineTo(pier.x + pier.w, py2); g.stroke();
      }
      g.strokeStyle = '#7a5c3e';
      g.lineWidth = 5;
      g.strokeRect(pier.x, pier.y, pier.w, pier.h);
    }
    // The waiting boat at the docks pier.
    var boat = City.landmarks.boat;
    g.save();
    g.translate(boat.x, boat.y);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(4, 8, 46, 20, 0, 0, PS.TAU); g.fill();
    g.fillStyle = '#f4f1de';
    g.beginPath();
    g.moveTo(-52, 0); g.lineTo(-30, -15); g.lineTo(34, -15); g.lineTo(54, 0); g.lineTo(34, 15); g.lineTo(-30, 15);
    g.closePath(); g.fill();
    g.fillStyle = '#e63946';
    g.fillRect(-30, -4, 64, 8);
    g.fillStyle = '#457b9d';
    g.fillRect(-6, -13, 22, 10);
    g.restore();

    // Roads: sidewalk apron then asphalt.
    g.fillStyle = '#cfc9ba';
    var i, c;
    for (i = 0; i < City.VX.length; i++) g.fillRect(City.VX[i] - City.ROAD_HALF - 13, 0, (City.ROAD_HALF + 13) * 2, 1905);
    for (i = 0; i < City.HY.length; i++) g.fillRect(0, City.HY[i] - City.ROAD_HALF - 13, City.W, (City.ROAD_HALF + 13) * 2);
    g.fillStyle = '#3f434a';
    for (i = 0; i < City.VX.length; i++) g.fillRect(City.VX[i] - City.ROAD_HALF, 0, City.ROAD_HALF * 2, 1905);
    for (i = 0; i < City.HY.length; i++) g.fillRect(0, City.HY[i] - City.ROAD_HALF, City.W, City.ROAD_HALF * 2);
    // Promenade along the beach.
    g.fillStyle = '#e3d7b8';
    g.fillRect(0, 1885, City.W, 75);

    // Lane dashes (centre lines).
    g.fillStyle = '#f7d154';
    for (i = 0; i < City.VX.length; i++) {
      for (c = 16; c < 1890; c += 44) g.fillRect(City.VX[i] - 2, c, 4, 24);
    }
    for (i = 0; i < City.HY.length; i++) {
      for (c = 16; c < 3180; c += 44) g.fillRect(c, City.HY[i] - 2, 24, 4);
    }
    // Crosswalks at intersections.
    g.fillStyle = 'rgba(240,240,240,0.75)';
    for (var a = 0; a < City.VX.length; a++) {
      for (var b = 0; b < City.HY.length; b++) {
        var ix = City.VX[a], iy = City.HY[b];
        for (var s = -40; s <= 40; s += 16) {
          g.fillRect(ix + s - 5, iy - City.ROAD_HALF - 10, 10, 7);
          g.fillRect(ix + s - 5, iy + City.ROAD_HALF + 3, 10, 7);
          g.fillRect(ix - City.ROAD_HALF - 10, iy + s - 5, 7, 10);
          g.fillRect(ix + City.ROAD_HALF + 3, iy + s - 5, 7, 10);
        }
      }
    }

    // Buildings: shadow, roof, inner detail.
    for (i = 0; i < City.buildings.length; i++) {
      var bd = City.buildings[i];
      g.fillStyle = 'rgba(60,40,20,0.22)';
      g.fillRect(bd.x + 9, bd.y + 12, bd.w, bd.h);
      g.fillStyle = bd.color;
      g.fillRect(bd.x, bd.y, bd.w, bd.h);
      g.fillStyle = ROOF_DARK;
      g.fillRect(bd.x, bd.y + bd.h - 10, bd.w, 10);
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 2;
      g.strokeRect(bd.x + 1, bd.y + 1, bd.w - 2, bd.h - 2);
      g.fillStyle = 'rgba(255,255,255,0.20)';
      g.fillRect(bd.x + 8, bd.y + 8, bd.w - 16, bd.h - 26);
      if (bd.kind === 'shop') {
        g.fillStyle = '#e63946';
        g.fillRect(bd.x, bd.y + bd.h - 22, bd.w, 12);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (var aw = bd.x + 6; aw < bd.x + bd.w - 8; aw += 18) g.fillRect(aw, bd.y + bd.h - 22, 9, 12);
      }
      if (bd.kind === 'warehouse') {
        g.fillStyle = 'rgba(255,255,255,0.25)';
        for (var sk = bd.x + 18; sk < bd.x + bd.w - 20; sk += 34) g.fillRect(sk, bd.y + 14, 18, bd.h - 40);
      }
      if (bd.kind === 'hospital') {
        g.fillStyle = '#d90429';
        var hx = bd.x + bd.w / 2, hy2 = bd.y + bd.h / 2;
        g.fillRect(hx - 12, hy2 - 38, 24, 76);
        g.fillRect(hx - 38, hy2 - 12, 76, 24);
        label(g, 'HOSPITAL', bd.x + bd.w / 2, bd.y + 26, '#4361ee');
      }
      if (bd.kind === 'police') label(g, 'POLICE', bd.x + bd.w / 2, bd.y + bd.h / 2, '#eaf4ff');
      if (bd.kind === 'motel') label(g, 'MOTEL', bd.x + bd.w / 2, bd.y + bd.h / 2, '#fff3b0');
      if (bd.kind === 'office') label(g, 'MARINA', bd.x + bd.w / 2, bd.y + bd.h / 2, '#eaf4ff');
    }

    // Fountain basin (water animated on top each frame).
    var f = City.landmarks.fountain;
    g.fillStyle = '#b8b2a7';
    g.beginPath(); g.arc(f.x, f.y, 30, 0, PS.TAU); g.fill();
    g.fillStyle = '#39c2d7';
    g.beginPath(); g.arc(f.x, f.y, 24, 0, PS.TAU); g.fill();
  }

  function label(g, text, x, y, color) {
    g.save();
    g.font = 'bold 21px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillText(text, x + 2, y + 2);
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.restore();
  }

  City.draw = function (g, camX, camY, vw, vh) {
    if (!staticCanvas) return;
    g.drawImage(staticCanvas, camX, camY, vw, vh, 0, 0, vw, vh);
  };

  // Animated touches drawn over the static layer, inside the viewport.
  City.drawDynamic = function (g, camX, camY, vw, vh, t) {
    // Shoreline shimmer.
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    for (var i = 0; i < 7; i++) {
      var wx = camX + ((i * 173 + Math.sin(t * 0.7 + i) * 22 + t * 12) % Math.max(vw, 1));
      var wy = City.SEA_Y + 6 + (i % 3) * 7 + Math.sin(t * 1.3 + i * 2.1) * 2;
      if (wy > camY - 10 && wy < camY + vh + 10) {
        g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + 34, wy); g.stroke();
      }
    }
    // Fountain spray.
    var f = City.landmarks.fountain;
    if (f.x > camX - 60 && f.x < camX + vw + 60 && f.y > camY - 60 && f.y < camY + vh + 60) {
      g.strokeStyle = 'rgba(190,240,255,0.8)';
      g.lineWidth = 2;
      for (var k = 0; k < 5; k++) {
        var ph = (t * 1.4 + k * 0.2) % 1;
        g.beginPath();
        g.arc(f.x, f.y - 2, 4 + ph * 17, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
    }
  };

  // Palm canopies, drawn after the entities so they shade the street a little.
  City.drawCanopy = function (g, camX, camY, vw, vh) {
    for (var i = 0; i < City.palms.length; i++) {
      var p = City.palms[i];
      if (p.x < camX - 50 || p.x > camX + vw + 50 || p.y < camY - 50 || p.y > camY + vh + 50) continue;
      g.fillStyle = 'rgba(50,40,20,0.20)';
      g.beginPath(); g.ellipse(p.x + 7, p.y + 9, 20 * p.s, 9 * p.s, 0.4, 0, PS.TAU); g.fill();
      g.strokeStyle = '#8a6b45';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 2, p.y - 6); g.stroke();
      g.strokeStyle = '#3e9b4f';
      g.lineWidth = 3;
      for (var fr = 0; fr < 7; fr++) {
        var a = (fr / 7) * PS.TAU + 0.4;
        g.beginPath();
        g.moveTo(p.x + 2, p.y - 6);
        g.quadraticCurveTo(
          p.x + 2 + Math.cos(a) * 13 * p.s, p.y - 12 + Math.sin(a) * 6 * p.s,
          p.x + 2 + Math.cos(a) * 21 * p.s, p.y - 3 + Math.sin(a) * 10 * p.s);
        g.stroke();
      }
    }
  };

  PS.City = City;
})();
