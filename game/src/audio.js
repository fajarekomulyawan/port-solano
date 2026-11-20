// audio.js — every sound in Port Solano is synthesized with WebAudio.
// No audio files exist; an oscillator/noise graph is built on first use
// (browsers require a user gesture before a context may start).
(function () {
  'use strict';

  var PS = window.PS = window.PS || {};

  var ctx = null;
  var master = null;
  var engineNodes = null;   // { osc, gain, filter }
  var sirenNodes = null;    // { osc, gain }
  var sirenOn = false;
  var sirenPhase = 0;
  var musicTimer = null;
  var musicStep = 0;

  var AudioSys = {
    muted: false,
    ready: false
  };

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = AudioSys.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    AudioSys.ready = true;
    startMusic();
    return true;
  }
  AudioSys.init = ensure;

  AudioSys.toggleMute = function () {
    AudioSys.muted = !AudioSys.muted;
    if (master) master.gain.setTargetAtTime(AudioSys.muted ? 0 : 0.5, ctx.currentTime, 0.03);
    return AudioSys.muted;
  };

  function env(gainNode, t0, peak, dur) {
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone(freq, dur, type, peak, slideTo) {
    if (!ensure()) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, peak || 0.15, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, peak, filterFreq, type) {
    if (!ensure()) return;
    var t0 = ctx.currentTime;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain();
    env(g, t0, peak || 0.2, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---- one-shot effects ---------------------------------------------------
  AudioSys.shot = function () { noise(0.16, 0.5, 2600, 'highpass'); tone(150, 0.1, 'sawtooth', 0.25, 40); };
  AudioSys.punch = function () { noise(0.08, 0.3, 500); tone(90, 0.08, 'sine', 0.3, 45); };
  AudioSys.crash = function (hard) { noise(hard ? 0.35 : 0.18, hard ? 0.55 : 0.3, 700); tone(60, 0.2, 'sine', 0.3, 30); };
  AudioSys.skid = function () { noise(0.22, 0.10, 3000, 'bandpass'); };
  AudioSys.pickup = function () { tone(660, 0.09, 'sine', 0.2); setTimeout(function () { tone(990, 0.14, 'sine', 0.2); }, 70); };
  AudioSys.cash = function () { tone(880, 0.07, 'triangle', 0.22); setTimeout(function () { tone(1320, 0.12, 'triangle', 0.22); }, 60); };
  AudioSys.door = function () { tone(180, 0.07, 'square', 0.12, 120); };
  AudioSys.hurt = function () { tone(220, 0.12, 'sawtooth', 0.18, 110); };
  AudioSys.emptyClick = function () { tone(1200, 0.03, 'square', 0.08); };
  AudioSys.jingle = function () {
    if (!ensure()) return;
    var notes = [523, 659, 784, 1046];
    for (var i = 0; i < notes.length; i++) {
      (function (n, k) { setTimeout(function () { tone(n, 0.22, 'triangle', 0.25); }, k * 110); })(notes[i], i);
    }
  };
  AudioSys.fail = function () { tone(320, 0.2, 'sawtooth', 0.16, 240); setTimeout(function () { tone(240, 0.3, 'sawtooth', 0.16, 160); }, 160); };

  // ---- engine loop ----------------------------------------------------------
  AudioSys.engineStart = function () {
    if (!ensure() || engineNodes) return;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 55;
    f.type = 'lowpass'; f.frequency.value = 320;
    g.gain.value = 0.0;
    o.connect(f); f.connect(g); g.connect(master);
    o.start();
    engineNodes = { osc: o, gain: g, filter: f };
  };
  AudioSys.engineSet = function (speedRatio, throttle) {
    if (!engineNodes) return;
    var t = ctx.currentTime;
    var freq = 50 + Math.abs(speedRatio) * 165 + (throttle ? 12 : 0);
    engineNodes.osc.frequency.setTargetAtTime(freq, t, 0.06);
    engineNodes.gain.gain.setTargetAtTime(0.05 + Math.abs(speedRatio) * 0.075, t, 0.08);
  };
  AudioSys.engineStop = function () {
    if (!engineNodes) return;
    var n = engineNodes; engineNodes = null;
    n.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    setTimeout(function () { try { n.osc.stop(); } catch (e) { /* already stopped */ } }, 250);
  };

  // ---- police siren ---------------------------------------------------------
  AudioSys.setSiren = function (on) {
    if (on === sirenOn) return;
    sirenOn = on;
    if (on) {
      if (!ensure()) { sirenOn = false; return; }
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 720;
      g.gain.value = 0.045;
      o.connect(g); g.connect(master); o.start();
      sirenNodes = { osc: o, gain: g };
    } else if (sirenNodes) {
      var n = sirenNodes; sirenNodes = null;
      n.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      setTimeout(function () { try { n.osc.stop(); } catch (e) { /* already stopped */ } }, 250);
    }
  };

  // Called every frame from the main loop: animates the two-tone siren.
  AudioSys.update = function (dt) {
    if (sirenNodes && ctx) {
      sirenPhase += dt;
      var hi = (sirenPhase % 0.72) < 0.36;
      sirenNodes.osc.frequency.setTargetAtTime(hi ? 960 : 690, ctx.currentTime, 0.02);
    }
  };

  // ---- music: a quiet looping bassline --------------------------------------
  // A minor groove: A1 A1 C2 E2 | F1 F1 G1 A1 ... scheduled with lookahead-lite.
  var BASS = [55, 0, 55, 0, 65.4, 0, 82.4, 0, 43.7, 0, 43.7, 0, 49, 0, 55, 0];
  function startMusic() {
    if (musicTimer) return;
    musicTimer = setInterval(function () {
      if (!ctx || AudioSys.muted) return;
      var f = BASS[musicStep % BASS.length];
      musicStep++;
      if (f > 0) tone(f, 0.24, 'triangle', 0.10);
      if (musicStep % 8 === 4) tone(220, 0.3, 'sine', 0.03); // soft pad tick
    }, 235);
  }

  PS.Audio = AudioSys;
})();
