// Copyright (c) 2026 Kariage POMPADOUR Entertainment Corporation. MIT License.
"use strict";
/* BeatAdventure web prototype: 240 x 135, the Cardputer ADV screen.
   Obstacles are placed on detected beats and arrive exactly k beats later, so the hero's jump lands on a beat. */
const W = 240, H = 135, $ = id => document.getElementById(id);
const lcd = $("lcd"), g = lcd.getContext("2d"); g.imageSmoothingEnabled = false;
const rgb = (r, gg, b) => `rgb(${r},${gg},${b})`;
const C = { sky: rgb(8, 40, 24), sky2: rgb(14, 70, 36), leaf: rgb(10, 90, 30), leaf2: rgb(20, 130, 40), trunk: rgb(80, 50, 24),
  grass: rgb(40, 170, 50), dirt: rgb(110, 70, 30), dirt2: rgb(70, 44, 20), water: rgb(20, 70, 170), water2: rgb(40, 110, 220),
  deep: rgb(8, 24, 80), log: rgb(130, 80, 30), logEnd: rgb(190, 130, 60), croc: rgb(40, 140, 60), crocD: rgb(20, 90, 40),
  skin: rgb(240, 190, 140), hat: rgb(150, 100, 40), shirt: rgb(60, 200, 80), pants: rgb(60, 80, 220), white: "#fff", gold: rgb(255, 210, 60) };
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

/* ---------- audio: a level, and beats ---------- */
const bt = new BeatTracker();   // see beat.js: finds the tempo and phase of any music and rings a beat clock
const A = { ctx: null, an: null, src: "none", stream: null, capture: null, node: null, timer: null, fd: null, td: null };
const M = { level: 0, peak: 0.05, rms: 0, prevE: 0, avgFlux: 2, lastBeat: -9, T: 0.5, ivs: [], beatN: 0, pulse: 0, beatNow: false, sounding: false, spec: new Float32Array(W), far: new Array(34).fill(0), canopy: new Array(34).fill(10), canopyNext: 10, farT: 0, farOff: 0, farAcc: 0, farN: 0, colAcc: 0, colN: 0, pk: new Array(30).fill(0), eqN: new Array(30).fill(0), eqH: new Float32Array(30), eqAvg: new Float32Array(30), eqSet: false, eqT: 0, treble: 0, pkAt: new Array(30).fill(0), pkT: 0 };   // spec: the spectrum across the screen (low pitch left); canopy: fixed leaf heights, newest first
function ensureAudio() {
  if (!A.ctx) { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); A.an = A.ctx.createAnalyser(); A.an.fftSize = 1024; A.an.smoothingTimeConstant = 0;
    A.sink = A.ctx.createGain(); A.sink.gain.value = 0; A.an.connect(A.sink); A.sink.connect(A.ctx.destination);   // as KeySpeaker does: the analyser is wired to a silent output so that the browser keeps pulling audio through it
    A.fd = new Uint8Array(A.an.frequencyBinCount); A.pl = new Float32Array(A.an.frequencyBinCount); A.fq = new Float32Array(A.an.frequencyBinCount); A.eb = null; A.td = new Float32Array(A.an.fftSize); }
  if (A.ctx.state === "suspended") A.ctx.resume();
}
function stopSource() {
  if (A.timer) { clearInterval(A.timer); A.timer = null; }
  if (A.node) { try { A.node.disconnect(); } catch (e) {} A.node = null; }
  if (A.el) { try { A.el.srcObject = null; } catch (e) {} A.el = null; }
  if (A.stream) { A.stream.getTracks().forEach(t => t.stop()); A.stream = null; }
  if (A.capture) { A.capture.getTracks().forEach(t => t.stop()); A.capture = null; }
  if (A.master) { try { A.master.disconnect(); } catch (e) {} A.master = null; }
  A.src = "none"; bt.reset();
}
async function startStream(kind) {
  stopSource(); ensureAudio();
  try {
    const s = kind === "mic" ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
                             : await (async () => {   // as KeySpeaker does it: keep the focus on THIS page when a tab is chosen (otherwise the tab being captured comes to the front, this page is hidden, and the browser slows its animation to a crawl)
                               const opts = { video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, selfBrowserSurface: "exclude", systemAudio: "include", surfaceSwitching: "exclude" };
                               let ctl = null; if (typeof CaptureController !== "undefined") { try { ctl = new CaptureController(); opts.controller = ctl; } catch (e) {} }
                               const st = await navigator.mediaDevices.getDisplayMedia(opts);
                               if (ctl && ctl.setFocusBehavior) { try { ctl.setFocusBehavior("no-focus-change"); } catch (e) {} }
                               window.focus(); return st; })();
    if (!s.getAudioTracks().length) { s.getTracks().forEach(t => t.stop()); $("dbg").textContent = "no audio track (tick 'Share audio')"; return; }
    A.capture = s;   // keep the display capture session alive; ending its video track can also end the linked audio in some browsers
    A.stream = new MediaStream(s.getAudioTracks());
    try { A.el = new Audio(); A.el.muted = true; A.el.srcObject = A.stream; A.el.play().catch(() => {}); } catch (e) {}   // a muted audio element on the stream keeps it flowing on time (KeySpeaker does the same)
    A.node = A.ctx.createMediaStreamSource(A.stream); A.node.connect(A.an); A.src = kind;
  } catch (e) { $("dbg").textContent = "could not start: " + (e.name || e); }
}
function startTest() {   // a synthetic song: 4 quiet bars (suspense), then 8 loud bars with a kick on every beat
  stopSource(); ensureAudio();
  const c = A.ctx, bpm = 124, spb = 60 / bpm; A.master = c.createGain(); A.master.gain.value = 0.7; A.master.connect(A.an); if (!window.__mute) A.master.connect(c.destination);   // __mute: for checking without sound
  const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  let n = 0, t0 = c.currentTime + 0.1;
  const env = (node, t, a, d, peak) => { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const noise = (t, d, hp, peak) => { const s = c.createBufferSource(); s.buffer = nb; const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp; const v = c.createGain(); env(v, t, 0.002, d, peak); s.connect(f); f.connect(v); v.connect(A.master); s.start(t); s.stop(t + d + 0.05); };
  const tone = (type, fr, t, d, peak, f2) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(fr, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d); const v = c.createGain(); env(v, t, 0.004, d, peak); o.connect(v); v.connect(A.master); o.start(t); o.stop(t + d + 0.05); };
  A.timer = setInterval(() => {
    while (t0 + n * spb < c.currentTime + 1.3) {   // look ahead 1.3 s: a throttled timer (a background tab) still finds the notes in the future
      const t = t0 + n * spb, bar = Math.floor(n / 4), loud = bar % 12 >= 4, b4 = n % 4;
      if (t < c.currentTime) { n++; continue; }
      if (loud) { tone("sine", 140, t, 0.16, 0.9, 42); if (b4 === 1 || b4 === 3) noise(t, 0.12, 1800, 0.35); tone("sawtooth", [55, 55, 65.4, 49][bar % 4], t + spb / 2, spb / 2.2, 0.18); }
      else tone("sine", [110, 98][bar % 2] / 2, t, spb * 1.8, 0.12);
      noise(t + spb / 2, 0.04, 7000, loud ? 0.12 : 0.04);
      n++;
    }
  }, 100);
  A.tt = { t0, spb }; A.src = "test";   // the schedule, for checking the beat tracker against the true kicks
}
const SEG = 4, SEG_H = 3, PITCH = 8, TSPAN = 8, TMID = 0.45;   // like KeySpeaker's terrain: a column is 8 px wide (6 drawn) and made of 3 px blocks on a 4 px pitch
const mkTerr = rate => ({ avg: -30, set: false, rate });
function terrSegs(t, rms, ns) {   // how many blocks tall a column is (0 .. ns-1): this moment's loudness against the recent average, around the middle of the range, as in KeySpeaker
  const db = rms > 3e-5 ? 20 * Math.log10(rms) : -60; if (db <= -60) return 0;
  if (!t.set) { t.avg = db; t.set = true; }
  const v = Math.min(1, Math.max(0, TMID + (db - t.avg) / TSPAN)); t.avg += (db - t.avg) * t.rate; return Math.round(v * (ns - 1)); }
const farT = mkTerr(0.08);
function readAudio(now) {
  M.beatNow = false; M.sounding = false;
  const pushFar = () => { if (now - M.farT >= 0.267) { const r = M.farN ? Math.sqrt(M.farAcc / M.farN) : 0; M.farAcc = 0; M.farN = 0; M.farT += 0.267 * Math.max(1, Math.floor((now - M.farT) / 0.267)); const n = terrSegs(farT, M.sounding ? r : 0, 10); M.far.unshift(n); M.far.pop(); M.canopy.unshift(M.canopyNext); M.canopy.pop(); const target = 10 + 3 * n; M.canopyNext = M.canopy[0] + Math.max(-5, Math.min(5, target - M.canopy[0])); } M.farOff = Math.floor(Math.min(now - M.farT, 0.267) * PITCH / 0.267); };   // leaf height is set before each column enters; old columns never change
  if (A.src === "none" || !A.an) { M.level *= 0.95; M.pulse *= 0.9; M.treble *= 0.9; for (let x = 0; x < W; x++) M.spec[x] *= 0.9; for (let j = 0; j < 30; j++) M.eqH[j] *= 0.9; pushFar(); return; }
  A.an.getFloatTimeDomainData(A.td); A.an.getByteFrequencyData(A.fd);
  let sq = 0; for (let i = 0; i < A.td.length; i++) sq += A.td[i] * A.td[i];
  M.rms = Math.sqrt(sq / A.td.length); if (M.rms > 0.002) M.soundAt = now; M.sounding = now - (M.soundAt || -9) < 0.6;   // a 0.6 s hold: the gaps between kicks are not silence
  M.peak = Math.max(M.rms, M.peak * 0.9996, 0.03);   // the loudest recent level (it falls back over about 30 s, so a quiet part stays quiet), so quiet and loud parts both read
  const lv = Math.min(1, M.rms / M.peak); M.level = lv > M.level ? M.level + (lv - M.level) * 0.5 : M.level * 0.985;   // fast attack, about a second to fall
  M.farAcc += M.rms * M.rms; M.farN++; M.colAcc += M.rms * M.rms; M.colN++; pushFar();
  for (let x = 0; x < W; x++) { const v = Math.pow(A.fd[Math.min(A.fd.length - 1, Math.round(2 * Math.pow(60, x / W)))] / 255, 0.7); M.spec[x] = Math.max(v, M.spec[x] * 0.86); }   // the waves: pitch from 90 Hz to 5 kHz across the screen, each column fast up and slow down
  {   // the equalizer, analysed as KeySpeaker does it: 30 bands spaced evenly in pitch from 94 Hz to 16 kHz; each band's loudness in dB is compared with ITS OWN average of the last 2.5 s, so every band moves with the music (quiet treble as much as loud bass), and a bar falls back at 28 segments a second
    A.an.getFloatFrequencyData(A.fq); const binHz = A.ctx.sampleRate / A.an.fftSize;
    if (!A.eb || A.ebHz !== binHz) { const lo = Math.max(1, Math.round(94 / binHz)), hi = Math.min(A.fq.length - 1, Math.round(16000 / binHz)); A.eb = []; let last = lo - 1; for (let b = 0; b <= 30; b++) { let k = Math.round(lo * Math.pow(hi / lo, b / 30)); if (k <= last) k = last + 1; A.eb.push(k); last = k; } A.ebHz = binHz; }
    const db = new Float32Array(30); for (let b = 0; b < 30; b++) { let p = 0; for (let k = A.eb[b]; k < A.eb[b + 1]; k++) { const d = A.fq[k]; if (d > -200) p += Math.pow(10, d / 10); } db[b] = 10 * Math.log10(p + 1e-12); }
    const edt = Math.min(0.1, Math.max(0.001, now - M.eqT)); M.eqT = now; const silent = M.rms < 0.001;
    if (!silent && !M.eqSet) { M.eqAvg.set(db); M.eqSet = true; }
    const ek = 1 - Math.exp(-edt / 2.5);
    for (let b = 0; b < 30; b++) { let t = 0; if (!silent) { t = 0.4 + (db[b] - M.eqAvg[b]) / 12; M.eqAvg[b] += (db[b] - M.eqAvg[b]) * ek; } t = Math.min(1, Math.max(0, t)); if (t * 8 > M.eqH[b]) M.eqH[b] = t * 8; M.eqH[b] = Math.max(0, M.eqH[b] - 28 * edt); const hv = M.eqH[b]; if (hv >= M.pk[b]) { M.pk[b] = hv; M.pkAt[b] = now; } else if (now - M.pkAt[b] > 0.5) M.pk[b] = Math.max(hv, M.pk[b] - 9 * edt); }   // the peak mark hangs 0.5 s and then falls 9 segments a second
  }
  let e = 0; for (let i = 1; i <= 6; i++) e += A.fd[i]; e /= 6;
  const flux = e - M.prevE; M.prevE = e;
  M.avgFlux += (Math.max(flux, 0) - M.avgFlux) * 0.03;
  const rawTreble = M.sounding ? Math.min(1, M.eqH.slice(19).reduce((a, b) => a + b, 0) / 70) : 0;
  M.treble += (rawTreble - M.treble) * 0.12;
  const lin = i => { const a = A.fd[i] / 255; return a * a * a; };   // the spectrum is in dB; cubing it brings back the contrast, so a loud kick counts for more than a soft bass note
  const band = (lo, hi) => { let t = 0; for (let i = lo; i <= hi; i++) t += Math.max(0, lin(i) - A.pl[i]); return t / (hi - lo + 1) * 100; };
  const oss = band(1, 6) + 0.7 * band(7, 24) + 0.4 * band(25, 90); for (let i = 1; i <= 90; i++) A.pl[i] = lin(i);   // onset strength: how much the spectrum just jumped (bass, mids and highs together)
  const clock = bt.feed(now, M.sounding ? oss : 0);
  let beat = false;
  if (bt.locked) { M.T = bt.T; beat = clock && M.sounding; }   // a clear pulse: the beat clock rings on time, even through a missing kick
  else if (flux > Math.max(M.avgFlux * 2.2, 8) && now - M.lastBeat > 0.3 && M.sounding) {   // no clear pulse: the plain onset of a bass hit counts as a beat
    const iv = now - M.lastBeat;
    if (iv > 0.3 && iv < 0.9) { M.ivs.push(iv); if (M.ivs.length > 8) M.ivs.shift(); const s = [...M.ivs].sort((a, b) => a - b); M.T = s[s.length >> 1]; }
    beat = true;
  }
  if (beat) { M.lastBeat = now; M.beatNow = true; M.beatN++; M.pulse = 1; }
  M.pulse *= 0.9;
}

/* ---------- the world ---------- */
const GY = 98, HX = 60, V = 90, JD = 0.62, JH = 28, JDL = 1.2, JHL = 40;   // the long jump (over a wide pond) takes about twice the distance   // ground line, hero x, scroll px/s, jump time, jump height
const S = { isQuiet: false, sneak: 0, sp: 1, quietT: 0, silentT: 0, hide: null, ph: 0, scene: "jungle", t0: 0, sceneScroll: 0, fade: 0, fadeDir: 0, next: null, obs: [], lastArr: 0, scroll: 0, manualUntil: 0, hurt: 0, lane: 1, laneY: 0, jump: -1, bubbles: [], flick: 0 };
const LANES = [58, 84, 110];
const WATERWAY_LEN = 760;
const LAB_TOP = 160;   // the surface seen from the labyrinth ladder: height of the lip (the climb scene's cliff is 100)
const TARZAN_STEP = 5, TARZAN_TOTAL = TARZAN_STEP * 3;
const WALL_STEPS = 52, WALL_HEIGHT = WALL_STEPS * 3;   // high enough that the forest floor disappears before the vine-ravine ledge
const MAP_ENABLED = false;   // pause the illustrated map until its route matches the actual terrain
const LEGS = 6;   // legs of the journey in one day, drawn on the expedition map
const DAYSEC = 420, STAGE_SEC = 90;   // a normal course lasts about a minute and a half; story events set the other transitions
/* The climb: a course of world positions w with a ground height T(w): a slope up, a cliff with a ladder up, a plateau, a cliff with a ladder down, a slope down.
   He walks uphill slowly and leaning in, climbs a rung on every beat (hand and foot of opposite sides move together), climbs down the other cliff facing the wall,
   and runs down the last slope leaning back. When the music goes quiet he clings and waits. */
const UPX = 318, UPW = 324, DNX = 436, DNW = 446, CEND = 600, UP_TOP = 88;   // the last rung is at 88: the top of the cliff (100) is reached by pulling up over the edge
const sm01 = f => f * f * (3 - 2 * f), cl01 = f => Math.max(0, Math.min(1, f)), lp = (a, b, t) => a + (b - a) * t;
function T(w) { return w < 324 ? 40 : w < 440 ? 100 : w < 460 ? 40 : w < 540 ? 40 - (w - 460) * 0.5 : 0; }   // lower deck, bridge roof, lower deck and gangway to shore
let nextI = 0;
const nextScene = () => { if (S.scene !== "jungle") return "jungle"; return ["river", "cave"][nextI++ % 2]; };
Object.assign(S, { cav: null, bars: 0, sparks: [], under: false, pendingUnder: false, waterTransfer: false, waterEntry: null, waterExit: null, cavernN: 0, boulder: null, arrows: [], trap: null, nextArrow: 0, fall: null, lab: null, pendingLab: false, noMap: false, chase: null, land: "forest", landN: 0, monkeyEncountered: false, find: null, fnd: 0, rel: [], relics: 0, nextRelic: 0, leg: 0, map: null, jmode: "hazard", jmodeN: 0, tired: 0, day: 1, col: null, camp: null, wob: 0, wasCol: false, cv: 24, drips: [], splash: [], duck: false, tr: {}, swing: null, swK: 0, trees: [], bats: [], drops: [], nextTree: 0, trN: 0, trPrev: 0, tg: mkTerr(0.03) });
function setScene(name, now) { const campReturn = name === "camp" && S.scene !== "camp" ? { state: { ...S }, at: now } : null;
  if (name === "cavern") S.scroll = 0; S.under = name === "river" && S.pendingUnder; if (name === "river") { S.pendingUnder = false; S.riverLifeN = 0; S.nextRiverLife = now + 2; } S.waterEntry = S.under ? { t: 0 } : null; S.waterExit = null; S.tarzan = null; S.cav = name === "cavern" ? { lvl: 9, mv: null, taken: {}, maskTaken: false, reveal: 0 } : null; S.sparks = []; S.boulder = null; S.arrows = []; S.trap = null; S.nextArrow = now + 6; S.fall = null; S.lab = name === "cave" && S.pendingLab ? { t: 0, stage: 0, depth: 0, wx: S.scroll + 560, mv: null, kinds: ["down", "up", "gate"], ld: -0.45, pw: S.scroll, chased: false, view: Math.random() < 0.5 ? "back" : "side" } : null; if (name === "cave") S.pendingLab = false; S.chase = null; S.find = null; S.rel = []; S.scene = name; S.t0 = now; S.sceneScroll = S.scroll; S.obs = []; S.lastArr = now; S.jump = -1; S.lane = 1; S.laneY = LANES[1]; S.hide = null; S.col = null; S.trees = []; S.swing = null; S.bats = []; S.drops = []; S.nextTree = now + 3; S.hunter = null; S.apples = new Set();
  if (name === "boatfall") S.boat = { t: 0, phase: "shore" };
  if (name === "wall") { const L = (x, h) => ({ x, h, from: h, tgt: h, t: 1 }); S.wl = { steps: 0, phase: "approach", tt: 0, stepT: 0, x: -12, z: 0, condor: null, nextCondor: 0, rocks: [], nextRock: 0, dodge: 0, grip: 0, L: { LH: L(-7, 15), RH: L(7, 9), LF: L(-4, -10), RF: L(4, -4) } }; }
  if (name === "jungle") { if (S.wallToVines) { S.landN = 1; S.wallToVines = false; } S.land = ++S.landN === 1 ? "open" : "forest"; if (S.land === "open") S.shipStart = now; S.monkeyEncountered = false; S.rel = []; S.find = null; S.nextRelic = now + 12 + Math.random() * 18; S.nextHunter = now + 8; S.hunterN = 0; S.jmode = S.landN === 2 ? "hills" : "hazard"; S.tarzanDone = S.landN >= 3; if (S.fromWall) { S.tarzan = { t: 0 }; S.fromWall = false; } if (S.landN === 3) S.tired = Math.min(S.tired, 0.3); S.tr = {}; S.trN = 0; S.trPrev = 0; S.tg = mkTerr(0.03); }   // beach, sloped Forest2 and vines, river, then flat Forest with the hidden shaft
  if (name === "cave") { S.drips = []; S.splash = []; S.duck = false; S.visualDark = 0; S.roof = {}; S.roofN = Math.floor(S.scroll / PITCH) - 2; S.roofPrev = 28; }
  if (name === "fountain" || name === "skyfall" || name === "pyramid") S.visualDark = 0;
  if (name === "pyramid") { S.pyramidRocks = []; S.pyramidRockN = 0; S.pyramidLook = false; S.pyramidDuck = false; }
  if (name === "climb") { S.cl = { w: 0, z: 40, ph: "walk", stage: 0, zT: 40, drop: false, stepT: 0 }; S.landN = 0; }   // the opening ship route keeps the left climb, roof crossing and right descent
  if (name === "camp") { S.camp = { b: 0, waking: false, resume: campReturn }; S.wasCol = false; } }
function resumeCamp(now) {   // restore the exact adventure state captured at camp entry, with its timers paused for the rest
  const saved = S.camp && S.camp.resume;
  if (!saved) { setScene("jungle", now); return; }   // direct Camp preview has no previous stage
  const rest = now - saved.at; Object.assign(S, saved.state);
  for (const key of ["t0", "shipStart", "nextTree", "nextRelic", "nextHunter", "lastArr", "nextRiverLife", "nextArrow"]) if (Number.isFinite(S[key])) S[key] += rest;
  for (const o of S.obs) { if (Number.isFinite(o.arr)) o.arr += rest; if (Number.isFinite(o.born)) o.born += rest; }
  for (const tree of S.trees) if (tree.throwAt >= 0) tree.throwAt += rest;
  S.fade = 0; S.fadeDir = 0; S.next = null; S.map = null; S.camp = null; S.silentT = 0; S.tired = 0;
}
function switchTo(name, now) { if (S.fadeDir) return; S.next = name; S.fadeDir = 1; S.fade = 0; }

function spawn(now) {   // called on a beat: put an obstacle that reaches the hero k beats from now
  if (S.fadeDir || S.isQuiet || S.col || S.find || S.fall || S.under || (S.scene === "jungle" && S.rel.length) || S.scene === "camp" || S.scene === "climb" || S.scene === "wall" || S.scene === "boatfall" || S.scene === "fountain" || S.scene === "skyfall" || S.scene === "pyramid" || M.level < 0.06) return;   // the underground waterway keeps its animals local rather than spawning drifting obstacles
  const T = M.T, need = (W + 18 - HX + 64) / V, k = Math.max(2, Math.ceil(need / T)), arr = now + k * T;
  if (arr - S.lastArr < (S.nextGap || 0.78) || (M.beatN % 2) && M.level < 0.55) return;   // room between obstacles: in the jungle and the cave they come every two to four seconds or so
  const gap = arr - S.lastArr; S.lastArr = arr; S.nextGap = S.scene === "jungle" ? 3.5 + Math.random() * 5.5 : S.scene === "cave" ? (S.lab ? 1.8 + Math.random() * 2.2 : 3.0 + Math.random() * 3.0) : S.scene === "cavern" ? 3.2 + Math.random() * 2.8 : 2.2 + Math.random() * 2.4;   // rare enough to matter: jungle every 3.5-9 s, cave 3-6 s, river 2-4.6 s
  if (S.scene === "jungle" && S.tarzan) return;
  if (S.scene === "cave" && S.lab && (S.lab.wx - S.scroll < 460 || S.boulder)) return;   // clear the last stretch before the ladder
  if (S.scene === "jungle") { const r = Math.random(), kind = S.land === "open" ? (r < 0.25 ? "log" : "turtle") : S.jmode === "hills" ? (r < 0.4 ? "log" : r < 0.7 ? "tiger" : "bear") : r < 0.2 ? "log" : r < 0.4 ? "tiger" : r < 0.6 ? "bear" : "pond";
    const wide = kind === "pond" && Math.random() < 0.3 && gap >= 1.5, pulse = kind === "pond" && !wide && Math.random() < 0.4, hasCroc = kind === "pond" && (wide || Math.random() < 0.55);   // a wide pond (two crocodiles) is crossed on a vine; some ponds breathe with the volume; not every pond has a crocodile
    const hw = kind === "log" ? 8 : kind === "tiger" ? 14 : kind === "bear" ? 12 : wide ? 28 : pulse ? 12 : 14;
    S.obs.push({ arr, wx: S.scroll + (arr - now) * V, type: kind === "pond" ? "croc" : kind, wide, pulse, hasCroc, hw, hwMax: pulse ? 20 : hw, w: 0 }); if (wide) S.lastArr = arr + 0.9; }
  else if (S.scene === "cavern") return;   // the cavern has its own cast (the guardians at home, the treasure, the bats): no scorpions or cobras there; they belong to the brick tunnel
  else if (false) {   // (kept: scorpions and cobras on the ledges, away from gaps, ladders and gold)
    const wx = S.scroll + (arr - now) * V; let lvl = 1; for (let i = 0; i < 5; i++) { const st = cavSt(i); if (st.xs < wx) { if (st.kind === "ladUp") lvl = 0; if (st.kind === "ladDown") lvl = 1; } }
    if (wx > cavSt(4).xs - 90 || [0, 1, 2, 3, 4].some(i => cavSt(i).lvl === lvl && Math.abs(cavSt(i).xs - wx) < 90) || cavGold.some(p => p.lvl === lvl && Math.abs(p.x - wx) < 40)) { S.lastArr = arr - 1; return; }
    S.obs.push({ arr, wx, type: Math.random() < 0.5 ? "scorpion" : "snake", lvl, hw: 8 }); }
  else if (S.scene === "cave") { const r = Math.random(); S.obs.push({ arr, wx: S.scroll + (arr - now) * V, type: S.lab ? (r < 0.14 ? "rock" : r < 0.28 ? "stal" : r < 0.42 ? "low" : r < 0.72 ? "scorpion" : "snake") : (r < 0.4 ? "rock" : r < 0.75 ? "stal" : "low") }); }   // the labyrinth adds scorpions and cobras
  else { const r = Math.random(), type = r < 0.25 ? "croc" : r < 0.52 ? "piranha" : r < 0.73 ? "snake" : "wood";
    S.obs.push({ arr, wx: S.scroll + (arr - now) * V, type, sine: Math.random() < 0.5, lane: Math.floor(Math.random() * 3) }); }   // crocodiles, piranhas and water snakes share the open river lanes
}
const obsX = o => HX + o.wx - S.scroll;       // an obstacle stands at a place in the world and the ground carries it past
const ttl = o => (o.wx - S.scroll) / (V * (S.vm || 1));        // seconds until it reaches the hero at full speed

function update(now, dt) {
  const manual = now < S.manualUntil;
  S.isQuiet = M.sounding && (S.isQuiet ? M.level < 0.38 : M.level < 0.27);
  const quiet = S.isQuiet;   // music that has gone quiet: the hero tiptoes, and if it stays quiet something comes
  S.sneak += ((quiet || !M.sounding ? 1 : 0) - S.sneak) * Math.min(1, dt * 2);
  S.quietT = quiet ? S.quietT + dt : Math.min(0, S.quietT + dt);   // seconds of quiet; after a hide it counts up from negative (a rest)
  S.silentT = !M.sounding && A.src !== "none" && S.scene !== "camp" ? S.silentT + dt : 0;
  if (S.silentT > 60 && !S.fadeDir && !S.find && !S.fall && !S.waterExit) switchTo("camp", now);   // a whole minute of music-free slow travel, never a scheduled rest during music
  if (S.col) { S.col.t += dt; if (S.col.t > 4.6) S.col = null; }
  if (S.scene === "jungle" && !S.hide && !S.fadeDir && !S.col && !S.find && S.quietT > 5 && S.jump < 0 && !manual && !S.obs.some(o => obsX(o) > HX - 14 && obsX(o) < HX + 110)) S.hide = { t: 0 };
  if (S.hide) { S.hide.t += dt; if (S.hide.t > 5.9 || (M.level > 0.5 && S.hide.t > 1)) { S.hide = null; S.quietT = -12; } }
  if (S.scene === "pyramid") { const elapsed = now - S.t0;
    while (S.pyramidRockN < PYRAMID_ROCK_TIMES.length && elapsed >= PYRAMID_ROCK_TIMES[S.pyramidRockN]) { const id = S.pyramidRockN++; S.pyramidRocks.push({ id, x: -20, speed: 60 + (id % 3) * 4 }); }
    for (const rock of S.pyramidRocks) rock.x += rock.speed * dt;
    S.pyramidRocks = S.pyramidRocks.filter(rock => rock.x < W + 20);
    const runX = PYRAMID_X + Math.round(24 * sm01(cl01(elapsed / 0.9)));
    S.pyramidLook = S.pyramidRocks.some(rock => rock.x > runX - 90 && rock.x <= runX - 45);
    S.pyramidDuck = S.pyramidRocks.some(rock => rock.x > runX - 45 && rock.x < runX + 25);
  }
  S.sp = (S.hide || S.find || S.fall || S.waterExit || S.pyramidDuck && S.scene === "pyramid" || (S.lab && (S.lab.mv || S.lab.cartS === 2)) || (S.cav && (S.cav.maskAnim || S.cav.mv && S.cav.mv.kind !== "swing")) || (S.boulder && S.boulder.stop) ? 0 : 1 - 0.4 * S.sneak) * (S.col ? Math.max(0, 1 - S.col.t / 1.6) : 1) * (S.cav && S.cav.mv && S.cav.mv.kind === "swing" ? 0.6 : 1) * (S.hunter ? 1.2 : 1);   // he keeps running while glancing back; quiet passages still advance
  { const L0 = S.lab; S.vm = S.scene === "cave" && L0 && L0.cart && !L0.mv ? (1.45 + 0.5 * M.level) * (0.25 + 0.75 * sm01(cl01((L0.rideT || 0) / 1.5))) * Math.max(0.6, Math.min(1.6, 1 - 2.2 * (labH(S.scroll + 4) - labH(S.scroll - 4)) / 8)) : 1; } S.sp *= S.vm;   // in the mine cart the tunnel races past, faster in loud music
  if (!S.hide) { S.ph += dt * S.sp / (M.sounding ? M.T : 0.6); if (M.beatNow && S.sneak < 0.3) { const f = (S.ph - 0.25) - Math.floor(S.ph - 0.25), e = f < 0.5 ? -f : 1 - f; S.ph += e * 0.35; } }   // the stride follows the beat: the left foot lands on it
  if (M.beatNow) spawn(now);
  if (S.scene === "camp" && S.camp) {   // settle by the fire, sleep without a time limit, then wake only when audio returns
    const camp = S.camp;
    if (M.sounding && camp.b >= 16) { camp.waking = true; camp.b = Math.max(40, camp.b); }
    camp.b = camp.waking ? camp.b + dt / M.T : Math.min(20, camp.b + dt / M.T);
    if (camp.b >= 46) { const day = S.day + 1; resumeCamp(now); S.day = day; return; }
  }
  if (S.scene === "jungle" && S.land === "open" && !S.fadeDir && now - S.shipStart >= 48) { S.noMap = true; switchTo("jungle", now); }   // the liner disappears at the horizon, and the beach gives way to forest
  if (!S.fadeDir && !S.hide && !S.find && !S.lab && !S.fall && !S.cav && !S.under && S.scene !== "camp" && S.scene !== "climb" && S.scene !== "wall" && S.scene !== "boatfall" && !S.col && !(S.scene === "jungle" && (S.landN === 2 || S.landN === 3)) && now - S.t0 >= STAGE_SEC && (S.scroll - S.sceneScroll > V * STAGE_SEC * 0.65 || now - S.t0 >= 165)) switchTo(nextScene(), now);
  if (S.fadeDir) { S.fade += S.fadeDir * dt * 1.8;
    if (S.fadeDir > 0 && S.fade >= 1 && (S.noMap || !MAP_ENABLED)) { S.noMap = false; setScene(S.next, now); S.fadeDir = -1; }   // falling down a hole or climbing out of the labyrinth: no map, straight on
    else if (S.fadeDir > 0 && S.fade >= 1) {   // black: the expedition map shows for a few seconds (the journey advances one leg), then the next scene fades in
      if (!S.map) S.map = { t: 0, leg0: Math.min(S.leg, LEGS), name: S.next };
      S.map.t += dt; S.fade = 1;
      if (S.map.t >= 2.8) { S.leg = Math.min(LEGS, S.map.leg0 + 1); S.map = null; setScene(S.next, now); S.fadeDir = -1; } }
    else if (S.fadeDir < 0 && S.fade <= 0) { S.fade = 0; S.fadeDir = 0; } }
  if (S.scene !== "camp" && S.scene !== "climb" && S.scene !== "wall" && S.scene !== "boatfall") S.scroll += V * S.sp * dt;
  if (M.beatNow && M.sounding && !S.fadeDir && (S.scene === "jungle" || S.scene === "cave" || S.scene === "cavern") && S.bats.length < (S.lab ? 2 : 1) && M.level > 0.25 && Math.random() < (S.lab ? 0.3 : 0.1)) { const y0 = S.scene === "cave" ? Math.max(40, S.cv + 28) : S.scene === "cavern" ? 64 : 38; S.bats.push({ x: W + 8, y: y0, y0, t: 0 }); }
  for (const b of S.bats) { b.t += dt; b.x -= (62 + V * S.sp * 0.3) * dt; const u = b.t * 1.7; b.y = b.y0 + (Math.abs(u - Math.floor(u) - 0.5) * 4 - 1) * 12; }   // a triangle wave: straight zigs and zags
  S.bats = S.bats.filter(b => b.x > -10);
  if (S.scene === "jungle") {   // a palm with a monkey now and then; he throws a coconut ahead of the hero, and it lands and lies there like a log
    if (S.land === "open" && S.jmode === "hazard" && M.sounding && !S.hide && !S.col && !S.fadeDir && now > S.nextTree && !S.trees.length) { S.trees.push({ wx: S.scroll + W - HX + 24, throws: 0, throwAt: -9 }); S.nextTree = now + 7 + Math.random() * 5; }
    for (const t of S.trees) { const sx = HX + t.wx - S.scroll;
      if (M.beatNow && t.throws < 2 && sx < 214 && sx > 100 && !S.isQuiet && !S.col && !S.hide && S.sp > 0.7 && now - t.throwAt > 1.2) {
        const Tf = 0.7, wx = S.scroll + V * Tf + 100;
        if (S.obs.every(o => Math.abs(o.wx - wx) > 150)) { S.obs.push({ type: "nut", wx, arr: now + (wx - S.scroll) / V, hw: 5, born: now, Tf, xw0: t.wx - 8, y0: monkeyY(t, now) - 4 }); S.lastArr = Math.max(S.lastArr, now + (wx - S.scroll) / V); t.throws++; t.throwAt = now; if (S.landN === 1) S.monkeyEncountered = true; } } }
    S.trees = S.trees.filter(t => HX + t.wx - S.scroll > -30);
  }
  if (S.scene === "jungle" && !S.tarzan) {
    if (!S.hunter && now >= S.nextHunter && !S.fadeDir && !S.hide && !S.find && !S.fall && !S.swing && !S.rel.length) {
      S.hunter = { t: 0, side: ++S.hunterN % 2 ? "front" : "back", dodged: false };
      S.nextHunter = now + 17 + Math.random() * 7;
    }
    if (S.hunter) {
      const h = S.hunter; h.t += dt;
      if (!h.dodged && h.t >= (h.side === "front" ? 2.4 : 1.5)) {
        h.dodged = true;
        if (!manual && S.jump < 0 && !S.hide && !S.find) { S.jump = 0; S.jd = JD; S.jh = JH; S.jumpKind = "hunter"; }
      }
      if (h.t > 5) S.hunter = null;
    }
    if (S.land === "forest") {
      const k = Math.round((HX + 27 + S.scroll * 0.25) / 47), x = k * 47 - S.scroll * 0.25 - 27;
      if (Math.abs(x - HX) < 3) S.apples.add(k);   // passing the tree collects its apple like a Pac-Man dot
    }
  }
  if (S.scene === "jungle" && S.land === "forest" && S.landN === 2) {
    const elapsed = now - S.t0;
    if (!S.tarzanDone && !S.tarzan && elapsed >= 55 && !S.hide && !S.fadeDir) { S.noMap = true; switchTo("wall", now); }
    if (S.tarzan) { S.tarzan.t = Math.min(TARZAN_TOTAL, S.tarzan.t + dt); if (S.tarzan.t >= TARZAN_TOTAL && !S.fadeDir) { S.noMap = true; switchTo("boatfall", now); } }
  }
  if (S.scene === "jungle") {   // treasure: now and then a pedestal with a golden idol stands in the road; he stops, finds it, lifts it high, and the music celebrates
    if (((M.beatNow && M.sounding && !S.isQuiet && M.level > 0.3) || (!M.sounding && now - S.t0 >= STAGE_SEC + 10)) && now > S.nextRelic && now - S.t0 >= STAGE_SEC - 8 && S.land === "forest" && S.landN === 3 && !S.find && !S.hide && !S.col && !S.fadeDir && !S.swing && !S.rel.length) {
      const wx = S.scroll + W - HX + 30;
      if (S.obs.every(o => Math.abs(o.wx - wx) > 170)) { S.rel.push({ wx, taken: false, entrance: true, shift: 0 }); S.lastArr = Math.max(S.lastArr, now + (wx - S.scroll) / V + 1); S.nextGap = 4; S.nextRelic = now + 45 + Math.random() * 45; }
    }
    if (S.fall) { S.fall.t += dt; if (S.fall.t > 0.55 && !S.fadeDir) { S.noMap = true; S.pendingLab = true; switchTo("cave", now); } }   // the revealed shaft leads straight into the brick tunnel
    if (!S.find && !S.fall && S.jump < 0 && !S.swing && !S.fadeDir) { const r = S.rel.find(r => !r.taken && r.wx - S.scroll <= 16); if (r) S.find = { r, t: 0 }; }
    if (S.find) { const f = S.find, r = f.r; f.t += dt;
      if (f.t >= 1.7 && !r.taken) { r.taken = true; S.relics++; }
      r.clue = f.t >= 2.4 && f.t < 3.2; r.shift = r.clue ? (Math.floor(f.t * 12) & 1) : Math.round(32 * sm01(cl01((f.t - 3.2) / 1.5)));
      if (f.t > 4.9) { S.fall = { t: 0, o: r }; S.find = null; } }   // take the mask, notice the inlay, push the pedestal, then enter the hidden shaft
    if (S.chase) { S.chase.t += dt; if (S.chase.t > 11) S.chase = null; }
    S.rel = S.rel.filter(r => HX + r.wx - S.scroll > -30);
  }
  if (S.scene === "jungle") {   // the ground is built like KeySpeaker's terrain: each new column at the right edge is as tall as this moment's loudness against the recent average (blocks of 4 px); the ground carries it to him and away, and it never springs back
    const eC = Math.floor((S.scroll - HX) / PITCH);
    if (S.trN < eC - 2) { S.trN = eC; S.trPrev = 0; }
    while (S.trN * PITCH < S.scroll + W - HX + 16) {
      const c = S.trN, r = M.colN ? Math.sqrt(M.colAcc / M.colN) : 0; M.colAcc = 0; M.colN = 0;
      let n = S.land === "forest" && S.jmode === "hills" ? Math.max(0, Math.min(8, Math.round(3 + 2.5 * Math.sin(c * 0.095) + 1.4 * Math.sin(c * 0.036) + M.level))) : 0;   // two kinds of jungle: HILLS (the ground is the volume, nothing in the way) and HAZARDS (flat ground, logs, ponds, tigers, bears)
      n = Math.max(S.trPrev - 2, Math.min(S.trPrev + 2, n));   // at most two blocks of step, so that he can run it
      S.tr[c] = n; S.trPrev = n; delete S.tr[c - 80]; S.trN++;
    }
  }
  for (const o of S.obs) if (o.pulse && obsX(o) > HX + 75) o.hw += ((8 + 12 * M.level) - o.hw) * Math.min(1, dt * 6);   // a breathing pond: its width follows the volume until it is close, then it holds still
  S.obs = S.obs.filter(o => obsX(o) > -40);
  S.hurt = Math.max(0, S.hurt - dt); S.flick += dt;
  if (S.scene === "cavern") {   // a Pitfall II cavern: two ledges and a river below, joined by ladders; the route is fixed, five stations along it: a gap to jump, a ladder up, a gap, a ladder down, and at last a hole in the lower ledge over the water
    const C = S.cav; C.t = (C.t || 0) + dt;
    if (!C.maskTaken && C.lvl === 8 && !C.mv && Math.abs(S.scroll - 1300) < 10) { C.maskTaken = true; C.maskAnim = { t: 0 }; S.relics++; for (let i = 0; i < 12; i++) S.sparks.push({ x: HX, y: CF[8] - 22, vx: (Math.random() - 0.5) * 80, vy: -25 - Math.random() * 45, t: 0 }); }
    if (C.maskAnim) { C.maskAnim.t += dt; if (C.maskAnim.t > 1.4) C.maskAnim = null; }
    if (C.maskTaken && (!C.maskAnim || C.maskAnim.t > 0.45)) C.reveal = Math.min(1, (C.reveal || 0) + dt * 1.2);
    if (S.jump >= 0) { S.jump += dt; if (S.jump > (S.jd || JD)) S.jump = -1; }
    if (!C.mv && C.lvl === NF - 1 && S.jump < 0 && !cavSolid(C.lvl, S.scroll)) C.mv = { kind: "miss", t: 0, from: CF[C.lvl] };   // a short jump can miss the first gap and drop into the river
    if (!C.mv) {
      for (let i = 0; i < NST; i++) { const st = cavSt(i), dx = st.xs - S.scroll;
        if (st.lvl !== C.lvl || C["d" + i]) continue;
        if (st.kind === "gap" && S.jump < 0 && dx <= 28 && dx > 0) { const short = C.lvl === NF - 1 && M.sounding && M.level < 0.35; S.jd = short ? 0.36 : M.sounding ? JD : 0.82; S.jh = short ? 20 : JH; S.jump = 0; C["d" + i] = true; }   // a slow silent run still clears an ordinary gap
        else if (st.kind === "ladUp" && dx <= 0 && S.jump < 0) { S.scroll = st.xs; C.mv = { kind: "up", t: 0 }; C["d" + i] = true; }
        else if (st.kind === "rope" && dx <= 29 && S.jump < 0) { C.mv = { kind: "swing", t: 0, xs: st.xs }; C["d" + i] = true; if (S.chase) { S.chase.stuck = true; S.chase.t = Math.min(S.chase.t, 6); S.chase.wx0 = st.xs - 35; } }   // a rope over a wide gap: he grabs it and swings across, and the guardians are stuck on the near side
        else if (st.kind === "pit" && dx <= 0 && S.jump < 0) { C.mv = { kind: "drop", t: 0 }; C["d" + i] = true; } }
      for (const o of S.obs) if (o.lvl === C.lvl && !o.done && S.jump < 0 && ttl(o) < JD / 2 && ttl(o) > -0.1) { o.done = true; S.jd = JD; S.jh = JH; S.jump = Math.max(0, JD / 2 - ttl(o)); }   // he hops what lives on the ledge
      for (const p of cavGold) { if (C.taken[p.id] || p.lvl !== C.lvl || S.jump >= 0) continue; if (Math.abs(p.x - S.scroll) < 7) { C.taken[p.id] = true; S.bars++; for (let k = 0; k < 8; k++) S.sparks.push({ x: HX + 4, y: CF[C.lvl] - 8, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, t: 0 }); } }   // gold bars are picked up on the run
    } else { const m = C.mv; m.t += dt;
      if (m.kind === "swing") { S.sp = 0.7; if (m.xs - S.scroll < -29) C.mv = null; }
      else if (m.kind === "drop" || m.kind === "miss") { const from = m.from === undefined ? CF[0] : m.from, splashAt = Math.sqrt((CWATER - from) / 300); if (m.t > splashAt + 0.12 && !S.waterTransfer) { S.pendingUnder = true; S.waterTransfer = true; } }
      else if (m.t >= 2.0) { C.lvl--; C.mv = null; if ([6, 3, 1].includes(C.lvl)) S.chase = { t: 0 }; } }   // up on floors 6, 3 and 1 the temple guardians, who live here, come after him
    if (S.chase) { const ch = S.chase; ch.t += dt;
      if (!ch.stuck && !C.mv && ch.t > 1.2 && ch.t >= (ch.nextAttack || 1.5)) { ch.attack = 0.45; ch.nextAttack = ch.t + 2.6; }
      if (ch.stuck) ch.attack = 0; else if (ch.attack > 0) ch.attack = Math.max(0, ch.attack - dt);
      if (ch.t > 11) S.chase = null; }
    S.duck = S.jump < 0 && !C.mv && ((S.chase && S.chase.attack > 0 && S.chase.attack < 0.28) || (!manual && S.arrows.some(a => a.x - HX < 52 && a.x - HX > -6)));   // duck the guardian's spear thrust
    if (false && !C.mv && S.trap === null && M.beatNow && now > S.nextArrow && !S.chase && !S.obs.some(o => ttl(o) < 1.8 && ttl(o) > -0.3) && [0, 1, 2, 3, 4].every(i => Math.abs(cavSt(i).xs - S.scroll) > 160)) { S.trap = { t: 0, lvl: C.lvl }; S.nextArrow = now + 5 + Math.random() * 4; }   // an arrow trap in the right wall, level with his head
    if (S.trap) { S.trap.t += dt; if (S.trap.t > 0.5) { S.arrows.push({ x: W - 12, lvl: S.trap.lvl }); S.trap = null; } }
    for (const a of S.arrows) a.x -= 260 * dt; S.arrows = S.arrows.filter(a => a.x > -20);
    for (const k of S.sparks) { k.t += dt; k.x += k.vx * dt; k.y += k.vy * dt; k.vy += 120 * dt; } S.sparks = S.sparks.filter(k => k.t < 0.7);
  }
  if (S.scene === "boatfall") { const b = S.boat; b.t += dt;
    b.phase = b.t < 1.6 ? "shore" : b.t < 2.8 ? "board" : b.t < 8.4 ? "cruise" : b.t < 11 ? "lip" : b.t < 13.5 ? "drop" : "splash";
    if (b.t >= 15.5) setScene("river", now); }   // the waterfall basin opens straight into the crocodile river
  if (S.scene === "river" && S.under && S.waterExit && S.waterExit.t > 1.7) setScene("fountain", now);   // the current feeds a vertical geyser inside the building
  if (S.scene === "fountain" && now - S.t0 > 4.9) setScene("skyfall", now);
  if (S.scene === "skyfall" && now - S.t0 > 3.3) setScene("pyramid", now);
  if (S.scene === "pyramid" && S.pyramidRockN === PYRAMID_ROCK_TIMES.length && !S.pyramidRocks.length && !S.fadeDir) { S.noMap = true; switchTo("jungle", now); }
  if (S.scene === "cave" && S.lab) {   // the underground labyrinth: levels joined by tunnels to run, holes to drop through and ladders to climb; the last ladder leads up to the jungle
    const L = S.lab; L.t += dt; if (L.ld < 1) L.ld += dt;
    if (L.mv) L.mvT = (L.mvT || 0) + dt; else L.mvT = 0;
    if ((L.t > 170 || L.mvT > 14) && !S.fadeDir) { S.noMap = true; switchTo("jungle", now); }   // a watchdog: whatever goes wrong, the labyrinth lets him out
    if (!L.chased && L.depth === 1 && L.ld >= 1 && !L.mv) { L.chased = true; L.cartS = 1; L.cartX = S.scroll + 260; L.wx = L.cartX + 2100; L.gaps = [L.cartX + 760, L.cartX + 1500]; }   // a long ride ahead, with two places where the track is broken   // down in the deep tunnel a mine cart stands on rails ahead
    if (L.cartS === 1 && !S.chase && L.cartX - S.scroll < 140) S.chase = { t: 0 };   // he sees it, and the guardians come after him
    if (L.cartS === 1 && L.cartX - S.scroll <= 14 && !L.mv) { L.cartS = 2; L.bt = 0; L.bs = S.scroll; S.jump = -1; }   // he reaches it and hops in
    if (L.cartS === 2) { L.bt += dt; S.scroll = lp(L.bs, L.cartX, sm01(cl01(L.bt / 0.5))); if (L.bt >= 0.55) { L.cartS = 3; L.cart = true; L.rideT = 0; } }   // the world slides the last few dots while he jumps; then the cart rolls off
    if (L.cartS === 3) L.rideT += dt;
    if (L.mv) { L.cart = false; if (L.cartS === 3) L.cartS = 0; }
    if (S.chase) { S.chase.t += dt; if (S.chase.t > 11) S.chase = null; }
    if (!L.bd && L.stage === 0 && !L.mv && L.ld >= 1 && !S.boulder && L.wx - S.scroll < 330 && L.wx - S.scroll > 250) {   // a rumble: a huge boulder is coming down the tunnel; there is a niche in the wall just ahead
      L.bd = true; S.obs = S.obs.filter(o => o.wx < S.scroll - 20); S.boulder = { t: 0, nx: S.scroll + 120, roll: false, stop: false, bw: 0, gone: false }; }
    if (S.boulder) { const B = S.boulder; B.t += dt; const dxn = B.nx - S.scroll;
      if (!B.roll && dxn <= 0) { B.roll = true; B.bw = S.scroll + (W + 50 - HX); }   // he is in the niche: now it comes into view, from the right
      if (B.roll) { B.bw -= 230 * dt; if (HX + B.bw - S.scroll < -60) B.gone = true; }
      B.stop = dxn <= 0 && !(B.gone && HX + B.bw - S.scroll < -90);
      if (B.gone && HX + B.bw - S.scroll < -90) { B.stop = false; if (!B.endT) B.endT = B.t; if (B.t - B.endT > 0.5) S.boulder = null; } }
    if (!L.mv && !S.boulder && S.trap === null && M.beatNow && now > S.nextArrow && L.ld >= 1 && L.wx - S.scroll > 320 && !S.obs.some(o => ttl(o) < 1.8 && ttl(o) > -0.3)) { S.trap = { t: 0 }; S.nextArrow = now + (L.stage === 2 ? 2.5 + Math.random() * 2.5 : 5 + Math.random() * 4); }   // an arrow trap: a slit in the right wall flashes, then an arrow flies
    if (S.trap) { S.trap.t += dt; if (S.trap.t > 0.5) { S.arrows.push({ x: W - 2 }); S.trap = null; } }
    for (const a of S.arrows) a.x -= 260 * dt; S.arrows = S.arrows.filter(a => a.x > -20);
    if (L.kinds[L.stage] === "gate" && now - S.t0 < STAGE_SEC - 4 && L.wx - S.scroll < 300) L.wx = S.scroll + 520;
    if (!L.mv && L.wx - S.scroll <= (L.kinds[L.stage] === "gate" ? 14 : L.kinds[L.stage] === "exit" && L.view === "back" ? 0 : 5) && !S.fadeDir) { const k = L.kinds[L.stage]; L.mv = k === "gate" ? { kind: "gate", t: 0 } : k === "down" ? { kind: "down", t: 0, d: 0 } : { kind: k, ph: "up", z: 40, mt: 0, q: 0, view: k === "exit" ? L.view : "side" }; }
    const m = L.mv;
    if (m) {
      if (m.kind === "gate") { m.t += dt; S.ph += dt / M.T * 0.7; if (m.t > 1.2 && !S.fadeDir) { S.noMap = true; switchTo("cavern", now); } }   // through the golden doorway into the treasure store
      else if (m.kind === "down") { m.t += dt; m.d = 135 * Math.pow(Math.min(1, m.t / 1.0), 2); if (m.t >= 1.0) { L.depth++; L.stage++; L.mv = null; L.ld = 0; L.pw = L.wx; L.wx = S.scroll + (L.depth === 1 ? 1000 : 560); } }
      else if (m.view === "back") { m.z += 40 * dt; if (m.z >= LAB_TOP + 8 && !S.fadeDir) { S.noMap = true; switchTo("jungle", now); } }   // seen from behind he simply climbs on up through the hatch
      else if (m.ph === "mount") { m.mt += dt; m.q = cl01(m.mt / 1.8); m.z = LAB_TOP - 12 + 12 * sm01(m.q); if (m.q >= 1) { if (m.kind === "exit") { if (!S.fadeDir) { S.noMap = true; switchTo("jungle", now); } } else { L.depth--; L.stage++; L.mv = null; L.ld = 1; L.pw = L.wx; L.wx = S.scroll + 600; } } }
      else { m.z += 40 * dt; if (m.z >= LAB_TOP - 12) { m.z = LAB_TOP - 12; m.ph = "mount"; m.mt = 0; } }
    }
  }
  if (S.scene === "cave") {   // the ceiling presses: the light shrinks and the roof falls when it is quiet and rises when it is loud (see drawCave); a drip falls on every beat
    if (!S.roof) { S.roof = {}; S.roofN = Math.floor(S.scroll / PITCH) - 2; S.roofPrev = 28; }
    while (S.roofN * PITCH < S.scroll + W + 16) { const target = (S.lab && S.lab.cart ? 26 - 11 * M.level : 38 - 22 * M.level), i = S.roofN++;
      S.roofPrev += Math.max(-2, Math.min(2, target - S.roofPrev)); S.roof[i] = S.roofPrev; delete S.roof[i - 90]; }
    S.cv = cey(HX);   // each audio-derived ceiling column keeps its height while it scrolls left
    if (M.beatNow && M.sounding) { const x = 90 + Math.random() * 150; S.drips.push({ x, y: cey(x), v: 0 }); }
    for (const d of S.drips) { d.v += 260 * dt; d.y += d.v * dt; d.x -= V * S.sp * dt; if (d.y >= GY - (S.lab ? Math.round(labH(S.scroll + d.x - HX)) : 0)) { d.dead = true; S.splash.push({ x: d.x, t: 0 }); } }
    S.drips = S.drips.filter(d => !d.dead && d.x > -4); for (const p of S.splash) { p.t += dt; p.x -= V * S.sp * dt; } S.splash = S.splash.filter(p => p.t < 0.25);
    S.duck = !manual && S.jump < 0 && (S.obs.some(o => o.type === "low" && ttl(o) < 0.3 && ttl(o) > -0.28) || S.arrows.some(a => a.x - HX < 52 && a.x - HX > -6) || !!(S.boulder && S.boulder.stop));   // he ducks under a low roof and under an arrow, and presses into the niche while the boulder passes
  }
  if (S.scene === "jungle" || S.scene === "cave") {
    if (S.jump >= 0) { S.jump += dt; if (S.jump > (S.jd || JD)) S.jump = -1; }
    if (S.swing) { const dx = ttl(S.swing.o) * V; if (dx < -40) { S.swing.pt += dt; if (S.swing.pt > 0.4) S.swing = null; } }   // a vine over a wide pond: he jumps up to it, swings across and lets go on the far side
    else if (S.scene === "jungle" && !manual && S.jump < 0 && !S.col) { const w = S.obs.find(o => o.wide && !o.done && ttl(o) * V < 67 && ttl(o) * V > -40); if (w) { w.done = true; S.swing = { o: w, pt: 0 }; } }
    if (!manual && S.jump < 0 && !S.col && !S.duck && !S.swing && !(S.lab && (S.lab.mv || S.lab.cartS === 2))) { const o = S.obs.find(o => !o.done && !o.wide && o.type !== "low" && o.type !== "hole" && ttl(o) < (o.wide ? JDL : JD) / 2 && ttl(o) > -0.1); if (o) { S.jd = o.wide ? JDL : JD; S.jh = o.wide ? JHL : JH; S.jump = Math.max(0, S.jd / 2 - (ttl(o))); o.done = true; S.jumpKind = o.type; } }
    if (manual) for (const o of S.obs) if (Math.abs(ttl(o)) < 0.12 && S.jump < 0) { S.hurt = 0.4; o.wx -= 400; }
  } else if (S.scene === "wall") {
    const c = S.wl, ORDER = ["RH", "LF", "LH", "RF"];
    c.tt += dt; c.stepT += dt; c.dodge = Math.max(0, c.dodge - dt); c.grip = Math.max(0, c.grip - dt);
    if (c.phase === "approach") { c.x = Math.min(91, c.x + V * S.sp * dt); if (c.x >= 91) { c.phase = "pause"; c.tt = 0; } }
    else if (c.phase === "pause") { if (c.tt >= 0.75) { c.phase = "up"; c.tt = 0; c.stepT = 0; } }
    else if (c.phase === "up" || c.phase === "top") {
      for (const k in c.L) { const l = c.L[k]; if (l.t < 1) { l.t = Math.min(1, l.t + dt / (0.55 * M.T)); l.h = lp(l.from, l.tgt, sm01(l.t)); } }
      if (c.phase === "up") {
        if (c.nextRock < 3 && c.steps >= [8, 24, 39][c.nextRock]) {
          c.rocks.push({ t: 0, x: [197, 174, 190][c.nextRock], y: Math.max(28, 98 + Math.max(0, c.z - 22) - WALL_HEIGHT + 15) });
          c.nextRock++;
        }
        for (const rock of c.rocks) rock.t += dt;
        c.rocks = c.rocks.filter(rock => rock.t < 2.3);
        if (!c.condor && c.nextCondor < 3 && c.steps >= [10, 27, 42][c.nextCondor]) c.condor = { x: W + 20, pass: false, t: 0 };
        if (c.condor) { const bird = c.condor; bird.x -= 100 * dt; bird.t += dt;
          if (!bird.pass && bird.x <= 111) { bird.pass = true; c.dodge = 0.85; c.grip = 0.65; c.stepT = 0; c.nextCondor++; }
          if (bird.x < -25) c.condor = null; }
        if (c.grip <= 0 && (M.beatNow && !S.isQuiet || c.stepT >= (S.isQuiet ? 1.15 : M.sounding ? 1.4 : 0.8))) {
          c.stepT = 0; const l = c.L[ORDER[c.steps % 4]]; l.from = l.h; l.tgt = l.h + 12; l.t = 0; c.steps++;
          if (c.steps >= WALL_STEPS) { c.phase = "top"; c.tt = 0; }
        }
      } else if (c.tt >= 1.2) { c.phase = "exit"; c.tt = 0; c.x = 100; }
    } else if (c.phase === "exit") { c.x += V * S.sp * dt; if (c.x >= W + 12 && !S.fadeDir) { S.wallToVines = true; S.fromWall = true; S.noMap = true; switchTo("jungle", now); } }
    c.z = (c.L.LH.h + c.L.RH.h + c.L.LF.h + c.L.RF.h) / 4 - 2.5;
    if (c.phase === "up") c.x = 91;
  } else if (S.scene === "climb") {
    const c = S.cl; c.stepT += dt; const stepNow = M.beatNow && !S.isQuiet || !M.sounding && c.stepT >= 0.7; if (stepNow) c.stepT = 0; {
      if (c.ph === "walk") {
        const sl = c.w > 460 && c.w < 540 ? -1 : 0;   // the only slope is the gangway down to shore
        c.w += V * S.sp * (sl > 0 ? 0.6 : sl < 0 ? 1.3 : 1) * dt; c.z = T(c.w);
        if (c.stage === 0 && c.w >= UPX) { c.stage = 1; c.ph = "up"; c.w = UPX; c.zT = c.z; }
        else if (c.stage === 1 && c.w >= DNX) { c.mt = 0; c.w = 438; c.z = 100; if (c.drop) { c.stage = 3; c.ph = "leap"; c.sub = "wind"; c.zh = 100; } else { c.stage = 2; c.ph = "crouch"; } }
        else if (c.w >= CEND && !S.fadeDir) switchTo("jungle", now);
      } else if (c.ph === "lookWalk") { c.mt += dt; const q = sm01(cl01(c.mt / 0.35)); c.w = UPX + 8 + 18 * q; if (q >= 1) { c.ph = "look"; c.mt = 0; } }
      else if (c.ph === "look") { c.mt += dt; if (c.mt >= 1.6) { c.ph = "walk"; c.mt = 0; } }
      else if (c.ph === "up" || c.ph === "down") {
        const up = c.ph === "up";
        if (stepNow) c.zT = up ? Math.min(UP_TOP, c.zT + 6) : Math.max(40, c.zT - 6);   // one rung on every beat; in a quiet part he clings and waits
        const st = 6 / (0.55 * M.T) * dt; c.z += Math.sign(c.zT - c.z) * Math.min(Math.abs(c.zT - c.z), st);
        if (up && c.z >= UP_TOP - 0.1 && c.zT >= UP_TOP) { c.ph = "mount"; c.mt = 0; c.z = UP_TOP; } else if (!up && c.z <= 40.1) { c.ph = "turn"; c.mt = 0; c.z = 40; c.stage = 3; }
      } else if (c.ph === "leap") {   // the drop: a beat of crouching at the edge (he waits there while it is quiet), then a jump out with the hat held, a long fall, and a deep landing
        if (!(c.sub === "wind" && S.isQuiet)) c.mt += dt;
        if (c.sub === "wind") { if (c.mt >= M.T) { c.sub = "fall"; c.mt = 0; } }
        else if (c.sub === "fall") { const q = cl01(c.mt / 0.8); c.w = 438 + 24 * q; c.zh = 100 - 60 * q * q + 14 * Math.sin(Math.PI * q) * (1 - q); c.z = lp(100, 40, sm01(q)); c.q = q; if (q >= 1) { c.sub = "land"; c.mt = 0; c.z = 40; c.zh = 40; c.w = 462; } }
        else if (c.mt >= 0.8) { c.ph = "walk"; c.w = 464; c.z = 40; }
      } else {   // the moves at the ends of a ladder take a few beats: pull over the edge, crouch and turn at the top, lower himself onto the ladder, let go at the bottom
        c.mt += dt / M.T;
        if (c.ph === "mount") { const q = cl01(c.mt / 2.4); c.q = q; c.z = UP_TOP + 12 * sm01(q); c.w = UPX + 8 * sm01(cl01((q - 0.5) / 0.5)); if (q >= 1) { c.ph = "lookWalk"; c.mt = 0; c.w = UPX + 8; c.z = 100; } }
        else if (c.ph === "crouch") { if (c.mt >= 0.5) { c.ph = "lower"; c.mt = 0; } }
        else if (c.ph === "lower") { const q = 1 - cl01(c.mt / 2.4); c.q = q; c.z = UP_TOP + 12 * sm01(q); c.w = 440 + 6 - 8 * sm01(cl01((q - 0.5) / 0.5)); if (c.mt >= 2.4) { c.ph = "down"; c.z = UP_TOP; c.zT = UP_TOP; c.w = DNW; } }
        else if (c.ph === "turn") { if (c.mt >= 0.8) { c.ph = "walk"; c.w = DNW + 3; c.z = 40; } }
      }
    }
  } else if (S.scene === "river") {
    if (!S.under && now >= S.nextRiverLife && !S.fadeDir) { const kind = ["piranha", "snake", "croc"][S.riverLifeN++ % 3];
      const wx = S.scroll + W - HX + 24, arr = now + (wx - S.scroll) / V;
      S.obs.push({ arr, wx, type: kind, sine: kind !== "croc", lane: [0, 2, 1][(S.riverLifeN - 1) % 3] });
      S.lastArr = Math.max(S.lastArr, arr); S.nextRiverLife = now + 7; }
    if (!manual) {
      const o = S.obs.find(o => o.lane === S.lane && ttl(o) < 0.75 && ttl(o) > -0.1);
      if (o) { const free = [0, 1, 2].filter(l => !S.obs.some(p => p.lane === l && ttl(p) < 1.2 && ttl(p) > -0.2)); if (free.length) S.lane = free.reduce((a, b) => Math.abs(b - S.lane) < Math.abs(a - S.lane) ? b : a); }
      else if (S.lane !== 1 && !S.obs.some(p => p.lane === 1 && ttl(p) < 1.2 && ttl(p) > -0.2) && M.beatNow) S.lane = 1;
    } else for (const o of S.obs) if (o.lane === S.lane && Math.abs(ttl(o)) < 0.1) { S.hurt = 0.4; o.wx -= 400; }
    const ty = LANES[S.lane]; S.laneY += Math.sign(ty - S.laneY) * Math.min(Math.abs(ty - S.laneY), 170 * dt);
    if (M.beatNow || Math.random() < 0.04) S.bubbles.push({ x: HX - 4, y: S.laneY - 4, v: 18 + Math.random() * 14 });
    if (M.beatNow) for (let i = 0; i < 8; i++) { const j = Math.floor(Math.random() * 30), n = M.eqN[j]; if (n >= 3) S.drops.push({ x: j * PITCH + 3, y: 34 - SEG * n, vx: (Math.random() - 0.5) * 30, vy: -(35 + n * 9 + Math.random() * 20) }); }   // spray: on every beat some bars throw drops off their tips
    for (const d of S.drops) { d.vy += 280 * dt; d.y += d.vy * dt; d.x += d.vx * dt; } S.drops = S.drops.filter(d => d.y < 34);
    S.bubbles.forEach(b => { b.y -= b.v * dt; if (!S.under) b.x -= V * 0.3 * dt; }); S.bubbles = S.bubbles.filter(b => b.y > 36 && b.x > -4);
    if (S.under) { if (S.waterEntry) { S.waterEntry.t += dt; if (S.waterEntry.t >= 1.1) S.waterEntry = null; }
      if (!S.waterExit && S.scroll - S.sceneScroll >= WATERWAY_LEN - 6) { S.scroll = S.sceneScroll + WATERWAY_LEN - 6; S.waterExit = { t: 0 }; S.lane = 1; }
      if (S.waterExit) S.waterExit.t += dt; }
  }
  if (S.waterTransfer) { S.waterTransfer = false; setScene("river", now); }   // splash straight into the waterway without a black cut
}

/* ---------- drawing ---------- */
const ridgeH = x => { const i = Math.floor((W - M.farOff - x) / PITCH); return i < 0 || i >= M.far.length ? 0 : (1 + M.far[i]) * SEG; };   // height (px) of the far block mountains at screen column x
const EQS = [[40, 200, 70], [150, 220, 60], [245, 225, 60], [255, 140, 30], [240, 45, 55]];   // the colours of a graphic equalizer, low to high: green, yellow-green, yellow, orange, red
function eqCol(u, k) { const f = Math.max(0, Math.min(1, u)) * (EQS.length - 1), i = Math.min(EQS.length - 2, Math.floor(f)), t = f - i, A = EQS[i], B = EQS[i + 1], m = k === undefined ? 1 : k; return rgb(Math.round(lp(A[0], B[0], t) * m), Math.round(lp(A[1], B[1], t) * m), Math.round(lp(A[2], B[2], t) * m)); }
function drawFar(baseY, pal, off) {   // the far mountains in blocks, like KeySpeaker's terrain: 6 px wide on an 8 px pitch, 3 px tall on a 4 px pitch, the newest column at the right
  for (let i = 0; i < M.far.length; i++) { const x0 = W - M.farOff - (i + 1) * PITCH + 1; if (x0 > W || x0 < -PITCH || M.far[i + (off || 0)] === undefined) continue; const n = 1 + M.far[i + (off || 0)];
    for (let k = 0; k < n; k++) R(x0, baseY - SEG * (k + 1) + 1, 6, SEG_H, pal(k / 9)); } }
const gh = w => { const f = (w - 3) / PITCH, i = Math.floor(f); return lp(S.tr[i] || 0, S.tr[i + 1] || 0, f - i) * SEG; };   // the height (px) of the ground at world x: the block terrain, joined by slopes between the column centres so that he can walk it
/* The hero is not a set of pictures: he is a skeleton (hip, knee, ankle; shoulder, elbow), posed from a run cycle and drawn as thick lines,
   so the stride reads as a real run: the knee is nearly straight when the foot lands and folds deeply while the leg swings forward, the arms swing
   against the legs, the body leans in, and the whole body is lowered so the planted foot always touches the ground (the bob comes out by itself).
   The foot lands on the beat (left) and the off-beat (right). Colours: fedora h, skin s, leather jacket g, khaki trousers p, boots b; tune PAL. */
const PAL = { h: rgb(96, 58, 26), s: rgb(226, 170, 120), g: rgb(138, 84, 36), p: rgb(196, 168, 108), b: rgb(60, 36, 18), k: rgb(58, 34, 18), w: "#fff" };   // fedora, skin, leather jacket, khaki trousers, boots
const FAR = 1.0;   // how dark the far arm and leg are (1 = flat, one colour per part, like the 2600)
const shade = (c, k) => c.replace(/\d+/g, v => Math.round(v * Math.min(1, k + (1 - FAR))));
const DEG = Math.PI / 180, TH = 5.5, SH = 5.5, UA = 4, FA = 3.5, TORSO_L = 7;   // thigh, shin, upper arm, forearm, torso (px)
function seg(x0, y0, x1, y1, col, t) {   // a thick line: a t x t brush walked from one end to the other
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) R(x0 + (x1 - x0) * i / n - (t >> 1), y0 + (y1 - y0) * i / n - (t >> 1), t, t, col);
}
function legAF(hx, hy, aDeg, fDeg) {   // a leg from the hip: the thigh at aDeg from straight down (forward +), the knee folded fDeg
  const a = aDeg * DEG, b = a - fDeg * DEG, kx = hx + TH * Math.sin(a), ky = hy + TH * Math.cos(a);
  return { kx, ky, ax: kx + SH * Math.sin(b), ay: ky + SH * Math.cos(b) };
}
function runLeg(q, hx, hy) {   // q: this leg's phase 0..1; the foot lands (thigh forward, knee straight) at q = 0.25. Tiptoeing: smaller swing, knees always bent
  const sl = (S.slope || 0) * 2, up = Math.max(0, sl), dn = Math.max(0, -sl);   // uphill: short steps, the knee driven high; downhill: long reaching steps, the knee kept soft
  const amp = (1 - 0.45 * S.sneak) * (1 - 0.45 * up + 0.2 * dn), c = Math.cos(2 * Math.PI * q + 0.45);
  return legAF(hx, hy, 8 + 36 * amp * Math.sin(2 * Math.PI * q) + 6 * up, 10 + 28 * S.sneak + 82 * amp * Math.max(0, c) + 26 * up * Math.max(0, c) + 12 * dn);
}
function drawLeg(L, hx, hy, dark) {
  const pc = dark ? shade(PAL.p, 0.6) : PAL.p, bc = dark ? shade(PAL.b, 0.6) : PAL.b;
  seg(hx, hy, L.kx, L.ky, pc, 2); seg(L.kx, L.ky, L.ax, L.ay, pc, 2); R(L.ax - 1, L.ay - 1, 4, 2, bc);   // the boot points forward
}
function drawArm(sx, sy, ang, bend, dark) {   // ang from straight down (forward +); the forearm folds by bend; jacket sleeve to the wrist, then a small hand
  const sc = dark ? shade(PAL.g, 0.6) : PAL.g, kc = dark ? shade(PAL.s, 0.6) : PAL.s, ex = sx + UA * Math.sin(ang), ey = sy + UA * Math.cos(ang);
  const wx = ex + FA * Math.sin(ang + bend), wy = ey + FA * Math.cos(ang + bend);
  seg(sx, sy, ex, ey, sc, 2); seg(ex, ey, wx, wy, sc, 2); R(Math.round(wx) - 1, Math.round(wy) - 1, 2, 2, kc);
}
function armTo(sx, sy, tx, ty, dark, sg) {   // sg = -1 mirrors the elbow (the left arm of a front view)
  sg = sg || 1;   // a two-bone arm reaching a point (the elbow hangs below the line); returns the hand
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1; const L = UA + FA - 0.3;
  if (d > L) { dx *= L / d; dy *= L / d; d = L; }
  const a = (UA * UA - FA * FA + d * d) / (2 * d), h = Math.sqrt(Math.max(0, UA * UA - a * a)), ex = sx + dx * a / d - sg * dy / d * h, ey = sy + dy * a / d + sg * dx / d * h;
  const sc = dark ? shade(PAL.g, 0.6) : PAL.g; seg(sx, sy, ex, ey, sc, 2); seg(ex, ey, sx + dx, sy + dy, sc, 2); R(Math.round(sx + dx) - 1, Math.round(sy + dy) - 1, 2, 2, dark ? shade(PAL.s, 0.6) : PAL.s);
  return { x: sx + dx, y: sy + dy };
}
const FISH = rgb(220, 140, 90);
function drawBody(hx, hy, lean, dip, lookBehind = false) {   // hip at (hx, hy): torso and a head that can turn independently of the running body
  const sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean), d = dip || 0, dy = d ? 2 : 0;
  seg(hx, hy, sx, sy, PAL.g, 4);
  if (lookBehind) { R(sx + 1 + d, sy - 3 + dy, 1, 2, PAL.k); R(sx - 2 + d, sy - 3 + dy, 2, 3, PAL.s); R(sx - 2 + d, sy - 2 + dy, 1, 1, PAL.k); }
  else { R(sx - 1 + d, sy - 3 + dy, 1, 2, PAL.k); R(sx + d, sy - 3 + dy, 2, 3, PAL.s); }
  R(sx - 1 + d, sy - 5 + dy, 3, 1, PAL.h); R(sx + (lookBehind ? -4 : -3) + d, sy - 4 + dy, 8, 1, PAL.h);   // the brim points toward the face
  return { sx, sy };
}
function drawHero(x, feetY, now, mode) {
  const flash = S.hurt > 0 && (Math.floor(now * 20) & 1);
  if (flash) { R(x - 5, feetY - 24, 10, 24, PAL.w); return; }
  if (mode === "swim") {   // side view crawl: the arms take turns, bent and lifted out of the water on the recovery, long and pulling underneath; the legs flutter
    const p = S.ph * 0.5, y = feetY - 7, sx = x + 4, hx = x - 6, k = Math.sin(now * 13);
    const arm = (idx, dark) => {
      const al = 2 * Math.PI * (p + idx * 0.5), up = Math.sin(al) < 0, bend = up ? 1.0 : 0.15;
      const ex = sx + 4 * Math.cos(al - bend), ey = y + 4 * Math.sin(al - bend), hx2 = sx + 8 * Math.cos(al), hy2 = y + 8 * Math.sin(al) * (up ? 1 : 0.7);
      seg(sx, y, ex, ey, dark ? shade(PAL.g, 0.6) : PAL.g, 2); seg(ex, ey, hx2, hy2, dark ? shade(PAL.s, 0.6) : PAL.s, 2);
    };
    arm(1, true);
    seg(hx, y + 1, hx - 4, y + 1 + k * 2, PAL.p, 2); seg(hx - 4, y + 1 + k * 2, hx - 9, y + 1 + k * 4, PAL.p, 2);
    seg(hx, y + 2, hx - 4, y + 2 - k * 2, shade(PAL.p, 0.6), 2); seg(hx - 4, y + 2 - k * 2, hx - 9, y + 2 - k * 4, shade(PAL.p, 0.6), 2);
    seg(hx, y + 1, sx, y, PAL.g, 4);
    R(sx + 1, y - 2, 4, 3, PAL.s); R(sx + 1, y - 4, 4, 1, PAL.h); R(sx - 2, y - 3, 10, 1, PAL.h);
    arm(0, false);
    return;
  }
  if (mode === "swing") {   // hanging from the vine with both hands above the head, the body trailing behind going up and swinging ahead coming down, the legs bent and lagging
    const sk = S.swK, hx = x, L1 = legAF(hx, 0, 12 - 26 * sk, 22 + 12 * Math.abs(sk)), hy = feetY - L1.ay - 1, lean = -sk * 10 * DEG;
    const L2 = legAF(hx, hy, 0 - 26 * sk, 34 + 12 * Math.abs(sk)), sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1, hxT = x + 3, hyT = feetY - 23;
    drawLeg(L2, hx, hy, true); armTo(sx, sy, hxT - 1, hyT + 1, true); drawBody(hx, hy, lean); drawLeg(legAF(hx, hy, 12 - 26 * sk, 22 + 12 * Math.abs(sk)), hx, hy, false); armTo(sx, sy, hxT, hyT, false);
    return;
  }
  if (mode === "find") {   // a discovery: he freezes and clutches his hat, then reaches for the idol, then lifts it high with both hands while the music celebrates (S.fnd = seconds since he stopped)
    const t = S.fnd || 0, hx = x, hy = feetY - legAF(hx, 0, 4, 3).ay - 1, reach = sm01(cl01((t - 0.9) / 0.8)), up = sm01(cl01((t - 1.7) / 0.5)), lean = (2 + 8 * reach * (1 - up)) * DEG;
    const sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1, bob = up * (Math.sin(now * 7) * 1 - M.pulse * 2);
    drawLeg(legAF(hx, hy, -4, 3), hx, hy, true);
    armTo(sx, sy, lp(sx - 1, hx - 1, up), lp(sy + 8, feetY - 29 + bob, up), true);
    drawBody(hx, hy, lean);
    drawLeg(legAF(hx, hy, 4, 3), hx, hy, false);
    armTo(sx, sy, lp(lp(sx + 3, hx + 15, reach), hx + 3, up), lp(lp(sy - 9, feetY - 29, reach), feetY - 30 + bob, up), false);
    return;
  }
  if (mode === "push") {   // pushing something heavy with his whole body: leaning hard into it, both arms straight out against it, the back leg driving, the front knee bent
    const sh = Math.sin(now * 5) * 3, hx = x, Lb = legAF(hx, 0, -34, 8), Lf = legAF(hx, 0, 36, 68), hy = feetY - Math.max(Lb.ay, Lf.ay) - 1, lean = 32 * DEG, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
    drawLeg(legAF(hx, hy, 36 + sh, 68), hx, hy, true); armTo(sx, sy, sx + 8, sy + 2, true); drawBody(hx, hy, lean); drawLeg(legAF(hx, hy, -34 - sh, 8), hx, hy, false); armTo(sx, sy, sx + 8, sy + 5, false);
    return;
  }
  if (mode === "rockCover") {   // crouch low and cover the hat and head with both hands as the boulder passes
    const hx = x, hy = feetY - 4, lean = 46 * DEG, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
    drawLeg(legAF(hx - 1, hy, 76, 132), hx - 1, hy, true);
    armTo(sx, sy, sx - 3, sy - 5, true, -1);
    drawBody(hx, hy, lean);
    drawLeg(legAF(hx, hy, 70, 128), hx, hy, false);
    armTo(sx, sy, sx + 3, sy - 5, false);
    return;
  }
  if (mode === "crouch") {   // crouched in a mine cart: hips low, knees deep, the body leaning forward, both hands gripping the rim ahead, the head up and looking where he is going; he rides the bumps with his knees
    const bump = Math.round(Math.sin(now * 30) * 0.5 + M.pulse * 1.2), hx = x, hy = feetY - 7 + bump, lean = 22 * DEG, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
    drawLeg(legAF(hx - 1, hy, 64, 122), hx - 1, hy, true); armTo(sx, sy, sx + 9, feetY - 9, true); drawBody(hx, hy, lean); drawLeg(legAF(hx, hy, 68, 126), hx, hy, false); armTo(sx, sy, sx + 10, feetY - 10, false);
    return;
  }
  if (mode === "plunge") {   // a straight drop: upright (a touch back), both arms thrown up and windmilling BACKWARDS over the head, the legs pedalling in the air
    const t = now * 9, hx = x, hy = feetY - 9, lean = -5 * DEG, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
    const leg = ph => legAF(hx, hy, 14 * Math.sin(t + ph), 30 + 24 * Math.sin(t + ph + 1.3)), arm = (ph, dark) => { const a = Math.PI + t * 0.9 + ph; armTo(sx, sy, sx + 8 * Math.sin(a), sy + 8 * Math.cos(a), dark); };   // each hand starts straight up and sweeps back, down, forward and up again
    drawLeg(leg(Math.PI), hx, hy, true); arm(Math.PI * 0.8, true); drawBody(hx, hy, lean); drawLeg(leg(0), hx, hy, false); arm(0, false);
    return;
  }
  if (mode === "air") {   // the jump: push off, the lead knee drives up and the other leg trails, arms thrown up, then the legs reach down for the landing
    const u = Math.max(0, Math.min(1, S.jump / (S.jd || JD))), tuck = Math.pow(Math.sin(Math.PI * u), 0.8), hx = x, lean = (6 + 10 * tuck) * DEG;
    let L1 = legAF(hx, 0, 22 + 76 * tuck, 8 + 104 * tuck), L2 = legAF(hx, 0, -18 - 20 * tuck, 15 + 78 * tuck);
    const hy = feetY - Math.max(L1.ay, L2.ay) - 1;
    L1 = legAF(hx, hy, 22 + 76 * tuck, 8 + 104 * tuck); L2 = legAF(hx, hy, -18 - 20 * tuck, 15 + 78 * tuck);
    const sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
    drawLeg(L2, hx, hy, true); drawArm(sx, sy, (-100 - 20 * tuck) * DEG, 20 * DEG, true);
    drawBody(hx, hy, lean); drawLeg(L1, hx, hy, false);
    const hold = sm01(cl01(u / 0.12)) * (1 - sm01(cl01((u - 0.9) / 0.1)));   // the near hand goes up to hold the fedora in the air and lets go as he lands; the far arm trails behind
    armTo(sx, sy, lp(sx + 3, sx + 2, hold), lp(sy + 7, sy - 4, hold), false);
    return;
  }
  if (mode === "fall") {   // the drop: a swan dive off the edge (body leaning out, arms reaching ahead, legs trailing), then he flails (arms and legs windmilling wide, body coming upright), then the legs reach down for the landing; S.fq runs 0..1
    const q = S.fq, amp = S.fHop ? 0.65 : 1, t = S.fHop ? q * 7 : now * 19, fl = S.fHop ? 1 : sm01(cl01((q - 0.2) / 0.15)), rd = sm01(cl01((q - 0.85) / 0.15)), hx = x, hy = feetY - 9, hop = S.fHop, lean = (hop ? lp(18, 6, rd) : lp(lp(80, 22, sm01(cl01((q - 0.1) / 0.6))), 8, rd)) * DEG;   // hop: a long jump over a pond, flailing all the way
    const sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
    const leg = (ph, swan, mid) => legAF(hx, hy, lp(lp(swan, mid + 52 * amp * Math.sin(t + ph), fl), 16, rd), lp(lp(6, 62 + 52 * Math.sin(t + ph + 1.2), fl), 20, rd));
    const arm = (swan, mid, ph) => lp(lp(swan, mid + 78 * amp * Math.sin(t + ph), fl), 55, rd) * DEG;   // angles from straight down; 90 is sideways, 180 straight up
    drawLeg(leg(Math.PI, -52, -20), hx, hy, true); drawArm(sx, sy, arm(130, -80, 1.9), (18 + 40 * fl * (0.5 + 0.5 * Math.sin(t + 0.6))) * DEG, true);
    drawBody(hx, hy, lean);
    drawLeg(leg(0, -30, 25), hx, hy, false); drawArm(sx, sy, arm(150, 100, 0), (18 + 40 * fl * (0.5 + 0.5 * Math.sin(t + 2.6))) * DEG, false);
    return;
  }
  if (mode === "hide") {   // crouched small behind the bush: knees up, back bent, head down, arms round the knees
    const hx = x, L1 = legAF(hx, 0, 68, 128), hy = feetY - L1.ay - 1, lean = 52 * DEG, A = legAF(hx, hy, 68, 128), B = legAF(hx - 1, hy, 62, 122);
    drawLeg(B, hx - 1, hy, true); const sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean);
    drawBody(hx, hy, lean, 2); drawLeg(A, hx, hy, false); seg(sx, sy + 1, A.kx - 1, A.ky - 1, PAL.g, 2); seg(A.kx - 1, A.ky - 1, A.kx + 1, A.ky + 1, PAL.s, 2);
    return;
  }
  if (mode === "sit" || mode === "eat") {   // sitting by the fire, knees up, facing it; eating: the fish goes up to the mouth on every second beat, a bite each time
    const hx = x, hy = feetY - 3, lean = 6 * DEG, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
    seg(hx - 1, hy, hx + 4, hy - 2, shade(PAL.p, 0.6), 2); seg(hx + 4, hy - 2, hx + 6, feetY - 1, shade(PAL.p, 0.6), 2);
    armTo(sx, sy, hx + 3, hy - 4, true);
    drawBody(hx, hy, lean);
    seg(hx, hy, hx + 5, hy - 2, PAL.p, 2); seg(hx + 5, hy - 2, hx + 7, feetY - 1, PAL.p, 2); R(hx + 6, feetY - 2, 4, 2, PAL.b);
    let up = 0, bites = 0;
    if (mode === "eat") { const e = (S.camp.b - 6) / 2, u = e - Math.floor(e); bites = Math.floor(e); up = u < 0.3 ? u / 0.3 : u < 0.55 ? 1 : u < 0.85 ? 1 - (u - 0.55) / 0.3 : 0; up = up * up * (3 - 2 * up); }
    const hand = armTo(sx, sy, hx + 5 + (sx + 3 - hx - 5) * up, hy - 4 + (sy - 1 - hy + 4) * up, false);
    if (mode === "eat" && bites < 5) { seg(hand.x + 1, hand.y + 3, hand.x + 1, hand.y - 3, C.log, 1); R(hand.x, hand.y - 8, 3, 6 - bites, FISH); R(hand.x, hand.y - 8, 3, 1, rgb(250, 190, 120)); }   // the fish on a stick, eaten from the top
    return;
  }
  if (mode === "sleep") {   // flat on his back, the hat over his face, knees up, hands on his chest; the chest rises and falls slowly
    const hx = x, y = feetY, br = Math.sin(now * 1.6) > 0 ? 1 : 0;
    seg(hx, y - 3, hx + 5, y - 6, PAL.p, 2); seg(hx + 5, y - 6, hx + 10, y - 3, PAL.p, 2); R(hx + 10, y - 3, 3, 3, PAL.b);
    seg(hx, y - 3, hx - 8, y - 3, PAL.g, 4); R(hx - 7, y - 6 - br, 4, 1, PAL.g); seg(hx - 7, y - 5, hx - 2, y - 5, shade(PAL.g, 0.8), 2); R(hx - 3, y - 6, 2, 2, PAL.s);
    R(hx - 12, y - 5, 4, 4, PAL.s); R(hx - 14, y - 7, 7, 3, PAL.h); R(hx - 14, y - 4, 2, 1, PAL.h);
    return;
  }
  const hx = x, idle = mode === "idle", p = S.ph, breathe = Math.sin(now * 2.2);
  let la, lb, lean, sw0, sw1, bendA;
  const gY = fx => feetY - (S.slope || 0) * (fx - hx);   // the ground under a foot: on a slope the foot ahead meets higher ground
  const mk = (f) => { let a = f(0), b = f(1); const hy = Math.min(gY(a.ax) - a.ay, gY(b.ax) - b.ay) - 1; return { hy, a: f(0, hy), b: f(1, hy) }; };
  let pose;
  if (idle) { pose = mk((i, hy) => legAF(hx, hy || 0, i ? -4 : 4, 3)); lean = (3 + breathe + S.wob) * DEG; sw0 = 8 * DEG; sw1 = -8 * DEG; bendA = 20 * DEG; }
  else { pose = mk((i, hy) => runLeg(p + i * 0.5, hx, hy || 0)); lean = (9 + 16 * S.sneak + S.wob) * DEG; const A = 36 * (1 - 0.45 * S.sneak);
    const f0 = -Math.sin(2 * Math.PI * p), f1 = -Math.sin(2 * Math.PI * (p + 0.5));   // each arm swings against the leg on its own side
    sw0 = A * f0 * DEG; sw1 = A * f1 * DEG; bendA = [(68 + 32 * f0) * DEG * (1 - 0.25 * S.sneak), (68 + 32 * f1) * DEG * (1 - 0.25 * S.sneak)]; }
  const hy = pose.hy, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
  drawLeg(pose.b, hx, hy, true); drawArm(sx, sy, sw1, Array.isArray(bendA) ? bendA[1] : bendA, true);   // far leg and far arm first
  drawBody(hx, hy, lean, 0, mode === "pyramidLook");
  drawLeg(pose.a, hx, hy, false); drawArm(sx, sy, sw0, Array.isArray(bendA) ? bendA[0] : bendA, false);
}
function drawJaguar(x, now) {   // something big and quiet passing behind the bush: a dark cat with yellow eyes, legs padding
  const K = rgb(14, 12, 18), SP = rgb(110, 80, 20), w = now * 9;
  for (let i = 0; i < 4; i++) { const lx = x - 8 + (i >> 1) * 15 + (i & 1) * 3, o = Math.round(Math.sin(w + i * 1.6) * 2); R(lx + o, GY - 5, 2, 5, K); }
  R(x - 11, GY - 12, 24, 8, K); R(x - 18, GY - 14, 8, 7, K); R(x - 17, GY - 16, 2, 2, K); R(x - 12, GY - 16, 2, 2, K);
  seg(x + 12, GY - 11, x + 19, GY - 15, K, 2); seg(x + 19, GY - 15, x + 21, GY - 11, K, 2);
    R(x - 17, GY - 12, 2, 2, C.gold); R(x - 13, GY - 12, 2, 2, C.gold);
}
function drawBush(x, u) {   // the bush the hero hides behind, grown from the ground by u (0..1)
  const h = Math.round(15 * u); if (h < 1) return;
  for (let i = 0; i < 6; i++) { const bx = x - 12 + i * 4, bh = h - (i % 2) * 3 - Math.abs(i - 2.5) * 1.2 | 0; if (bh > 0) { R(bx, GY - bh, 5, bh, C.leaf); R(bx, GY - bh, 5, 2, C.leaf2); } }
  R(x - 10, GY - 2, 20, 2, C.leaf);
}
function drawIdol(x, by, now, big) {   // an Aztec treasure standing on y = by: a gold mask with turquoise eyes and ear spools under a fan of quetzal feathers; big: held overhead, with rays that pulse on the beat
  const G1 = rgb(252, 208, 64), G2 = rgb(176, 124, 24), TQ = rgb(40, 200, 190), GR = rgb(30, 170, 80), RD = rgb(214, 50, 40), DK = rgb(60, 36, 8);
  if (big) { const r = 8 + Math.round(M.pulse * 4); g.fillStyle = "rgba(255,220,90,0.18)"; g.fillRect(x - r, by - 9 - r, r * 2, r * 2); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + now * 1.5; R(x + Math.cos(a) * (r + 3), by - 9 + Math.sin(a) * (r + 3), 1, 1, i & 1 ? "#fff" : G1); } }
  R(x - 5, by - 12, 2, 4, GR); R(x - 3, by - 14, 2, 6, TQ); R(x - 1, by - 15, 3, 7, RD); R(x + 2, by - 14, 2, 6, TQ); R(x + 4, by - 12, 2, 4, GR);   // the fan of quetzal feathers
  R(x - 3, by - 9, 7, 8, G1); R(x - 3, by - 9, 7, 1, G2); R(x - 5, by - 7, 2, 3, TQ); R(x + 4, by - 7, 2, 3, TQ);   // the gold face and the turquoise ear spools
  R(x - 2, by - 7, 2, 2, TQ); R(x + 1, by - 7, 2, 2, TQ); R(x - 2, by - 7, 1, 1, DK); R(x + 2, by - 7, 1, 1, DK); R(x, by - 5, 1, 2, G2); R(x - 2, by - 3, 5, 1, DK); R(x - 1, by - 3, 1, 1, "#fff"); R(x + 1, by - 3, 1, 1, "#fff"); R(x - 2, by - 1, 5, 1, G2);   // eyes, nose, a toothy mouth, the chin
}
function drawRelic(x, now, taken, clue) {   // a person-high stepped stone altar; the golden mask rests on top until taken
  const S1 = rgb(120, 112, 100), S2 = rgb(160, 150, 134), TQ = rgb(40, 200, 190), DK = rgb(70, 64, 56);
  for (const [w, h, y] of [[30, 4, 4], [26, 5, 9], [22, 6, 15], [18, 7, 22], [14, 4, 26]]) { R(x - w / 2, GY - y, w, h, S1); R(x - w / 2, GY - y, w, 1, S2); }
  for (let i = 0; i < 6; i++) { R(x - 13 + i * 5, GY - 3, 3, 1, DK); R(x - 12 + i * 5, GY - 2, 1, 2, DK); }   // the fret band
  R(x - 2, GY - 14, 4, 3, TQ);   // a turquoise inlay
  if (clue && (Math.floor(now * 8) & 1)) { R(x - 2, GY - 17, 4, 2, rgb(180, 250, 245)); R(x + 11, GY - 12, 2, 2, rgb(180, 250, 245)); }   // the loose stone catches his eye
  if (!taken) { drawIdol(x, GY - 26, now, false); if ((Math.floor(now * 3) & 1)) { R(x + 5, GY - 38, 1, 3, "#fff"); R(x + 4, GY - 37, 3, 1, "#fff"); } }
}
function drawWarrior(x, fy, now, i, ph, stance) {   // an Aztec temple guardian, built like the hero (the same skeleton and run cycle: the planted foot always touches the ground, the knee folds as the leg swings, the body leans in): a feathered headdress, a cotton tunic with a sash and loincloth, bare arms with gold bands, sandals, a round shield on the near arm and a spear in the far hand
  const SK = rgb(150, 92, 58), TN = rgb(236, 150, 60), TQ = rgb(40, 200, 190), RD = rgb(214, 50, 40), GR = rgb(30, 170, 80), G1 = rgb(252, 208, 64), WD = rgb(120, 80, 40), OB = rgb(30, 24, 30);
  const p = ph + i * 0.27, hx = x, sv = { p: PAL.p, b: PAL.b, g: PAL.g, s: PAL.s };
  PAL.p = SK; PAL.b = rgb(184, 134, 66); PAL.g = SK; PAL.s = SK;   // the hero's limb routines, in the guardian's colours
  const standing = stance === "stand", legF = (q, y0) => standing ? legAF(hx, y0, q < 0.5 ? 5 : -5, 4) : runLeg(q, hx, y0);   // a standing guard: the legs at rest, the spear planted upright
  const hy = fy - Math.max(legF(p, 0).ay, legF(p + 0.5, 0).ay) - 1, lA = legF(p, hy), lB = legF(p + 0.5, hy);
  const lean = standing ? 2 * DEG : (12 + 3 * M.pulse) * DEG, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
  drawLeg(lB, hx, hy, true);
  const pump = standing ? 0 : Math.sin(2 * Math.PI * p), hf = standing ? armTo(sx, sy, sx + 5, sy + 4, true) : armTo(sx, sy, sx + 7 + pump, sy - 3 + pump * 2, true);   // the arms pump with the stride   // the far hand grips a spear, held forward and up
  if (standing) { seg(hf.x, fy, hf.x, fy - 36, WD, 1); R(hf.x - 1, fy - 40, 3, 4, OB); R(hf.x - 1, fy - 36, 3, 1, RD); }
  else { seg(hf.x - 6, hf.y + 7, hf.x + 10, hf.y - 8, WD, 1); R(hf.x + 10, hf.y - 10, 2, 2, OB); R(hf.x + 8, hf.y - 7, 1, 1, RD); }
  seg(hx, hy, sx, sy, TN, 4); seg(hx - 1, hy - 3, sx + 1, sy + 2, "#fff", 1);   // the tunic, a pale sash across it
  R(hx - 2, hy, 5, 3, RD); R(hx - 2, hy, 5, 1, G1); R(hx - 3, hy + 1, 1, 2, RD);   // the loincloth
  R(sx - 1, sy - 4, 4, 4, SK); R(sx + 2, sy - 3, 1, 1, OB); R(sx - 1, sy - 4, 1, 4, OB); R(sx - 2, sy - 5, 6, 1, G1);   // the head: hair, an eye, a gold band
  R(sx - 4, sy - 9, 1, 4, TQ); R(sx - 3, sy - 11, 1, 6, RD); R(sx - 1, sy - 12, 1, 7, GR); R(sx + 1, sy - 11, 1, 6, TQ); R(sx - 2, sy - 10, 1, 5, G1);   // the feathers, streaming back as he runs
  drawLeg(lA, hx, hy, false); R(lA.ax, lA.ay - 2, 2, 1, G1); R(lB.ax, lB.ay - 2, 2, 1, shade(G1, 0.6));   // gold anklets
  const hn = armTo(sx, sy, sx + 5 - pump, sy + 4 - pump * 2, false); R(hn.x - 1, hn.y - 1, 2, 1, G1); R(hf.x - 1, hf.y - 1, 2, 1, G1);   // gold wristbands   // the near arm holds the round shield at the chest
  R(hn.x - 1, hn.y - 4, 6, 8, RD); R(hn.x - 2, hn.y - 3, 8, 6, RD); R(hn.x, hn.y - 2, 4, 4, G1); R(hn.x + 1, hn.y - 1, 2, 2, TQ); R(sx - 1, sy + 3, 2, 1, G1);
  PAL.p = sv.p; PAL.b = sv.b; PAL.g = sv.g; PAL.s = sv.s;
}
function drawMaskedHunter(x, fy, now, i, ph, stance) {   // the nearest treasury pursuer wears a carved mask and carries a spear
  const SK = rgb(157, 93, 57), OCHRE = rgb(232, 169, 56), RED = rgb(192, 48, 37), TQ = rgb(43, 189, 167), DARK = rgb(38, 29, 26), WOOD = rgb(119, 75, 39);
  const saved = { p: PAL.p, b: PAL.b, g: PAL.g, s: PAL.s }, hx = x, p = ph + i * 0.27, standing = stance === "stand";
  PAL.p = SK; PAL.b = DARK; PAL.g = SK; PAL.s = SK;
  const legF = (q, y0) => standing ? legAF(hx, y0, q < 0.5 ? 5 : -5, 4) : runLeg(q, hx, y0);
  const hy = fy - Math.max(legF(p, 0).ay, legF(p + 0.5, 0).ay) - 1, back = legF(p + 0.5, hy), front = legF(p, hy);
  const sx = hx + (standing ? 0 : 2), sy = hy - TORSO_L + 1, pump = standing ? 0 : Math.sin(2 * Math.PI * p);
  drawLeg(back, hx, hy, true);
  const grip = armTo(sx + 1, sy + 1, sx + 7 + pump, sy - 3 + pump * 2, true);
  if (standing) { seg(grip.x + 1, fy, grip.x + 1, fy - 38, WOOD, 1); R(grip.x, fy - 42, 3, 4, OCHRE); }
  else { seg(grip.x - 7, grip.y + 8, grip.x + 13, grip.y - 11, WOOD, 1); R(grip.x + 12, grip.y - 14, 4, 4, OCHRE); R(grip.x + 13, grip.y - 12, 2, 2, TQ); }
  seg(hx, hy, sx, sy, OCHRE, 5); R(hx - 3, hy, 7, 3, RED); R(hx - 1, hy + 2, 3, 3, TQ);
  R(sx - 4, sy - 2, 9, 2, TQ); R(sx - 5, sy - 6, 10, 2, RED);   // mask silhouette and painted crown
  R(sx - 4, sy - 5, 9, 8, OCHRE); R(sx - 4, sy - 5, 2, 8, RED); R(sx + 3, sy - 5, 2, 8, RED);
  R(sx - 2, sy - 2, 2, 1, DARK); R(sx + 2, sy - 2, 2, 1, DARK); R(sx, sy, 2, 2, TQ); R(sx - 1, sy + 3, 4, 1, DARK);
  R(sx - 6, sy - 3, 2, 3, OCHRE); R(sx + 5, sy - 3, 2, 3, OCHRE);   // broad mask and side tabs
  drawLeg(front, hx, hy, false);
  armTo(sx - 1, sy + 2, sx + 3 - pump, sy + 5 - pump * 2, false);
  PAL.p = saved.p; PAL.b = saved.b; PAL.g = saved.g; PAL.s = saved.s;
}
function drawResident(x, fy, now, kind, seed) {   // the guardians who live in the cavern: some stand guard with a planted spear, some walk their ledge, some sit by a fire, some sleep on a mat
  const SK = rgb(150, 92, 58), TN = rgb(236, 150, 60), TQ = rgb(40, 200, 190), RD = rgb(214, 50, 40), GR = rgb(30, 170, 80), G1 = rgb(252, 208, 64);
  if (kind === "stand") drawWarrior(x, fy, now, seed % 3, 0, "stand");
  else if (kind === "walk") { const dir = Math.cos(now * 0.5 + seed) > 0 ? 1 : -1, px = Math.round(x + Math.sin(now * 0.5 + seed) * 26); g.save(); if (dir < 0) { g.translate(px, 0); g.scale(-1, 1); g.translate(-px, 0); } drawWarrior(px, fy, now, seed % 3, now * 1.1 + seed * 0.3); g.restore(); }
  else if (kind === "sit") { R(x - 7, fy - 3, 11, 3, SK); R(x - 3, fy - 12, 7, 9, TN); R(x - 3, fy - 8, 7, 1, "#fff"); R(x - 2, fy - 17, 5, 4, SK); R(x + 1, fy - 16, 1, 1, "#000"); R(x - 3, fy - 18, 7, 1, G1); R(x - 4, fy - 23, 1, 5, TQ); R(x - 2, fy - 25, 1, 7, RD); R(x, fy - 24, 1, 6, GR); R(x + 2, fy - 22, 1, 4, TQ); seg(x + 3, fy - 9, x + 8 + (Math.floor(now * 2 + seed) & 1), fy - 6, SK, 1); }
  else { const br = Math.floor(now * 1.2 + seed) & 1; R(x - 10, fy - 2, 22, 2, rgb(190, 60, 50)); R(x - 9, fy - 6 - br, 13, 4, TN); R(x - 15, fy - 5, 6, 3, SK); R(x + 4, fy - 7, 5, 4, SK); R(x + 9, fy - 8, 7, 2, TQ); R(x + 9, fy - 6, 6, 2, RD); R(x + 6, fy - 5, 1, 1, "#000"); if (Math.floor(now * 1.5 + seed) & 1) { R(x + 12, fy - 14, 2, 1, "#fff"); R(x + 14, fy - 18, 2, 1, "#fff"); } }   // sleeping, with a drifting z
}
function drawChasers(now, gb) {
  const c = S.chase, t = c.t;
  for (let i = 2; i >= 0; i--) {
    const drawPursuer = S.scene === "cavern" && i === 0 ? drawMaskedHunter : drawWarrior;
    let x = lp(-26 - i * 16, HX - 26 - i * 13 + 8 * M.level, sm01(cl01(t / 1.8))); if (t > 8.5) x -= (t - 8.5) * 45; if (S.lab && S.lab.cartS >= 2) x -= Math.max(0, (S.lab.rideT || 0)) * 90;   // in the cart he leaves them far behind
    if (c.stuck) { const ex = HX + c.wx0 - 8 - i * 13 - S.scroll; if (ex < x) x = ex; else if (x > ex) x = ex; drawPursuer(Math.round(x), gb, now, i, 0, "stand"); if (x < -30) continue; continue; }   // at the edge they stop dead, and the rope leaves them behind   // they come in from the left, gain on him in loud parts, and give up at last
    if (x < -30) continue;
    const wx = S.scroll + (x - HX); let lift = 0; for (const o of S.obs) { const d = Math.abs(o.wx - wx), r = (o.hw || 10) + 6; if (o.type !== "nut" && d < r) lift = Math.max(lift, (o.type === "croc" ? 16 : 13) * Math.sin(Math.PI * (1 - d / r))); }   // they leap over what he has already cleared
    if (S.scene === "cavern") for (let n = 0; n < NST; n++) { const st = cavSt(n); if (st.lvl === S.cav.lvl) { const hd = st.kind === "gap" ? 24 : st.kind === "pit" ? 34 : 14, c0 = st.kind === "gap" || st.kind === "pit" ? st.xs : st.xs + 5, d = Math.abs(wx - c0); if (d < hd) lift = Math.max(lift, 15 * Math.sin(Math.PI * (1 - d / hd))); } }   // over the gaps and the ladder holes
    drawPursuer(Math.round(x), (S.scene === "cave" && S.lab ? GY - Math.round(labH(wx)) : gb) - Math.round(lift), now, i, S.ph);
  }
}
function drawJungleHunter(now) {   // masked spear-carrier appears ahead or behind, then loses the faster, leaping hero
  const h = S.hunter; if (!h) return;
  const x = Math.round(h.side === "front" ? 255 - 64 * h.t : -20 + 45 * Math.min(h.t, 2.2) - 50 * Math.max(0, h.t - 2.2));
  if (x < -25 || x > W + 25) return;
  const fy = GY - Math.round(S.land === "forest" ? gh(S.scroll + x - HX) : 0);
  g.save(); if (h.side === "front") { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
  drawMaskedHunter(x, fy, now, 0, S.ph + h.t * 1.4);
  g.restore();
}
function drawStatue(cx, now, pushing) {   // an Aztec stone idol over the hole, Tlaloc-like: a stepped base carved with a stepped-fret band, a tall squared body with a collar, goggle eyes ringed in turquoise, long curved fangs, ear spools, and a fan of quetzal feathers over a gold headband
  if (cx < -24 || cx > W + 24) return;
  const L = rgb(150, 150, 132), D = rgb(98, 98, 86), K = rgb(40, 40, 34), TQ = rgb(40, 200, 190), TQD = rgb(20, 130, 130), GD = rgb(252, 208, 64), GD2 = rgb(190, 140, 30), RD = rgb(200, 56, 46), GR = rgb(30, 170, 80), MS = rgb(70, 130, 60), B = GY;
  R(cx - 16, B - 5, 32, 5, D); R(cx - 14, B - 10, 28, 5, L); R(cx - 16, B - 5, 32, 1, L);   // the stepped base
  for (let i = 0; i < 6; i++) { R(cx - 12 + i * 5, B - 9, 4, 1, K); R(cx - 12 + i * 5, B - 9, 1, 3, K); R(cx - 9 + i * 5, B - 7, 1, 2, K); R(cx - 12 + i * 5, B - 7, 3, 1, K); }   // a stepped-fret (xicalcoliuhqui) band
  R(cx - 11, B - 36, 22, 26, L); R(cx - 11, B - 36, 3, 26, D); R(cx + 8, B - 36, 3, 26, D);   // the body
  R(cx - 13, B - 22, 4, 6, TQ); R(cx + 9, B - 22, 4, 6, TQ); R(cx - 12, B - 21, 2, 4, GD);   R(cx + 10, B - 21, 2, 4, GD);   // ear spools
  R(cx - 9, B - 31, 18, 1, K); R(cx - 9, B - 12, 18, 2, GD2); R(cx - 9, B - 12, 18, 1, GD);   // a gold collar
  for (const ex of [-8, 2]) { R(cx + ex, B - 29, 7, 7, TQ); R(cx + ex + 1, B - 28, 5, 5, L); R(cx + ex + 2, B - 27, 3, 3, TQD); R(cx + ex + 3, B - 26, 1, 1, K); }   // the goggle eyes: rings of turquoise
  R(cx - 4, B - 21, 8, 4, D); R(cx - 2, B - 20, 1, 1, K); R(cx + 1, B - 20, 1, 1, K);   // the nose
  R(cx - 8, B - 17, 16, 4, K); R(cx - 7, B - 17, 3, 6, "#ece8d4"); R(cx + 4, B - 17, 3, 6, "#ece8d4"); R(cx - 6, B - 11, 1, 1, "#ece8d4"); R(cx + 5, B - 11, 1, 1, "#ece8d4"); for (let i = 0; i < 3; i++) R(cx - 3 + i * 2, B - 17, 1, 2, "#ece8d4");   // the long fangs
  R(cx - 12, B - 40, 24, 4, GD2); R(cx - 12, B - 40, 24, 1, GD); for (let i = 0; i < 5; i++) R(cx - 10 + i * 5, B - 39, 3, 2, i & 1 ? RD : TQ);   // the headband
  R(cx - 10, B - 48, 2, 8, GR); R(cx - 7, B - 52, 2, 12, TQ); R(cx - 4, B - 55, 2, 15, RD); R(cx - 1, B - 56, 2, 16, GR); R(cx + 2, B - 55, 2, 15, RD); R(cx + 5, B - 52, 2, 12, TQ); R(cx + 8, B - 48, 2, 8, GR); R(cx - 1, B - 54, 2, 6, GD);   // the fan of quetzal feathers
  R(cx - 10, B - 11, 5, 2, MS); R(cx + 6, B - 35, 4, 2, MS);
  if (pushing) for (let i = 0; i < 4; i++) { const f = ((now * 5 + i * 0.37) % 1); g.fillStyle = "rgba(170,150,120," + (0.5 - f * 0.45) + ")"; g.fillRect(cx - 20 - f * 8 - i * 4, B - 3 - f * 4, 5, 3); }   // dust scraped up
}
function drawHole(x) {   // a hole in the road: a black shaft with a ragged lip, roots hanging in it
  R(x - 12, GY, 24, H - GY, rgb(6, 4, 3)); R(x - 12, GY, 24, 3, rgb(34, 22, 12)); R(x - 14, GY, 2, 8, rgb(90, 62, 32)); R(x + 12, GY, 2, 8, rgb(90, 62, 32)); R(x - 14, GY - 1, 4, 2, C.grass); R(x + 10, GY - 1, 4, 2, C.grass);
  R(x - 8, GY + 3, 1, 8, rgb(96, 64, 30)); R(x + 5, GY + 3, 1, 6, rgb(96, 64, 30)); R(x - 3, GY + 3, 1, 4, rgb(96, 64, 30));
}
function drawLog(x, now, y) {   // a fallen tree trunk lying along the path, seen from the side: rounded bark with streaks, a moss patch, a knot, and the sawn end toward him with its growth rings
  const bark = C.log, dk = rgb(60, 36, 18), tan = rgb(218, 176, 116), ring = rgb(150, 100, 56);
  R(x - 8, y - 10, 17, 10, bark); R(x - 9, y - 9, 19, 8, bark);   // a rounded body
  R(x - 7, y - 10, 15, 1, rgb(140, 92, 48)); R(x - 6, y - 7, 12, 1, dk); R(x - 4, y - 4, 13, 1, dk); R(x - 8, y - 2, 11, 1, dk); R(x - 1, y - 9, 1, 3, dk);   // bark streaks
  R(x + 2, y - 6, 3, 3, dk); R(x + 3, y - 5, 1, 1, bark); R(x + 3, y - 11, 5, 2, C.leaf2);   // a knot and moss
  R(x - 12, y - 9, 4, 8, tan); R(x - 13, y - 8, 1, 6, tan); R(x - 11, y - 7, 2, 4, ring); R(x - 10, y - 6, 1, 2, tan);   // the sawn end, with its rings
}
function drawCrocHead(x, sy, now, tt) {   // a pond crocodile: just a head, in profile, facing the hero. Eyes lurk at the surface; as he comes the head rises out of the water, and the jaws gape at a right angle (the lower jaw level, the upper jaw straight up); then it sinks again. tt = seconds until the hero reaches it
  const hx = x + 4, red = rgb(170, 30, 44), up = cl01((1.5 - tt) / 0.55) * (1 - cl01((-0.5 - tt) / 0.4)), open = tt < 0.7 && tt > -0.3, y = sy + Math.round((1 - up) * 16);
  g.save(); g.beginPath(); g.rect(0, 0, W, sy + 1); g.clip();   // the water hides whatever is below the surface
  if (up < 0.15) { R(hx + 3, sy - 1, 2, 1, C.gold); R(hx - 9, sy - 1, 2, 1, C.gold); }   // two eyes just breaking the surface
  else {
    R(hx - 2, y - 4, 9, 5, C.croc); R(hx + 2, y - 8, 4, 4, C.croc); R(hx + 3, y - 7, 2, 2, C.gold); R(hx + 8, y - 1, 8, 2, C.crocD);   // the back of the head, the eye on its bump (behind the hinge), a knobbly back
    const ang = 90 * sm01(cl01((1.0 - tt) / 0.55)) * (1 - sm01(cl01((-0.15 - tt) / 0.45))), a = Math.round(ang / 22.5) * 22.5 * DEG;   // the jaws open in steps (0, 22, 45, 67, 90 degrees) so that the gape has in-between pictures
    if (a === 0) { R(hx - 22, y - 4, 21, 5, C.croc); R(hx - 22, y - 1, 21, 1, C.crocD); R(hx - 23, y - 5, 2, 1, C.croc); }
    else {
      R(hx - 24, y - 1, 25, 5, C.croc); R(hx - 24, y - 1, 25, 2, red); for (let i = 0; i < 12; i++) R(hx - 24 + i * 2, y - 2, 1, 1, C.white);   // the lower jaw stays level, red inside, with teeth
      const px = hx - 1, py = y - 1, L = 23, dx = -Math.cos(a), dy = -Math.sin(a), nx = -Math.sin(a), ny = Math.cos(a);   // the upper jaw swings up on the hinge at the back of the head
      seg(px, py, px + dx * L, py + dy * L, C.croc, 5);
      for (let i = 1; i < 11; i++) { const f = i / 11 * L, qx = px + dx * f + nx * 3, qy = py + dy * f + ny * 3; R(qx - 1, qy - 1, 2, 2, red); R(qx - 2 + (nx < -0.5 ? 0 : 0), qy - 2, 1, 1, C.white); }
    } }
  g.restore();
  if (tt < 1.8 && tt > -0.9) { const w = 6 + Math.round(8 * (1 - Math.min(1, Math.abs(tt - 0.3) / 1.2))); R(hx - 14 - (w >> 1), sy + 1, w, 1, C.water2); R(hx + 6, sy + 1, w, 1, C.water2); }   // ripples
}
function drawRiverCroc(x, y, now, tt) { // side profile, head facing left, swimming across the screen
  const t = now * 4 + x * 0.025, G = C.croc, shade = C.crocD, belly = rgb(98, 150, 74), teeth = rgb(244, 231, 188);
  // submerged tail and armored back in lateral silhouette
  for (let i = 0; i < 8; i++) {
    const tx = x + 16 + i * 3, ty = y + Math.round(Math.sin(t - i * 0.55) * (1 + i * 0.25));
    R(tx, ty - Math.max(1, 5 - Math.floor(i * 0.6)), 4, Math.max(2, 9 - i), G);
  }
  R(x - 11, y - 5, 29, 10, G); R(x - 9, y + 3, 27, 3, belly);
  for (let i = 0; i < 5; i++) R(x - 4 + i * 5, y - 6, 3, 2, shade);
  const kick = Math.round(Math.sin(t) * 2);
  R(x + 4 + kick, y + 4, 7, 3, shade); R(x - 3 - kick, y + 4, 6, 3, shade);
  // long, unmistakable sideways snout and raised eye mound
  R(x - 29, y - 4, 20, 7, G); R(x - 33, y - 3, 6, 6, G);
  R(x - 12, y - 9, 8, 6, G); R(x - 10, y - 8, 3, 3, teeth); R(x - 9, y - 8, 2, 2, shade);
  R(x - 31, y - 4, 2, 1, shade); // nose
  const gape = Math.max(0, Math.sin((1 - tt) * 4)) * sm01(cl01((1.2 - tt) / 0.6));
  if (gape > 0.25) { // lower jaw opens downward, clearly seen from the side
    const drop = Math.round(gape * 6);
    R(x - 31, y + 3 + drop, 24, 3, belly); R(x - 28, y + 3, 21, drop + 1, rgb(145, 42, 42));
    for (let i = 0; i < 7; i++) R(x - 28 + i * 3, y + 3, 1, 2, teeth);
  } else {
    R(x - 32, y + 3, 25, 2, belly); R(x - 30, y + 2, 18, 1, shade);
  }
  R(x + 2, y + 7, 13, 1, C.water2); R(x - 26, y + 7, 16, 1, C.water2);
}
function drawPiranha(x, y, now) {   // small red fish, flashing teeth and a beating forked tail
  const kick = Math.round(Math.sin(now * 12 + x * 0.06) * 2), red = rgb(217, 63, 54), dark = rgb(113, 37, 45);
  R(x - 5, y - 4, 12, 8, red); R(x - 3, y - 5, 8, 1, rgb(246, 126, 67));
  seg(x + 6, y, x + 12, y - 5 + kick, dark, 2); seg(x + 6, y, x + 12, y + 5 + kick, dark, 2);
  R(x - 8, y - 2, 4, 5, red); R(x - 7, y - 1, 1, 1, rgb(255, 238, 185));
  for (let i = 0; i < 3; i++) R(x - 7 + i * 2, y + 2, 1, 2, rgb(255, 247, 220));
  R(x - 2, y + 4, 6, 1, dark);
}
function drawRiverSnake(x, y, now) {   // a long green body cuts through the open river, head facing the swimmer
  const body = rgb(82, 143, 70), shade = rgb(35, 86, 61);
  for (let i = 0; i < 13; i++) { const sy = y + Math.round(Math.sin(now * 3 - i * 0.65) * 3); R(x + i * 3, sy, i > 9 ? 2 : 4, 3, body); R(x + i * 3, sy, i > 9 ? 2 : 4, 1, shade); }
  R(x - 8, y - 3, 9, 6, body); R(x - 7, y - 4, 5, 2, shade); R(x - 6, y - 1, 1, 1, rgb(252, 224, 100));
  if (Math.sin(now * 6) > 0) { R(x - 11, y + 1, 3, 1, rgb(214, 82, 83)); R(x - 12, y, 1, 3, rgb(214, 82, 83)); }
}
function drawWaterSnake(x, y, now) {   // a small snake undulates in place near the waterway wall
  const body = rgb(104, 154, 78), back = rgb(53, 104, 65);
  for (let i = 0; i < 10; i++) { const sy = y + Math.round(Math.sin(now * 2.4 - i * 0.7) * 2), w = i > 7 ? 2 : 4; R(x + i * 3, sy, w, 2, body); R(x + i * 3, sy, w, 1, back); }
  R(x - 6, y - 2, 7, 5, body); R(x - 5, y - 3, 5, 1, back); R(x - 4, y - 1, 1, 1, rgb(240, 220, 116)); if (Math.sin(now * 5) > 0) R(x - 8, y + 1, 2, 1, rgb(202, 76, 72));
}
const TG = rgb(226, 124, 28), TGD = rgb(24, 16, 10), PALE = rgb(240, 226, 190), RED = rgb(170, 30, 44);
function drawTiger(x, y, now, tt) {   // a tiger facing the hero: it paces in place, tail swishing; as he comes it rears its head and roars
  const roar = tt < 0.9 && tt > -0.25, st = Math.round(Math.sin(now * 5) * 1.5), tw = Math.sin(now * 4);
  R(x - 9, y - 12, 21, 7, TG); for (let i = 0; i < 4; i++) R(x - 6 + i * 5, y - 12, 2, 7, TGD); R(x - 9, y - 6, 21, 1, PALE);   // body, stripes, pale belly
  R(x - 9 + st, y - 5, 3, 5, TG); R(x - 5 - st, y - 5, 3, 5, TG); R(x + 6 - st, y - 5, 3, 5, TG); R(x + 10 + st, y - 5, 3, 5, TG);   // legs padding
  seg(x + 12, y - 11, x + 17, y - 11 - 3 * tw, TG, 2); seg(x + 17, y - 11 - 3 * tw, x + 18, y - 17 - 3 * tw, TG, 2); R(x + 17, y - 14 - 3 * tw, 2, 1, TGD);   // the tail
  const hy = y - (roar ? 18 : 15);   // the head lifts to roar
  R(x - 18, hy, 9, 7, TG); R(x - 18, hy - 2, 2, 2, TG); R(x - 11, hy - 2, 2, 2, TG); R(x - 15, hy + 2, 2, 1, C.gold); R(x - 12, hy, 1, 3, TGD); R(x - 16, hy, 1, 2, TGD);   // head, ears, an eye, face stripes
  if (!roar) R(x - 20, hy + 4, 3, 3, PALE); else { R(x - 21, hy + 1, 4, 2, TG); R(x - 21, hy + 7, 4, 2, TG); R(x - 20, hy + 3, 4, 4, RED); R(x - 20, hy + 3, 1, 1, "#fff"); R(x - 20, hy + 6, 1, 1, "#fff"); }   // closed: a pale muzzle; roaring: jaws wide, red, with fangs
}
function drawBear(x, y, now, tt) {   // a brown bear on all fours; as he comes it rises on its hind legs, arms up, and roars
  const BR = rgb(100, 62, 34), BRD = rgb(64, 38, 20), up = cl01((0.9 - tt) / 0.25) * (1 - cl01((-0.2 - tt) / 0.25));
  if (up < 0.5) { const st = Math.round(Math.sin(now * 4) * 1.5);
    R(x - 11, y - 14, 24, 9, BR); R(x - 11, y - 14, 24, 2, BRD); R(x - 11 + st, y - 5, 4, 5, BRD); R(x - 6 - st, y - 5, 4, 5, BR); R(x + 5 - st, y - 5, 4, 5, BR); R(x + 10 + st, y - 5, 4, 5, BRD);
    R(x - 19, y - 15, 9, 8, BR); R(x - 19, y - 17, 3, 2, BRD); R(x - 12, y - 17, 3, 2, BRD); R(x - 23, y - 11, 5, 4, rgb(150, 110, 70)); R(x - 23, y - 12, 2, 1, TGD); R(x - 15, y - 13, 2, 1, C.gold); }
  else {   // rearing and attacking: up on its hind legs, leaning toward him, BOTH arms raised high and clawing at him, the mouth wide open
    const lz = Math.round(5 * up), sw = Math.round(Math.sin(now * 14) * 2);   // it leans in, and the paws swipe
    R(x - 5, y - 7, 5, 7, BRD); R(x + 2, y - 7, 5, 7, BRD);   // hind legs
    R(x - 7 - (lz >> 1), y - 18, 14, 12, BR); R(x - 7 - (lz >> 1), y - 18, 14, 2, BRD);   // barrel body, leaning
    const sx1 = x - 4 - lz, sx2 = x + 1 - lz, sy = y - 17;   // shoulders
    seg(sx2, sy, x - 13 - lz, y - 33 + sw, BRD, 4); seg(sx1, sy + 1, x - 22 - lz, y - 28 - sw, BR, 4);   // both arms thrown up and forward, the far one darker
    for (const [cx, cy] of [[x - 13 - lz, y - 34 + sw], [x - 22 - lz, y - 29 - sw]]) { R(cx - 2, cy - 2, 1, 2, "#fff"); R(cx, cy - 2, 1, 2, "#fff"); R(cx + 2, cy - 2, 1, 2, "#fff"); }   // claws
    const hx = x - 7 - lz, hy = y - 25; R(hx, hy, 9, 8, BR); R(hx, hy - 2, 3, 2, BRD); R(hx + 6, hy - 2, 3, 2, BRD); R(hx - 4, hy + 3, 5, 5, rgb(150, 110, 70)); R(hx - 4, hy + 5, 5, 2, RED); R(hx - 3, hy + 5, 1, 1, "#fff"); R(hx - 3, hy + 7, 1, 1, "#fff"); R(hx + 3, hy + 2, 2, 1, C.gold);   // the head, ears, the open mouth with fangs, an eye
  }
}
const MK = rgb(120, 70, 30), MKD = rgb(78, 44, 20), MKF = rgb(226, 176, 128);
const monkeyY = (t, now) => Math.round(42 + 16 * Math.sin(now * 0.9 + t.wx * 0.013));   // he shuttles up and down the trunk
function drawTree(t, now) {   // a palm with a monkey on it: he climbs up and down by hands and feet in time with the beat, and throws a coconut when the hero comes near
  const sx = Math.round(HX + t.wx - S.scroll); if (sx < -20 || sx > W + 24) return;
  const base = GY - Math.round(gh(t.wx)), my = monkeyY(t, now), ph = Math.floor(now / (M.T / 2)) & 1, th = now - t.throwAt < 0.35;
  const TK = rgb(150, 100, 52), TKD = rgb(104, 66, 30);
  R(sx - 3, 14, 7, base - 14, TK); R(sx + 2, 14, 2, base - 14, TKD); for (let y = 22; y < base; y += 5) R(sx - 3, y, 7, 1, TKD);   // a lighter, thicker trunk than the jungle's own, so the palm stands out
  const LF = rgb(40, 170, 60), LF2 = rgb(90, 210, 80);
  R(sx - 20, 15, 12, 3, LF); R(sx + 9, 15, 12, 3, LF); R(sx - 12, 11, 24, 3, LF2); R(sx - 7, 7, 14, 3, LF); R(sx - 24, 18, 6, 3, LF); R(sx + 19, 18, 6, 3, LF); R(sx - 26, 21, 3, 3, LF); R(sx + 24, 21, 3, 3, LF);   // drooping fronds
  R(sx - 3, 15, 3, 3, C.trunk); R(sx + 1, 15, 3, 3, C.trunk);   // coconuts
  seg(sx - 6, my + 5, sx - 10, my + 8, MKD, 1); seg(sx - 10, my + 8, sx - 8, my + 11, MKD, 1);   // the tail
  R(sx - 6, my, 4, 6, MK); R(sx - 7, my - 4, 4, 4, MK); R(sx - 7, my - 3, 2, 2, MKF); R(sx - 8, my - 5, 2, 2, MK);   // body, head with a pale face, an ear
  R(sx - 3, my + (ph ? 0 : 3), 2, 1, MKD); R(sx - 3, my + (ph ? 4 : 1), 2, 1, MKD);   // hands and feet take the trunk in turn
  if (th) { R(sx - 9, my - 7, 2, 4, MK); R(sx - 10, my - 9, 3, 3, C.trunk); } }
function drawNut(o, x, now) {
  const q = cl01((now - o.born) / o.Tf), gy = GY - Math.round(gh(o.wx));
  if (q < 1) { const xw = lp(o.xw0, o.wx, q), y = lp(o.y0, gy - 3, q) - 10 * 4 * q * (1 - q), sx = Math.round(HX + xw - S.scroll), sp = Math.floor(now * 18) & 1; R(sx - 2, Math.round(y) - 2, 5, 5, C.trunk); R(sx - 2 + sp * 2, Math.round(y) - 2, 2, 2, C.dirt2); }
  else { R(x - 3, gy - 6, 6, 6, C.trunk); R(x - 2, gy - 5, 2, 2, C.dirt2); R(x - 1, gy - 7, 2, 1, C.trunk); } }
function drawBats(now) {   // the bat of every old game: it crosses overhead in zigzags, wings beating four times a beat
  for (const b of S.bats) { const x = Math.round(b.x), y = Math.round(b.y), f = Math.floor(b.t / (M.T / 4)) & 1, c = S.scene === "cave" ? rgb(150, 100, 190) : rgb(90, 50, 120);
    R(x - 1, y, 4, 3, c); R(x, y, 1, 1, C.gold); R(x + 2, y, 1, 1, C.gold); R(x - 1, y - 2, 1, 2, c); R(x + 2, y - 2, 1, 2, c);
    if (f) { R(x - 5, y - 2, 4, 1, c); R(x - 7, y - 3, 2, 1, c); R(x + 3, y - 2, 4, 1, c); R(x + 7, y - 3, 2, 1, c); } else { R(x - 5, y + 2, 4, 1, c); R(x - 7, y + 3, 2, 1, c); R(x + 3, y + 2, 4, 1, c); R(x + 7, y + 3, 2, 1, c); } } }
const KP = [[0, 0, 255], [0, 255, 255], [0, 255, 0], [173, 255, 41], [255, 255, 0], [255, 165, 0], [255, 0, 0], [255, 0, 255]];   // KeySpeaker's equalizer palette, low pitch to high: blue, cyan, green, yellow-green, yellow, orange, red, magenta
const bandCol = j => { const t = j * 7 / 29, a = t >= 7 ? 6 : Math.floor(t), u = t - a; return rgb(Math.trunc(KP[a][0] + (KP[a + 1][0] - KP[a][0]) * u), Math.trunc(KP[a][1] + (KP[a + 1][1] - KP[a][1]) * u), Math.trunc(KP[a][2] + (KP[a + 1][2] - KP[a][2]) * u)); };
// Stage-specific EQ. The 30 live frequency bands stay legible; their costumes and layering change.
const FOREST_EQ = KP.map(([r, green, b]) => rgb(r, green, b));   // KeySpeaker colors by vertical tier: blue at the foot, magenta at the tip
const FLAME_EQ = [rgb(255, 226, 96), rgb(255, 177, 48), rgb(248, 114, 30), rgb(224, 60, 25), rgb(176, 38, 25)];
const SURF_EQ = [rgb(255, 255, 255), rgb(241, 252, 255), rgb(216, 246, 255), rgb(183, 232, 249), rgb(156, 219, 243), rgb(132, 206, 237)];
function drawStageEQ(style, base, maxSegments = 8, now = 0) {
  for (let j = 0; j < 30; j++) {
    const n = Math.min(maxSegments, Math.round(M.eqH[j]));
    const x = j * PITCH + 1;
    let col;
    if (style === "earth") col = rgb(136 + Math.round(j * 2.5), 77 + Math.round(j * 1.5), 33 + (j % 4) * 4);
    else if (style === "mural") col = [rgb(224, 75, 52), rgb(244, 182, 54), rgb(39, 183, 143), rgb(72, 146, 218), rgb(197, 102, 183)][Math.floor(j / 3) % 5];
    else if (style === "weed") col = [rgb(20, 94, 48), rgb(40, 155, 70), rgb(88, 198, 92), rgb(142, 214, 91)][j % 4];
    else col = FOREST_EQ[0];
    for (let k = 0; k < n; k++) {
      const h = style === "weed" ? 4 : SEG;
      const y = base - h * (k + 1) + 1;
      if (style === "flame") { R(x, y, 6, SEG_H, FLAME_EQ[4]); R(x + 1, y, 4, SEG_H, FLAME_EQ[Math.min(4, Math.floor(k * 5 / Math.max(1, n)))]); }
      else { const sway = style === "weed" ? Math.round(Math.sin(now * 2.1 + j * 0.65 + k * 0.23) * Math.min(3, k * 0.4)) : 0; R(x + sway, y, style === "weed" ? 4 : 6, style === "weed" ? 4 : SEG_H, style === "forest" ? FOREST_EQ[Math.min(k, 7)] : style === "surf" ? SURF_EQ[Math.min(k, 5)] : style === "riverSurf" ? SURF_EQ[5 - Math.min(k, 5)] : col); }
    }
    // Peak markers only in the stone and mural displays: grass/water plants should look organic.
    if (style === "earth" || style === "mural") {
      const pk = Math.min(maxSegments, Math.round(M.pk[j]));
      if (pk > n) R(x, base - SEG * (pk + 1) + 1, 6, 2, style === "earth" ? rgb(244, 192, 112) : rgb(248, 224, 154));
    }
  }
}
function trebleFlame(now, seed = 0) {
  // A small high-frequency-driven sway, never an on/off flash.
  return Math.round(0.8 * Math.sin(now * 4.5 + seed) + M.treble * 2.2 * Math.sin(now * 9.5 + seed));
}
function drawFgWave(now) {   // the foreground, in front of everything along the bottom edge: a real graphic equalizer, 30 bars (bass at the left, treble at the right), each in its own colour as in KeySpeaker, with the peak marks, analysed as KeySpeaker does
  for (let j = 0; j < 30; j++) { const n = Math.round(M.eqH[j]), x0 = j * PITCH + 1, col = rgb(46, 170, 78);   // one colour: forest green
    for (let k = 0; k < n; k++) R(x0, H - SEG * (k + 1) + 1, 6, SEG_H, col);
    const pp = Math.round(M.pk[j]); if (pp > n) R(x0, H - SEG * (pp + 1) + 1, 6, SEG_H, "#fff"); } }
function drawLightWave(now, base, scale, alpha, shift) {   // the equalizer as a sea of light the whole adventure happens inside: KeySpeaker's rainbow, each band a column of glowing blocks that fade toward the top, drawn additively so that the scenery shows through; a far layer behind him and a nearer, fainter one in front
  const hs = []; for (let x = 0; x < W; x += 4) { const f = Math.min(28.99, Math.max(0, (x + shift) / 8)), j = Math.floor(f); hs.push(lp(M.eqH[j], M.eqH[j + 1], f - j)); }
  g.save(); g.globalCompositeOperation = "lighter";
  for (let i = 0; i < hs.length; i++) { const x = i * 4, n = Math.round(hs[i] * scale), col = bandCol(Math.min(29, Math.round((x + shift) / 8))), m = col.match(/\d+/g);
    for (let k = 0; k < n; k++) { const a = alpha * (0.35 + 0.65 * (1 - k / Math.max(4, n))) * (k >= n - 1 ? 1.6 : 1); g.fillStyle = "rgba(" + m[0] + "," + m[1] + "," + m[2] + "," + Math.min(0.9, a) + ")"; g.fillRect(x, base - 4 * (k + 1), 4, 4); } }
  g.restore(); }
function drawDepartingShip(now, horizon) {   // a large passenger ship leaves the hero on the beach, then slowly shrinks toward the horizon
  const elapsed = Math.max(0, now - (S.shipStart ?? S.t0)), away = cl01(elapsed / 48);
  if (away >= 1) return;
  const x = Math.round(92 + 105 * sm01(cl01(elapsed / 26)) + 28 * sm01(cl01((elapsed - 26) / 22))), s = 1 - 0.94 * away;
  g.save(); g.globalAlpha = 1 - cl01((away - 0.82) / 0.18);
  const P = (dx, dy, w, h, color) => R(x + dx * s, horizon + dy * s, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), color);
  P(-47, 3, 12, 1, "rgba(255,244,220,0.8)"); P(-51, 5, 10, 1, "rgba(255,244,220,0.55)");   // wake trailing behind the stern
  P(-34, -5, 68, 7, rgb(45, 53, 82)); P(-30, 1, 58, 2, rgb(152, 51, 48)); P(30, -4, 4, 4, rgb(45, 53, 82));   // deep hull, red waterline and rising bow
  P(-29, -16, 53, 11, rgb(248, 243, 223)); P(-23, -22, 36, 6, rgb(255, 250, 234)); P(9, -20, 15, 4, rgb(255, 250, 234));   // two passenger decks and bridge
  P(-13, -28, 9, 6, rgb(210, 60, 40)); P(-12, -29, 7, 2, rgb(75, 58, 56)); P(3, -26, 7, 4, rgb(210, 60, 40));   // red funnels
  for (let i = 0; i < 10; i++) P(-25 + i * 5, -12, 3, 3, rgb(39, 74, 100));
  for (let i = 0; i < 6; i++) P(-18 + i * 5, -20, 3, 2, rgb(39, 74, 100));
  for (let i = 0; i < 9; i++) P(-26 + i * 6, -2, 2, 1, rgb(255, 215, 125));   // cabin windows and lit portholes
  g.restore();
}
function drawOpenSky(now, sc) {   // the beach: a sunset sky, departing liner, drifting wave crests, and far palms on the sand
  const bands = ["rgb(30,94,174)", "rgb(52,128,205)", "rgb(78,161,222)", "rgb(112,191,235)", "rgb(153,211,242)", "rgb(192,228,247)"];
  for (let i = 0; i < bands.length; i++) R(0, Math.round(i * GY / bands.length), W, Math.ceil(GY / bands.length) + 1, bands[i]);
  const sr = 9 + Math.round(M.pulse * 2); g.fillStyle = "rgba(255,240,170,0.35)"; g.fillRect(150 - sr - 3, 56 - sr - 3, (sr + 3) * 2, (sr + 3) * 2); R(150 - sr + 2, 56 - sr + 2, (sr - 2) * 2, (sr - 2) * 2, "rgb(255,236,160)"); R(150 - sr + 4, 56 - sr, (sr - 4) * 2, sr * 2, "rgb(255,236,160)");   // the sun
  for (let i = 0; i < 5; i++) { const cx = ((i * 71 - sc * 0.06 - now * 3) % 330 + 330) % 330 - 40, cy = 14 + (i * 23) % 40; R(cx, cy, 26, 5, "rgb(255,255,255)"); R(cx + 5, cy - 3, 14, 3, "rgb(255,255,255)"); R(cx + 3, cy + 5, 20, 2, "rgb(183,215,231)"); }   // clouds
  const SY = GY - 36;   // the horizon
  for (let i = 0; i < 4; i++) R(0, SY + i * 7, W, 8, ["rgb(100,178,220)", "rgb(62,143,204)", "rgb(36,107,180)", "rgb(18,75,145)"][i]);   // the sea, deeper toward the beach
  for (let r = 0; r < 4; r++) for (let k = -1; k < 12; k++) { const x = Math.round(((k * 31 + r * 17 - sc * (0.05 + r * 0.03) - now * (4 + r * 2)) % 372 + 372) % 372 - 30), y = SY + 3 + r * 7 + Math.round(Math.sin(now * 2 + k + r) * (1 + 2 * M.level)); R(x, y, 7 + r * 2, 1, "rgb(212,241,255)"); }   // wave crests drift along, bigger in loud music
  if (M.pulse > 0.4) for (let i = 0; i < 5; i++) R(120 + i * 17, SY + 2 + (i * 5) % 9, 1, 1, "#fff");   // the sea glitters on the beat
  if (S.landN === 1) drawDepartingShip(now, SY);
  R(0, GY - 8, W, 8, "rgb(214,170,120)"); R(0, GY - 8, W, 1, "rgb(240,200,160)"); for (let k = -1; k < 14; k++) { const x = Math.round(((k * 29 - sc * 0.3) % 400 + 400) % 400 - 20), f = (Math.sin(now * 1.6 + k) + 1) * 1.2; R(x, GY - 9 - Math.round(f), 12, 1, "rgba(255,226,200,0.8)"); }   // wet sand and the foam at the water's edge
  drawStageEQ("surf", GY - 7, 6, now);   // white-to-aqua sound bars rise from the shoreline like spray
  for (let i = -1; i < 5; i++) { const x = Math.round(((i * 83 - sc * 0.3) % 330 + 330) % 330 - 40), sw = Math.round(Math.sin(now * 1.3 + i) * 1 + (M.eqH[0] + M.eqH[1] + M.eqH[2]) / 3 * 0.35);   // the palms sway with the bass;   // far palms on the sand, leaning a little
    R(x + 8, GY - 30, 3, 28, rgb(70, 50, 40)); R(x + 9, GY - 22, 1, 1, rgb(90, 62, 36)); R(x + 9, GY - 14, 1, 1, rgb(90, 62, 36));
    for (const d of [-1, 1]) { R(x + 9 + d * 4 + sw, GY - 33, 6, 2, "rgb(20,86,58)"); R(x + 9 + d * 9 + sw, GY - 31, 5, 2, "rgb(40,120,70)"); R(x + 9 + d * 12 + sw, GY - 29, 3, 2, "rgb(20,86,58)"); } R(x + 5 + sw, GY - 36, 9, 3, "rgb(40,120,70)"); R(x + 8, GY - 29, 3, 3, rgb(110, 70, 30)); }   // coconuts under the crown
}
function drawBeachTurtle(x, now) {   // a small sea turtle crawling across the sand, head toward the approaching hero
  const shell = rgb(68, 102, 55), rim = rgb(42, 73, 47), plate = rgb(132, 150, 75), skin = rgb(87, 128, 77);
  const step = Math.floor(now * 5 + x * 0.03) & 1;
  R(x - 13, GY - 1, 27, 1, "rgba(94,68,47,0.35)");
  R(x + 7, GY - 3 + step, 6, 3, skin); R(x - 8, GY - 3 + (1 - step), 6, 3, skin); R(x + 11, GY - 5, 4, 2, skin);
  R(x - 14, GY - 7, 7, 5, skin); R(x - 15, GY - 5, 3, 2, skin); R(x - 11, GY - 6, 1, 1, rgb(20, 30, 24));
  R(x - 8, GY - 7, 18, 6, rim); R(x - 6, GY - 9, 14, 7, shell); R(x - 3, GY - 11, 8, 3, shell);
  R(x - 4, GY - 8, 6, 3, plate); R(x + 4, GY - 7, 3, 2, plate); R(x - 7, GY - 5, 2, 2, plate);
}
function drawTarzan(now) {   // a sunlit break in the mountain forest: the trail ends at a ravine and hanging vines carry him across
  const t = S.tarzan.t, sky = [rgb(39, 113, 190), rgb(72, 153, 214), rgb(120, 190, 229), rgb(174, 216, 238)];
  for (let i = 0; i < 4; i++) R(0, i * 24, W, 25, sky[i]);
  for (let i = 0; i < 4; i++) { const x = Math.round(((i * 83 - t * 4) % 330 + 330) % 330 - 30), y = 13 + i * 12; R(x, y, 25, 3, "#fff"); R(x + 6, y - 3, 12, 3, "#fff"); }
  for (let x = 0; x < W; x += 4) { const far = 78 + Math.round(7 * Math.sin((x + t * 5) * 0.025) + 3 * Math.sin(x * 0.08)); R(x, far, 4, H - far, rgb(74, 135, 135)); const near = 96 + Math.round(8 * Math.sin((x + t * 11) * 0.035)); R(x, near, 4, H - near, rgb(35, 85, 86)); }
  R(0, 115, W, 20, rgb(17, 50, 68));
  const edgeL = Math.round(105 - t * 45), edgeR = Math.round(240 - Math.max(0, t - 12) * 42);
  if (edgeL > 0) { R(0, 88, edgeL, H - 88, C.dirt); R(0, 86, edgeL, 3, C.grass); R(Math.max(0, edgeL - 5), 88, 5, H - 88, C.dirt2); }
  if (t > 12) { R(edgeR, 88, W - edgeR, H - 88, C.dirt); R(edgeR, 86, W - edgeR, 3, C.grass); R(edgeR, 88, 5, H - 88, C.dirt2); }
  const vines = [46, 120, 194], step = Math.min(2, Math.floor(t / TARZAN_STEP)), u = Math.min(1, (t - step * TARZAN_STEP) / TARZAN_STEP), onVine = u < 0.76;
  const swing = sm01(cl01(u / 0.76)), leap = cl01((u - 0.76) / 0.24);
  const nextX = step < vines.length - 1 ? vines[step + 1] - 22 : 235;
  const handX = onVine ? vines[step] - 22 + 44 * swing : lp(vines[step] + 22, nextX, leap);
  const handY = onVine ? 57 - Math.round(8 * Math.sin(swing * Math.PI)) : Math.round((step === vines.length - 1 ? lp(57, 63, leap) : 57) - 12 * Math.sin(leap * Math.PI));
  for (let i = 0; i < vines.length; i++) { const ax = vines[i], grip = onVine && i === step || !onVine && step < vines.length - 1 && leap > 0.78 && i === step + 1;
    const bx = grip ? handX : ax + Math.round(Math.sin(now * 1.3 + i * 0.7) * 16), by = grip ? handY : 60;
    R(ax - 8, 0, 16, 5, rgb(27, 104, 49)); seg(ax, 3, bx, by, rgb(32, 153, 67), 2);
    for (let y = 12; y < 51; y += 13) R(Math.round(lp(ax, bx, y / by)) + (i & 1 ? 1 : -4), y, 5, 2, rgb(61, 183, 78)); }
  if (onVine || step < vines.length - 1 && leap > 0.78) { S.swK = onVine ? 2 * swing - 1 : -1; drawHero(Math.round(handX), handY + 23, now, "swing"); }
  else drawHero(Math.round(handX), handY + 23, now, "air");
}
const FOREST_LEAF_BANDS = [rgb(7, 74, 32), rgb(12, 94, 35), rgb(24, 118, 39), rgb(45, 147, 43), rgb(83, 181, 48), rgb(144, 213, 55)];
function drawForestApple(x, y) {   // one bright fruit at the same x as its trunk, at the explorer's shoulder height
  R(x - 1, y - 3, 2, 2, rgb(92, 67, 28)); R(x, y - 4, 3, 2, rgb(67, 167, 58));
  R(x - 3, y - 1, 7, 5, rgb(194, 35, 30)); R(x - 2, y, 5, 4, rgb(235, 47, 36)); R(x - 2, y, 2, 1, rgb(255, 153, 100));
}
function drawForestCanopy() {   // fixed-height leaf columns drift in front of the trunks; 3-pixel green-to-lime bands evoke a graphic EQ
  for (let i = M.canopy.length - 1; i >= -1; i--) { const x = W - M.farOff - (i + 1) * PITCH, h = i < 0 ? M.canopyNext : M.canopy[i];
    for (let y = 0; y < h; y += 3) { const band = Math.min(FOREST_LEAF_BANDS.length - 1, Math.floor((y + 1) * FOREST_LEAF_BANDS.length / h)); R(x, y, PITCH, Math.min(3, h - y), FOREST_LEAF_BANDS[band]); }
    R(x + 2, h - 3, 4, 2, rgb(174, 229, 67)); }
}
function drawJungle(now) {
  const d = (1 - M.level);
  const sc = S.scroll, open = S.land === "open";
  if (open) drawOpenSky(now, sc);
  else {
  R(0, 0, W, GY, C.sky); for (let y = 30; y < GY; y += 6) R(0, y, W, 3, C.sky2);
  drawFar(GY - 6, u => rgb(6 + 40 * u * u, 30 + 40 * u, 24 + 16 * u), 10);   // a second, hazier range behind: the volume of ten columns earlier
  drawFar(GY, u => rgb(8 + 100 * u * u, 40 + 90 * u, 26 + 20 * u));   // the mountains in blocks: a picture of the last few seconds of volume, as in KeySpeaker
  drawStageEQ("forest", GY, 8); // KeySpeaker's blue-to-magenta height bands behind the tree trunks
  const firstTree = Math.floor(sc * 0.25 / 47) - 1;
  for (let i = firstTree; i < firstTree + 9; i++) { const x = i * 47 - sc * 0.25 - 30; R(x, 0, 7, GY, C.trunk); R(x + 5, 0, 2, GY, C.dirt2);
    if (i % 2 === 0 && !S.apples.has(i)) drawForestApple(x + 3, GY - Math.round(gh(sc + x + 3 - HX)) - 18);
  }   // apple and trunk share a fixed world position; collected fruit stays gone
  drawForestCanopy();
  if (d > 0.45) for (let i = 0; i < 3; i++) { const ex = ((i * 97 - sc * 0.5) % 260 + 260) % 260 - 10; if (Math.sin(S.flick * 2 + i * 2) > -0.7) { R(ex, GY - 22 - i * 6, 2, 2, C.gold); R(ex + 6, GY - 22 - i * 6, 2, 2, C.gold); } }   // eyes in the bushes when it is quiet
  }
  if (open) { R(0, GY, W, 4, rgb(226, 184, 130)); R(0, GY + 4, W, H - GY - 4, rgb(190, 146, 100)); R(0, GY + 14, W, 12, rgb(162, 120, 82)); }   // on the beach the road is sand
  else if (S.jmode === "hills") { for (let x = 0; x < W; x += 4) { const y = GY - Math.round(gh(sc + x - HX)); R(x, y + 4, 4, H - y - 4, C.dirt); R(x, y + 14, 4, 12, C.dirt2); R(x, y, 4, 4, C.grass); } }   // the sloping path keeps the same visible soil layer as the level forest
  else { R(0, GY, W, 4, C.grass); R(0, GY + 4, W, H - GY - 4, C.dirt); R(0, GY + 14, W, 12, C.dirt2); }   // the first stretch of forest stays level
  for (let i = -1; i < 28; i++) { if (!open && S.jmode === "hills") break; const k = Math.floor((sc - HX) / 9) + i, x = HX + k * 9 - sc, hh = Math.imul(k, 2654435761) >>> 0, a = (hh >>> 8) % 5, b = (hh >>> 16) % 7;   // grass tufts, light stones and dark pits, each fixed to the world, so that the ground is seen to move
    if (a < 2) { const gc = open ? rgb(150, 160, 70) : C.leaf2; R(x, GY - 2, 1, 2, gc); R(x + 2, GY - 3, 1, 3, gc); R(x + 4, GY - 2, 1, 2, gc); }
    if (open) { if (b === 0) { R(x, GY + 7, 3, 2, "rgb(250,240,230)"); R(x + 1, GY + 7, 1, 1, "rgb(240,170,160)"); } else if (b === 3) R(x + 1, GY + 11, 3, 2, rgb(170, 140, 90)); else if (b === 5) R(x, GY + 5, 2, 1, rgb(190, 160, 108)); }   // shells and darker patches in the sand
    else if (b === 0) R(x, GY + 7, 5, 2, rgb(140, 100, 58)); else if (b === 3) R(x + 1, GY + 11, 3, 2, rgb(30, 18, 10)); else if (b === 5) R(x, GY + 5, 2, 1, rgb(140, 100, 58)); }
  if (open) for (const t of S.trees) drawTree(t, now);
  for (const r of S.rel) { const x = Math.round(HX + r.wx - S.scroll); if (x > -20 && x < W + 20) { if (r.entrance && r.shift > 2) drawHole(x); drawRelic(x + (r.shift || 0), now, r.taken, r.clue); } }
  for (const o of S.obs) { const x = obsX(o); if (x > W + 20) continue;
    if (o.type === "log") drawLog(x, now, GY - Math.round(gh(o.wx)));
    else if (o.type === "turtle") drawBeachTurtle(x, now);
    else if (o.type === "nut") drawNut(o, x, now);
    else if (o.type === "hole") { drawHole(x); drawStatue(Math.round(HX + (o.sx === undefined ? o.wx : o.sx) - S.scroll), now, S.fall && S.fall.o === o && S.fall.t < 1.8); }
    else if (o.type === "tiger") drawTiger(x, GY - Math.round(gh(o.wx)), now, ttl(o));
    else if (o.type === "bear") drawBear(x, GY - Math.round(gh(o.wx)), now, ttl(o));
    else { const hw = o.hw || 14; R(x - hw, GY, hw * 2, 12, C.water); R(x - hw, GY, hw * 2, 2, C.water2); if (o.wide) { drawCrocHead(x - 14, GY, now, ttl(o)); drawCrocHead(x + 16, GY, now, ttl(o) + 0.12); } else if (o.hasCroc) drawCrocHead(x + 2, GY, now, ttl(o)); } }
  const gb = GY - Math.round(gh(sc));   // where he stands: the ground under him
  let y = gb, air = false;
  if (S.jump >= 0) { const u = S.jump / (S.jd || JD); y = gb - 4 * (S.jh || JH) * u * (1 - u); air = true; }
  const hd = S.hide; if (hd && hd.t > 0.8) drawJaguar(W + 30 - (hd.t - 0.8) * 75, now);
  const pond = air && S.jumpKind === "croc" && S.jd > JD;   // only the long jump over a wide pond uses the diving, flailing pose; every other jump is the hop with a hand on the hat
  let mode = air ? "air" : hd ? (hd.t < 5.0 ? "hide" : "idle") : "run";
  S.sl = (S.sl || 0) + (Math.max(-1, Math.min(1, (gh(sc + 4) - gh(sc - 4)) / 8 / 0.5)) - (S.sl || 0)) * 0.2; S.slope = 0.5 * S.sl;   // uphill he leans in and shortens his stride, downhill he leans back (the same as on the climb slopes)
  S.wob = S.sl > 0 ? 4 * S.sl : 12 * S.sl;
  if (S.col) {   // out of strength: the stride slows, he sways, tips over, and lies there dizzy
    const t = S.col.t;
    if (t < 2) { S.wob = 12 * t + 14 * Math.sin(t * 6) * Math.min(1, t); mode = t < 1 ? "run" : "idle"; }
    else if (t < 2.5) { S.wob = 24 + (t - 2) / 0.5 * 56; mode = "idle"; }
    else { mode = "sleep"; for (let i = 0; i < 3; i++) { const a = now * 5 + i * 2.1; R(HX - 12 + Math.cos(a) * 6, GY - 14 + Math.sin(a) * 2, 2, 2, C.gold); } }
  }
  if (pond) { S.fq = S.jump / S.jd; S.fHop = true; mode = "fall"; }
  const VL = 50, AY = 2, feetP = dx => AY + Math.sqrt(VL * VL - Math.min(VL * VL - 1, dx * dx)) + 23, sw = S.swing;   // the vine: anchored in the canopy, 50 px long; his hands are 23 px above his feet
  let hang = null, postJump = false;
  if (sw) { const dx = ttl(sw.o) * V; air = true; S.swK = Math.max(-1, Math.min(1, dx / 40));
    if (dx > 40) y = lp(gb, feetP(40), sm01(cl01((67.5 - dx) / 27.5))); else if (dx > -40) y = feetP(dx); else { y = lp(feetP(-40), gb, Math.pow(cl01(sw.pt / 0.4), 2)); postJump = true; }
    mode = postJump ? "air" : "swing"; if (postJump) { S.jump = 0.8 * JD; S.jd = JD; } hang = sw.o; }
  for (const o of S.obs) if (o.wide) { const xa = obsX(o); if (xa < -60 || xa > W + 60) continue; let ex = xa + Math.round(4 * Math.sin(now * 2)), ey = AY + VL;   // the vine hangs from the canopy over every wide pond
    if (o === hang && !postJump) { const hx = HX + 3, hy = y - 23, d = Math.hypot(hx - xa, hy - AY); if (d > VL) { ex = xa + (hx - xa) * VL / d; ey = AY + (hy - AY) * VL / d; } else { ex = hx; ey = hy; } }
    else if (o === hang) { ex = xa + 12; ey = AY + 48; }
    seg(xa, AY, ex, ey, rgb(70, 150, 40), 1); for (let k = 1; k < 6; k++) R(lp(xa, ex, k / 6) - 1, lp(AY, ey, k / 6), 2, 1, rgb(40, 100, 28)); R(ex - 1, ey, 3, 3, rgb(70, 150, 40)); }
  if (S.find) { mode = S.find.t >= 3.2 ? "push" : "find"; y = gb; S.fnd = S.find.t; }
  let hxx = HX; if (S.fall) { const t = S.fall.t; hxx = lp(HX, obsX(S.fall.o), sm01(cl01(t / 0.35))); y = gb + Math.round(90 * t * t); mode = "plunge"; }
  if (S.chase) drawChasers(now, gb);
  if (S.hunter) drawJungleHunter(now);
  drawHero(S.col && S.col.t >= 2.5 ? HX + 3 : hxx, Math.round(y), now, mode);
  if (S.find) { const t = S.find.t; if (t < 0.9) { R(HX + 2, y - 36, 2, 5, C.gold); R(HX + 2, y - 30, 2, 2, C.gold); } else if (t >= 1.7 && t < 3.2) drawIdol(HX + 3, y - 31, now, true); }
  S.fHop = false; S.slope = 0; S.wob = 0; if (postJump) S.jump = -1;
  drawBats(now);
  // Forest EQ is behind the trunks, not over the adventurer or the foreground.
  if (hd) drawBush(HX + 2, Math.min(1, hd.t / 0.6) * (hd.t > 5.0 ? Math.max(0, 1 - (hd.t - 5.0) / 0.8) : 1));
}
const GSTOPS = [[110, 76, 40], [212, 182, 58], [150, 200, 60], [50, 170, 60], [8, 100, 48]];   // by height, like KeySpeaker: brown, yellow, yellow-green, green, deep green
function gcol(u) { const f = Math.max(0, Math.min(1, u)) * (GSTOPS.length - 1), i = Math.min(GSTOPS.length - 2, Math.floor(f)), k = f - i, A = GSTOPS[i], B = GSTOPS[i + 1]; return rgb(Math.round(lp(A[0], B[0], k)), Math.round(lp(A[1], B[1], k)), Math.round(lp(A[2], B[2], k))); }
const BG = rgb(22, 14, 8);
function labH(wx) {   // the labyrinth floor: rolling slopes between the events, flat near a hole or a ladder
  const L = S.lab; if (!L) return 0; if (L.gaps) for (const gx of L.gaps) if (Math.abs(wx - gx) < 60) wx = gx - 60;   // a level plateau round each broken place in the track, so that he lands at the height he left
  const d = Math.min(Math.abs(wx - L.wx), Math.abs(wx - L.pw)), w = cl01((d - 50) / 70);
  const base = Math.max(0, 15 * Math.sin(wx * 0.028 + 0.6) + 3 * Math.sin(wx * 0.07) + 6) * w, co = L.cartX === undefined ? 0 : cl01((wx - L.cartX - 40) / 80);
  return co > 0 ? lp(base, (22 - 22 * Math.cos((wx - L.cartX - 40) * 0.01309)) * w, co) : base;   // after the cart: long slopes, a whole screen (240 dots) climbing, then a whole screen descending, 44 high   // hills about 200 px long and up to 24 px high: clear slopes
}
const ROCK0 = rgb(26, 20, 24), ROCK1 = rgb(48, 36, 36), ROCK2 = rgb(78, 60, 52), ROCK3 = rgb(120, 94, 70), DRIP = rgb(130, 190, 240);
const cey = x => { const f = (S.scroll + x) / PITCH, i = Math.floor(f), roof = S.roof || {}; return Math.round(lp(roof[i] ?? S.cv, roof[i + 1] ?? roof[i] ?? S.cv, f - i) + 2 * Math.sin((x + S.scroll) * 0.13)); };   // the underside of the ceiling at screen x
function spike(cx, y0, w, h, col, down) { for (let i = 0; i < h; i++) { const ww = Math.max(1, Math.round(w * (1 - i / h))); R(cx - (ww >> 1), down ? y0 + i : y0 - i, ww, 1, col); } }
function drawScorpion(x, now, tt) {   // a scorpion facing him: claws forward, legs scuttling, the tail curled over its back; it strikes with the tail as he comes
  const B = rgb(140, 84, 28), BD = rgb(96, 56, 18), RD = rgb(210, 50, 40), near = tt < 0.7 && tt > -0.2, k = Math.floor(now * 10);
  R(x - 6, GY - 5, 11, 4, B); R(x - 6, GY - 5, 11, 1, BD); R(x + 3, GY - 6, 3, 5, B);
  for (let i = 0; i < 4; i++) R(x - 5 + i * 3, GY - 1 + ((k + i) & 1) * 0, 1, 1 + ((k + i) & 1), BD);   // legs
  seg(x - 6, GY - 4, x - 10, GY - 6 - (near ? 2 : 0), B, 1); R(x - 13, GY - 8 - (near ? 2 : 0), 3, 3, BD); R(x - 13, GY - 4, 3, 3, BD); if (near) R(x - 12, GY - 6, 1, 2, "#000");   // claws, open when it is close
  if (!near) { seg(x + 6, GY - 5, x + 9, GY - 9, B, 2); seg(x + 9, GY - 9, x + 7, GY - 13, B, 2); seg(x + 7, GY - 13, x + 3, GY - 13, B, 1); R(x + 2, GY - 12, 2, 2, RD); }
  else { seg(x + 6, GY - 5, x + 9, GY - 10, B, 2); seg(x + 9, GY - 10, x + 3, GY - 16, B, 2); seg(x + 3, GY - 16, x - 6, GY - 13, B, 1); R(x - 8, GY - 13, 2, 2, RD); }   // the stinger lunges forward
}
function drawSnake(x, now, tt) {   // a cobra: coiled on the floor, the head and hood rising as he comes, hissing, the tongue flickering
  const G1 = rgb(96, 130, 40), G2 = rgb(58, 86, 24), YL = rgb(220, 196, 90), up = cl01((1.0 - tt) / 0.3) * (1 - cl01((-0.2 - tt) / 0.3)), h = 4 + Math.round(13 * up);
  R(x - 8, GY - 3, 16, 3, G1); R(x - 7, GY - 3, 14, 1, YL); R(x - 6, GY - 6, 12, 3, G2); R(x - 4, GY - 8, 8, 2, G1);   // the coils
  R(x - 7, GY - 6 - h, 3, h, G1);   // the neck
  if (up > 0.3) { R(x - 10, GY - 8 - h, 9, 5, G2); R(x - 9, GY - 7 - h, 7, 2, YL); R(x - 12, GY - 6 - h, 3, 3, G1); R(x - 11, GY - 6 - h, 1, 1, "#000"); R(x - 13, GY - 4 - h, 2, 1, RD2); if (Math.floor(now * 8) & 1) R(x - 15, GY - 5 - h, 2, 1, RD2); R(x - 12, GY - 3 - h, 1, 2, "#fff"); }   // the hood spreads, the mouth and fangs, a flicking tongue
  else { R(x - 10, GY - 8 - h, 6, 4, G1); R(x - 9, GY - 7 - h, 1, 1, "#000"); }
}
const RD2 = rgb(210, 50, 40);
function drawCaveObs(o, x, now) {
    if (o.type === "rock") { R(x - 7, GY - 6, 14, 6, rgb(96, 88, 90)); R(x - 5, GY - 9, 10, 3, rgb(96, 88, 90)); R(x - 3, GY - 11, 6, 2, rgb(120, 112, 112)); R(x + 3, GY - 6, 4, 6, rgb(70, 62, 66)); }
    else if (o.type === "scorpion") drawScorpion(x, now, ttl(o));
    else if (o.type === "snake") drawSnake(x, now, ttl(o));
    else if (o.type === "low") { R(x - 8, 0, 16, GY - 19, ROCK2); R(x - 6, GY - 19, 12, 2, ROCK2); R(x - 8, 0, 2, GY - 19, ROCK3); R(x - 3, GY - 17, 6, 2, ROCK1); }
    else { const t = ttl(o), f = cl01((0.8 - t) / 0.25), y0 = cey(x), shake = t < 1.2 && t > 0.8 ? ((Math.floor(now * 30) & 1) * 2 - 1) : 0;
      if (f < 1) { const tipY = y0 + 12 + f * (GY - y0 - 12); spike(x + shake, tipY - 12, 8, 12, rgb(120, 100, 86), true); }
      else { spike(x, GY, 8, 11, rgb(120, 100, 86), false); } }
}
function drawBoulder(cx, cy, r, ang) {   // a huge round rock, turning as it rolls: craters carried round on its face, a shaded edge, a light top
  const A = rgb(112, 100, 94), B = rgb(88, 78, 74), D = rgb(60, 52, 50);
  for (let dy = -r; dy <= r; dy++) { const h = Math.floor(Math.sqrt(r * r - dy * dy)); R(cx - h, cy + dy, 2 * h, 1, dy > r * 0.55 ? D : dy > r * 0.1 ? B : A); R(cx - h, cy + dy, 2, 1, D); R(cx + h - 2, cy + dy, 2, 1, D); }
  for (let i = 0; i < 7; i++) { const th = ang + i * 0.9, cr = (i % 3) * r * 0.22 + r * 0.2, px = Math.cos(th) * cr, py = Math.sin(th) * cr; if (Math.cos(th * 0.7) > -0.2) { R(cx + px - 3, cy + py - 2, 6, 4, D); R(cx + px - 2, cy + py - 3, 4, 1, B); } }
  R(cx - r * 0.5, cy - r * 0.8, r * 0.7, 2, rgb(150, 138, 128));
}
function drawArrow(a, y) { R(a.x, y, 12, 1, rgb(150, 110, 60)); R(a.x - 4, y - 1, 4, 3, rgb(190, 196, 206)); R(a.x - 2, y, 2, 1, "#fff"); R(a.x + 10, y - 1, 3, 3, rgb(214, 60, 50)); R(a.x + 11, y, 2, 1, "#fff"); }
function drawCaveBg(now, sc, lab, depth) {   // the cave itself: far wall (strata, or old brick in the labyrinth: bluer and darker the deeper it is), stalagmites, the ceiling and the floor in blocks
  R(0, 0, W, H, ROCK0);
  if (lab) {   // the labyrinth: an old brick wall, with torches in brackets
    const ox = ((-sc * 0.3) % 16 + 16) % 16 - 16; for (let row = 0; row * 8 < GY + 8; row++) for (let x = ox - (row & 1) * 8; x < W; x += 16) R(x, row * 8, 15, 7, ((x + row * 3) & 8) ? (depth ? rgb(40, 46, 68) : rgb(54, 40, 36)) : (depth ? rgb(32, 38, 58) : rgb(46, 34, 30)));
    for (let k = Math.floor(sc * 0.5 / 130) - 1; k < Math.floor(sc * 0.5 / 130) + 3; k++) { const x = Math.round(k * 130 - sc * 0.5 + 40), fl = trebleFlame(now, k); g.fillStyle = "rgba(255,170,60,0.10)"; g.fillRect(x - 16, GY - 80, 32, 40); R(x, GY - 58, 2, 6, C.trunk); R(x - 1, GY - 65 - fl, 4, 7 + fl, C.gold); R(x, GY - 63, 2, 3, "#fff6c0"); }
  } else {
  for (let y = 12; y < GY; y += 11) for (let x = 0; x < W; x += 2) if (Math.sin((x + sc * 0.3) * 0.05 + y) > 0.2) R(x, y + Math.round(Math.sin((x + sc * 0.3) * 0.11 + y) * 2), 2, 1, ROCK1);   // strata in the far wall
  }
  for (let k = Math.floor(sc * 0.4 / 37) - 1; k < Math.floor(sc * 0.4 / 37) + 8; k++) { const x = k * 37 - sc * 0.4 + 10; spike(x, GY, 14, 12 + ((k * 7 & 3) * 5), ROCK1, false); }   // far stalagmites
  for (let k = Math.floor(sc / PITCH) - 1; k < Math.floor(sc / PITCH) + 32; k++) { const x0 = k * PITCH - sc + 1, n = Math.max(1, Math.round(cey(k * PITCH - sc + 3) / SEG)); for (let j = 0; j < n; j++) R(x0, j * SEG + 1, 6, SEG_H, j === n - 1 ? ROCK3 : (j & 1 ? ROCK2 : rgb(66, 50, 46))); }   // the ceiling in blocks: it lowers and rises with the volume
  for (let k = Math.floor(sc / 23) - 1; k < Math.floor(sc / 23) + 12; k++) { const x = k * 23 - sc + 8; spike(x, cey(x) - 1, 6, 5 + (((k * 7) % 5 + 5) % 5) * 2, ROCK2, true); }   // stalactites that stay up
  R(0, GY, W, H - GY, ROCK0);   // the floor in blocks as well, fixed to the world; in the labyrinth the columns rise and fall in slopes
  for (let k = Math.floor(sc / PITCH) - 1; k < Math.floor(sc / PITCH) + 32; k++) { const x0 = k * PITCH - sc + 1, top = GY - (lab ? Math.round(labH(sc + x0 + 3 - HX)) : 0); if (lab && lab.gaps && lab.gaps.some(g => Math.abs(sc + x0 + 3 - HX - g) < 22)) continue; for (let j = 0, y = top + 1; y < H; j++, y += SEG) R(x0, y, 6, SEG_H, j === 0 ? ROCK3 : ((j + k) & 1 ? ROCK2 : rgb(66, 50, 46))); }
  if (lab && lab.gaps) for (const g of lab.gaps) { const gx = Math.round(HX + g - sc - 22); if (gx < -50 || gx > W) continue; const top = GY - Math.round(labH(g - 60)); R(gx, top - 1, 44, H - top + 1, rgb(3, 2, 4)); R(gx - 1, top, 1, 3, ROCK3); R(gx + 44, top, 1, 3, ROCK3); }   // the broken place: a black drop
  for (let i = -1; i < 24; i++) { const k = Math.floor(sc / 11) + i, x = k * 11 - sc, b = (Math.imul(k, 2654435761) >>> 16) % 6; if (b < 3) R(x, GY + 5 + b * 6, 4 + b, 2, b === 0 ? ROCK3 : ROCK1); }   // chips and cracks in the floor, fixed to the world
}
function drawCart(x, y, now, parked) {   // a mine cart: an iron-rimmed wooden box on two spoked wheels, with loose dust trailing behind
  const W1 = rgb(96, 70, 54), W2 = rgb(66, 48, 38), ST = rgb(168, 176, 188), DK = rgb(34, 30, 34), bob = parked ? 0 : Math.round(Math.sin(now * 32) * 0.6);
  const by = y + bob;
  R(x - 11, by - 10, 23, 9, W1); R(x - 11, by - 10, 23, 2, ST); R(x - 11, by - 2, 23, 1, W2); R(x - 6, by - 9, 1, 7, W2); R(x + 4, by - 9, 1, 7, W2); R(x - 12, by - 11, 25, 1, ST);
  for (const wx of [-7, 6]) { R(x + wx - 2, by - 3, 5, 5, DK); const a = parked ? 0 : Math.floor(now * 28) & 3; R(x + wx - 2, by - 3, 5, 1, ST); R(x + wx - 2, by + 1, 5, 1, ST); R(x + wx - 1 + (a & 1), by - 2 + (a >> 1 & 1), 1, 1, rgb(228, 232, 234)); R(x + wx + 1 - (a & 1), by + (a >> 1 & 1), 1, 1, ST); R(x + wx, by - 1, 1, 1, ST); }
}
function drawCartDust(x, y, now) {   // separate grains behind the rear wheel, bright enough to read in the tunnel
  const n = 12 + Math.round(M.level * 4);
  for (let i = 0; i < n; i++) { const age = (now * (3.2 + i % 4 * 0.28) + i * 0.29) % 1, px = x - 14 - Math.round(age * (24 + i % 3 * 8)) - i % 2, py = y + 1 - Math.round(age * (4 + i % 4 * 2)) + i % 3 - 1, alpha = (0.78 + M.level * 0.10) * (1 - age * 0.55);
    R(px, py, i % 4 === 0 ? 4 : 2, i % 5 === 0 ? 2 : 1, i % 3 === 0 ? `rgba(242,206,154,${alpha})` : `rgba(202,164,115,${alpha})`); }
  for (let i = 0; i < 3; i++) { const phase = (now * 15 + i * 0.37) % 1, px = x - 18 - Math.round(phase * 33); R(px, y + 2 + i % 2, 4, 1, `rgba(248,220,178,${0.72 - phase * 0.35})`); }   // short separated streaks follow the spinning rear wheel
}
function drawRails(sc) {   // two iron rails on wooden sleepers, following the sloping floor, from the parked cart on
  const x0 = S.lab ? Math.max(0, Math.round(HX + S.lab.cartX - 30 - sc)) : 0;
  for (let x = x0 - x0 % 3; x < W; x += 3) { if (S.lab && S.lab.gaps && S.lab.gaps.some(g => Math.abs(sc + x - HX - g) < 22)) continue; const wx = sc + x - HX, fy = GY - Math.round(labH(wx)); R(x, fy, 3, 1, rgb(168, 176, 188)); R(x, fy + 2, 3, 1, rgb(90, 96, 108)); }
  for (let x = -((sc % 14) + 14) % 14 - 14; x < W; x += 14) { if (x < x0 || (S.lab && S.lab.gaps && S.lab.gaps.some(g => Math.abs(sc + x - HX - g) < 24))) continue; const wx = sc + x - HX, fy = GY - Math.round(labH(wx)); R(x, fy + 1, 3, 3, rgb(96, 66, 40)); }
}
function drawLabFeature(xl, kind, now, wide) {   // what is coming in the labyrinth: a hole in the floor (a drop), or a shaft with a ladder (up a level; the last one lets in daylight)
  if (xl < -30 || xl > W + 30) return;
  if (kind === "gate") {   // the way into the treasure store: a stone doorway with a golden light inside, a sun carved over it
    R(xl - 15, GY - 58, 30, 58, rgb(40, 32, 30)); R(xl - 10, GY - 54, 20, 54, rgb(255, 214, 110)); R(xl - 6, GY - 54, 12, 54, rgb(255, 240, 170)); R(xl - 2, GY - 54, 4, 54, rgb(255, 252, 220));
    R(xl - 17, GY - 60, 6, 60, ROCK3); R(xl + 11, GY - 60, 6, 60, ROCK3); R(xl - 17, GY - 63, 34, 6, ROCK3); R(xl - 14, GY - 61, 28, 2, ROCK1);
    for (let i = 0; i < 4; i++) { R(xl - 12 + i * 7, GY - 62, 4, 2, rgb(206, 150, 60)); } R(xl - 3, GY - 70, 6, 5, rgb(206, 150, 60)); R(xl - 1, GY - 72, 2, 2, rgb(206, 150, 60)); R(xl - 6, GY - 68, 1, 1, rgb(40, 190, 180)); R(xl + 6, GY - 68, 1, 1, rgb(40, 190, 180));
    g.fillStyle = "rgba(255,220,120,0.10)"; g.fillRect(xl - 70, GY - 52, 56, 52); return; }
  if (kind === "down") { R(xl - 12, GY, 24, H - GY, rgb(6, 4, 3)); R(xl - 12, GY, 24, 2, rgb(90, 72, 60)); R(xl - 14, GY - 1, 2, 3, ROCK3); R(xl + 12, GY - 1, 2, 3, ROCK3); return; }
  const cb = cey(xl) + 3, day = kind === "exit";
  const open = S.landN % 2 === 0;   // the next jungle (see setScene) is open country: then it is blue sky up there, otherwise forest, and the light is warm and green
  R(xl - 8, -22, 16, 22 + cb, day ? (open ? rgb(150, 196, 244) : rgb(196, 214, 130)) : rgb(60, 50, 46)); R(xl - 5, -22, 10, 22 + cb, day ? (open ? rgb(214, 236, 252) : rgb(244, 248, 196)) : rgb(84, 70, 60));
  if (wide) { R(xl - 5, -24, 1, 24 + GY, C.log); R(xl + 4, -24, 1, 24 + GY, C.log); for (let yy = GY; yy > -24; yy -= 6) R(xl - 5, yy, 10, 1, C.logEnd); }
  else { R(xl - 1, -24, 1, 24 + GY, C.log); R(xl + 3, -24, 1, 24 + GY, C.log); for (let yy = GY; yy > -24; yy -= 6) R(xl - 1, yy, 5, 1, C.logEnd); }
}
function drawCave(now) {   // a field with a ceiling: rock above and below, the torch lights a circle that grows with the music; drips fall on the beat, stalactites drop and the roof sags low. The labyrinth adds levels: holes to drop through and ladders to climb, joined by tunnels to run
  const quake = !!S.boulder;   // the tunnel shakes from the first rumble on if (quake) { g.save(); g.translate(Math.round(Math.random() * 2 - 1), Math.round(Math.random() * 2 - 1)); }
  const sc = S.scroll, lab = S.lab, mv = lab && lab.mv, dep = lab ? lab.depth : 0, kind = lab ? lab.kinds[lab.stage] : "", back = lab && kind === "exit" && lab.view === "back", xl = lab ? HX + (back ? 0 : 5) + (mv && kind !== "gate" ? 0 : lab.wx - sc) : -99;
  if (mv && mv.kind === "down") {   // dropping a level: the camera follows him down the shaft, this tunnel sliding up and the one below sliding into place
    g.save(); g.translate(0, -mv.d); drawCaveBg(now, sc, lab, dep); drawLabFeature(xl, "down", now); g.restore();
    g.save(); g.translate(0, 135 - mv.d); drawCaveBg(now, sc, lab, dep + 1); g.restore();
    R(xl - 12, GY - mv.d, 24, 135 + 34 - GY, rgb(6, 4, 3));   // the shaft he falls down
  } else if (mv && mv.kind !== "gate") {   // climbing a level: the tunnel slides down the screen and the one above (or, at the last, the surface: grass, forest, daylight) slides into place
    const dy = mv.z - 40;
    if (mv.kind === "exit") { g.save(); g.translate(0, dy); R(0, -22, W, 22, ROCK2); if (S.landN % 2 === 0) { R(0, -300, W, 280, rgb(110, 176, 242)); for (let y = -280; y < -24; y += 8) R(0, y, W, 4, rgb(150, 200, 246)); for (let i = 0; i < 3; i++) R(20 + i * 90, -80 - i * 20, 30, 6, "#fff"); } else { R(0, -300, W, 280, C.sky); for (let y = -280; y < -24; y += 6) R(0, y, W, 3, C.sky2); for (let i = 0; i < 7; i++) R(((i * 47 + 20) % 300) - 20, -120, 7, 98, C.trunk); } R(0, -24, xl - 8, 3, C.grass); R(xl + 8, -24, W, 3, C.grass); R(0, -21, xl - 8, 2, C.dirt); R(xl + 8, -21, W, 2, C.dirt); g.restore(); }
    else { g.save(); g.translate(0, dy - 120); drawCaveBg(now, sc, lab, dep - 1); g.restore(); }
    g.save(); g.translate(0, dy); drawCaveBg(now, sc, lab, dep); drawLabFeature(xl, mv.kind, now, back); g.restore();
  } else {
    drawCaveBg(now, sc, lab, dep); drawStageEQ("flame", H, 7); if (lab && lab.cartS) drawRails(sc); if (lab && (lab.cartS === 1 || lab.cartS === 2)) drawCart(Math.round(HX + lab.cartX - sc), GY - Math.round(labH(lab.cartX)), now, true); if (lab) drawLabFeature(xl, kind, now, back);
  for (const o of S.obs) { const x = obsX(o); if (x > W + 20 || x < -20) continue; const fh = lab && o.type !== "low" ? Math.round(labH(o.wx)) : 0;   // things stand on the sloping floor
    if (fh) { g.save(); g.translate(0, -fh); } drawCaveObs(o, x, now); if (fh) g.restore(); }
    if (S.chase) drawChasers(now, GY);
    if (S.trap) { const ty = GY - Math.round(labH(sc)) - 17; R(W - 5, ty - 2, 5, 5, "#000"); if (Math.floor(now * 16) & 1) { R(W - 4, ty - 1, 3, 3, rgb(230, 60, 40)); g.fillStyle = "rgba(255,80,40,0.2)"; g.fillRect(W - 30, ty - 6, 30, 13); } }   // the slit flashes before it shoots
    for (const a of S.arrows) drawArrow(a, GY - Math.round(labH(sc)) - 17);
  for (const d of S.drips) R(d.x, d.y, 1, 3, DRIP);
  for (const p of S.splash) { const w = 2 + Math.round(p.t * 24); R(p.x - (w >> 1), GY - 1, w, 1, DRIP); }
  }
  const gbL = lab && !mv ? GY - Math.round(labH(sc)) : GY;   // he stands on the sloping floor
  let y = gbL, mode = S.duck ? "hide" : "run";
  if (S.jump >= 0) { const u = S.jump / JD; y = gbL - 4 * JH * u * (1 - u); mode = "air"; }
  if (S.boulder && S.boulder.roll) {   // the boulder rolls along the tunnel BEHIND him: he is in a niche cut into the near wall, in front of it
    const B = S.boulder, bxw = B.bw, bx = Math.round(HX + bxw - sc), r = Math.min(36, Math.round((GY - cey(bx)) / 2) - 1), bf = GY - Math.round(labH(bxw)); drawBoulder(bx, bf - r, r, bxw / r); for (let i = 0; i < 3; i++) { g.fillStyle = "rgba(160,140,118," + (0.35 - i * 0.09) + ")"; g.fillRect(bx + r + 4 + i * 9, bf - 5 - i * 3, 9, 5); } }
  const ld = lab ? lab.ld : 1;
  if (mv && mv.kind === "down") { S.wob = 0; drawHero(HX, GY - 4, now, "plunge"); }
  else if (mv && mv.kind === "gate") { S.wob = 0; S.slope = 0; drawHero(HX + Math.round(19 * cl01(mv.t / 1.2)), GY, now, "run"); g.fillStyle = "rgba(255,230,150," + Math.min(0.9, mv.t * 0.8) + ")"; g.fillRect(0, 0, W, H); }
  else if (mv) { S.wob = 0; if (mv.view === "back") drawBackLadderHero(HX, mv.z); else if (mv.ph === "mount") drawLedgeHero(mv.q, mv.z, 1, LAB_TOP); else drawLadderHero(HX, mv.z, 1); }
  else {
    if (ld < 0) { const q = (ld + 0.45) / 0.45; y = gbL - Math.round(110 * (1 - q) * (1 - q)); mode = "plunge"; }   // he drops in from the hole above
    else if (ld < 0.4) mode = "hide";   // and lands in a crouch, with dust
    if (ld >= 0 && ld < 0.55) { const q = ld / 0.55; for (const sd of [-1, 1]) { R(HX + sd * (4 + Math.round(q * 14)) - 1, GY - 2 - Math.round(q * 3), 3, 2, rgb(126, 116, 100)); R(HX + sd * (2 + Math.round(q * 8)) - 1, GY - 1, 2, 1, rgb(160, 150, 130)); } }
    if (lab) { const sl = (labH(sc + 4) - labH(sc - 4)) / 8; S.sl = (S.sl || 0) + (Math.max(-1, Math.min(1, sl / 0.5)) - (S.sl || 0)) * 0.2; S.slope = 0.5 * S.sl; S.wob = S.sl > 0 ? 4 * S.sl : 12 * S.sl; } else S.wob = 0;   // uphill he leans in and shortens his stride, downhill he leans back
    if (lab && lab.cartS === 2) { const u = cl01(lab.bt / 0.5); drawHero(HX - 1, Math.round(gbL - 4 * 9 * u * (1 - u)), now, u < 0.85 ? "air" : "crouch"); drawCart(Math.round(HX + lab.cartX - sc), GY - Math.round(labH(lab.cartX)), now, true); }   // the hop into the cart
    else if (lab && lab.cart) { let lift = 0; if (lab.gaps) for (const g of lab.gaps) { const u = (sc - (g - 38)) / 76; if (u > 0 && u < 1) lift = 4 * 15 * u * (1 - u); } drawHero(HX - 1, Math.round(y - lift) - 1, now, "crouch"); drawCart(HX, Math.round(y - lift), now); }   // at a broken place the cart flies over the gap   // he crouches low in the cart, hands on the rim, looking ahead, the box in front of his legs
    else drawHero(HX, Math.round(y) + (S.boulder && S.boulder.stop ? 7 : 0), now, mode);
    S.slope = 0; S.wob = 0;
  }
  if (S.boulder) { const B = S.boulder, nx = Math.round(HX + B.nx - sc), nf = GY - Math.round(labH(B.nx)) + 8, P = rgb(48, 38, 36), P2 = rgb(76, 60, 54); R(nx - 27, nf - 58, 7, 66, P); R(nx + 20, nf - 58, 7, 66, P); R(nx - 27, nf - 58, 54, 7, P); R(nx - 27, nf - 58, 54, 1, P2); R(nx - 27, nf - 58, 1, 66, P2); R(nx + 26, nf - 58, 1, 66, P2); R(nx - 20, nf - 51, 40, 1, rgb(26, 20, 18)); }   // a bigger niche: pillars 40 dots apart and 58 tall   // the near wall of the niche: two pillars and a lintel in front of the tunnel
  drawBats(now);
  if (!S.duck && !mv && !(ld < 0) && !(lab && lab.cart)) { const ty = Math.round(y) - 22 + (S.jump >= 0 ? 0 : (Math.floor(S.ph * 2) & 1)); R(HX + 8, ty + 2, 1, 5, C.trunk); const fl = trebleFlame(now, 1); R(HX + 7, ty - 2 - fl, 3, 4 + fl, C.gold); R(HX + 8, ty - 1 - fl, 1, 2, "#fff6c0"); }   // the torch in his hand
  const r = 55 + 30 * M.level + M.treble * 8, cx = HX + 8, cy = GY - 20;   // the torch light: rings, each a step darker than the one inside it
  for (let k = 0; k < 5; k++) { g.fillStyle = "rgba(0,0,8,0.10)"; g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, r * (1 - k * 0.17), 0, 7); g.fill("evenodd"); }
  if (lab && lab.cart && !mv) { let lift = 0; for (const gap of lab.gaps || []) { const u = (sc - (gap - 38)) / 76; if (u > 0 && u < 1) lift = 4 * 15 * u * (1 - u); } drawCartDust(HX, Math.round(y - lift + Math.min(5, lift * 0.4)), now); }   // dust stays visible behind the spinning wheel, even as the cart clears a broken rail
  if (quake) g.restore();
}
const NF = 10, CF = Array.from({ length: NF }, (_, l) => 96 - 46 * (9 - l)), CWATER = CF[9] + 24;   // ten floors, 46 dots apart: floor 0 is the top, floor 9 the bottom; the river is below the bottom floor
const CAVST = [], cavGold = [];   // the route: on each floor from 9 up to 1 an obstacle (a gap, or on floors 6, 3 and 1 a rope over a wide gap) and then a ladder up; on the top floor a pit down to the river
(function () { let i = 0, id = 0, start = 130; const SP = 350;
  for (let f = 9; f >= 1; f--) { const xa = 420 + (i++) * SP, xb = 420 + (i++) * SP; CAVST.push({ i: CAVST.length, xs: xa, kind: [6, 3, 1].includes(f) ? "rope" : "gap", lvl: f }); CAVST.push({ i: CAVST.length, xs: xb, kind: "ladUp", lvl: f });
    cavGold.push({ id: id++, x: Math.round((start + xa) / 2), lvl: f }); cavGold.push({ id: id++, x: Math.round((xa + xb) / 2), lvl: f }); start = xb + 5; }
  const xp = 420 + i * SP; CAVST.push({ i: CAVST.length, xs: xp, kind: "pit", lvl: 0 }); cavGold.push({ id: id++, x: Math.round((start + xp) / 2), lvl: 0 }); })();
const NST = CAVST.length, cavSt = i => CAVST[i];
function cavSolid(lvl, wx) { for (const st of CAVST) { if (Math.abs(wx - st.xs) > 40) continue;
  if (st.kind === "gap" && st.lvl === lvl && Math.abs(wx - st.xs) < 18) return false;
  if (st.kind === "rope" && st.lvl === lvl && Math.abs(wx - st.xs) < 35) return false;   // a wide gap: only a rope gets across
  if (st.kind === "ladUp" && lvl === st.lvl - 1 && Math.abs(wx - st.xs - 5) < 9) return false;   // the ladder comes up through a hole in the floor above
  if (st.kind === "pit" && Math.abs(wx - st.xs) < 26) return false; }   // the pit is a shaft through every floor
  return true; }
const kariPomuMural = typeof Image === "undefined" ? null : new Image();
if (kariPomuMural) kariPomuMural.src = "./kari-pomu-mural.svg";
const roboMural = typeof Image === "undefined" ? null : new Image();
if (roboMural) roboMural.src = "./robo-mural.svg";
const nazousaMural = typeof Image === "undefined" ? null : new Image();
if (nazousaMural) nazousaMural.src = "./nazousa-mural.svg";
function drawMural(k, x, y, now) {   // wall paintings in the style of the Aztec codices: cream paper, black outlines, flat turquoise / red / orange / gold, stiff profile figures and stepped-fret bands; the belly disc and the sun glow on the beat
  const CR = rgb(222, 204, 160), BK = rgb(26, 20, 22), TQ = rgb(30, 130, 112), RD = rgb(200, 48, 38), OR = rgb(226, 128, 40), GD = rgb(244, 196, 56), glow = M.pulse > 0.5;
  R(x, y, 52, 36, BK); R(x + 1, y + 1, 50, 34, CR); R(x + 1, y + 1, 50, 2, RD); R(x + 1, y + 33, 50, 2, RD);   // paper with a red border
  for (let i = 0; i < 12; i++) { R(x + 2 + i * 4, y + 1, 2, 1, BK); R(x + 4 + i * 4, y + 34, 2, 1, BK); }
  if (k === 2) {   // the supplied KariPomu face replaces the eight square spirals
    for (let i = 0; i < 6; i++) { R(x + 4, y + 5 + i * 5, 3, 3, [TQ, GD, RD][i % 3]); R(x + 45, y + 5 + i * 5, 3, 3, [RD, TQ, GD][i % 3]); }
    R(x + 5, y + 3, 42, 30, "#fff");
    if (kariPomuMural && kariPomuMural.complete && kariPomuMural.naturalWidth) { g.save(); g.imageSmoothingEnabled = false; g.drawImage(kariPomuMural, x + 7, y + 4, 38, 28); g.restore(); }
    else { R(x + 12, y + 7, 28, 23, TQ); R(x + 15, y + 10, 22, 17, GD); R(x + 16, y + 6, 20, 7, RD); R(x + 20, y + 16, 3, 2, BK); R(x + 30, y + 16, 3, 2, BK); R(x + 23, y + 22, 8, 2, RD); }
    return; }
  if (k === 4 || k === 5) {   // the supplied robot and rabbit faces, repainted as flat-color codex portraits
    const image = k === 4 ? roboMural : nazousaMural;
    if (image && image.complete && image.naturalWidth) { g.save(); g.imageSmoothingEnabled = false; g.drawImage(image, x + 3, y + 3, 46, 30); g.restore(); }
    else { R(x + 3, y + 3, 46, 30, OR); R(x + 9, y + 12, 9, 7, GD); R(x + 33, y + 12, 9, 7, GD); R(x + 20, y + 24, 12, 3, TQ); }
    return; }
  if (k === 3) {   // the Sun Stone (Piedra del Sol): concentric rings of rays, glyph sectors and dots round a gold face with a red tongue; the face glows on the beat
    const cx = x + 26, cy = y + 18;
    for (let yy = -16; yy <= 16; yy++) for (let xx = -16; xx <= 16; xx++) {
      const d = Math.sqrt(xx * xx + yy * yy); if (d > 16.2) continue;
      const an = Math.atan2(yy, xx) + 3.1416, s20 = Math.floor(an / 0.314), s45 = Math.floor(an / 0.785); let c;
      if (d > 15.2) c = BK;
      else if (d > 12.8) c = (s20 & 1) && d > 13.6 && d < 14.6 ? GD : TQ;   // outer turquoise ring with gold dots
      else if (d > 10.8) c = s20 & 1 ? RD : OR;   // ring of rays
      else if (d > 9.8) c = BK;
      else if (d > 7.8) c = s45 & 1 ? TQ : OR;   // glyph sectors
      else if (d > 7) c = BK;
      else c = glow ? "#fff0a8" : GD;   // the gold face
      R(cx + xx, cy + yy, 1, 1, c); }
    for (let i = 0; i < 4; i++) { const an = 0.785 + i * 1.571; R(cx + Math.cos(an) * 8.8 - 1, cy + Math.sin(an) * 8.8 - 1, 2, 2, RD); }   // four glyph squares
    R(cx - 5, cy - 4, 3, 3, BK); R(cx + 2, cy - 4, 3, 3, BK); R(cx - 4, cy - 3, 1, 1, TQ); R(cx + 3, cy - 3, 1, 1, TQ); R(cx - 3, cy + 1, 7, 2, BK); R(cx - 2, cy + 2, 5, 4, RD); R(cx - 1, cy + 2, 3, 1, CR);   // eyes, mouth, the knife tongue
    return; }
  // a stiff profile figure (k 0: turquoise body facing right, k 1: black body facing left), strict codex pose: striding legs, a belly disc, a tall feather fan, one arm up with a staff
  const fl = k === 1, body = fl ? BK : TQ, fan = fl ? RD : OR, ox = x;
  const X = (lx, w) => ox + (fl ? 52 - lx - w : lx);
  const rects = [   // [x, y, w, h, colour] in a 52 x 36 frame, facing right
    [20, 24, 3, 5, body], [17, 28, 3, 3, body], [26, 24, 3, 5, body], [29, 28, 3, 3, body], [13, 30, 7, 2, RD], [29, 30, 7, 2, RD],   // legs and sandals
    [19, 21, 11, 3, GD], [20, 11, 10, 11, body], [20, 11, 10, 2, RD], [22, 14, 6, 6, BK],   // loincloth, torso, belt
    [24, 5, 7, 7, body], [31, 8, 2, 2, body], [23, 4, 9, 2, RD],   // head, nose, band
    [30, 14, 7, 2, body], [36, 11, 3, 5, OR], [20, 14, 2, 4, body], [14, 17, 7, 2, body], [10, 16, 4, 5, fan],   // arms: front one raised, back one holding a fan
    [41, 5, 2, 26, TQ], [40, 3, 4, 3, GD], [41, 17, 2, 2, RD], [41, 24, 2, 2, RD]];   // a staff with gold top
  for (const r of rects) R(X(r[0], r[2]) - 1, y + r[1] - 1 + 1, r[2] + 2, r[3] + 2, BK);
  for (let i = 0; i < 5; i++) { const fx = 17 + i * 3, fh = 5 - (i === 0 || i === 4 ? 1 : 0); R(X(fx, 2) - 1, y + 3 - fh + 4 - 1, 4, fh + 2, BK); }
  for (const r of rects) R(X(r[0], r[2]), y + r[1] + 1, r[2], r[3], r[4]);
  for (let i = 0; i < 5; i++) { const fx = 17 + i * 3, fh = 5 - (i === 0 || i === 4 ? 1 : 0); R(X(fx, 2), y + 3 - fh + 4, 2, fh, i & 1 ? RD : fan); }   // the feather fan on the head
  R(X(23, 2), y + 14, 2, 2, BK); R(X(23, 2) + (fl ? 0 : 0), y + 14, 1, 1, CR);
  R(X(23, 6), y + 15 + 1, 6, 4, glow ? "#fff0a8" : GD); R(X(25, 2), y + 17 + 1, 2, 2, RD);   // the belly disc glows on the beat
  R(X(27, 3), y + 8 + 1, 3, 2, CR); R(X(29, 1), y + 9 + 1, 1, 1, RD); R(X(28, 4), y + 11 + 1, 4, 1, RD);   // eye and mouth
  R(X(41, 2), y + 3, 2, 1, BK);
}
function drawGold(x, y) {   // a pile of gold bars on a ledge, glinting
  const G1 = rgb(252, 208, 64), G2 = rgb(190, 140, 30), G3 = rgb(255, 240, 150);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) { const bx = x - 7 + c * 5 + r * 2.5; R(bx, y - 3 - r * 3, 5, 3, G1); R(bx, y - 3 - r * 3, 5, 1, G3); R(bx, y - 1 - r * 3, 5, 1, G2); }
  if ((Math.floor(performance.now() / 300) & 1)) { R(x + 6, y - 11, 1, 3, "#fff"); R(x + 5, y - 10, 3, 1, "#fff"); }
}
const CODE_GLYPHS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";
function drawCodeRain(now) {   // dense streams of numbers, Latin letters and katakana descend behind the campfire
  g.save(); g.font = "7px monospace"; g.textBaseline = "top";
  for (let j = 0; j < 30; j++) {
    const x = 1 + j * 8, count = 16 + j % 5, head = (now * (17 + j % 4 * 4) + j * 37) % (H + count * 7);
    for (let k = 0; k < count; k++) {
      const y = Math.floor(head - k * 7); if (y < -7 || y >= H) continue;
      const glyph = CODE_GLYPHS[(j * 13 + k * 17 + Math.floor(now * 2)) % CODE_GLYPHS.length];
      const alpha = k === 0 ? 0.78 + 0.10 * M.level : (0.52 + 0.10 * M.level) * (1 - k / count);
      g.fillStyle = k === 0 ? `rgba(170,245,220,${alpha})` : `rgba(45,190,120,${alpha})`;
      g.fillText(glyph, x, y);
    }
  }
  g.restore();
}
function drawCavern(now) {
  const sc = S.scroll, C = S.cav, ORG = rgb(212, 124, 42), ORD = rgb(150, 84, 26), m = C.mv;
  R(0, 0, W, H, rgb(8, 7, 10));
  const reveal = C.reveal || 0;
  if (reveal > 0) { g.save(); g.globalAlpha = 0.58 * reveal; for (const base of [26, 52, 78, 104, 130]) drawStageEQ("mural", base, 6); g.restore(); } // finding the mask reveals five rows of EQ
  let hy = CF[C.lvl];   // the camera follows his floor, the ladder climb and the fall
  if (m && m.kind === "up") hy = lp(CF[C.lvl], CF[C.lvl - 1], cl01(m.t / 2.0)); else if (m && (m.kind === "drop" || m.kind === "miss")) hy = Math.min(CWATER, (m.from === undefined ? CF[0] : m.from) + 300 * m.t * m.t);
  const cam = Math.round(96 - hy), vis = y => y + cam > -50 && y + cam < H + 12;
  g.save(); g.translate(0, cam);
  for (let lv = 0; lv < NF; lv++) { if (!vis(CF[lv] - 22)) continue; for (let k = Math.floor(sc * 0.4 / 130) - 1; k < Math.floor(sc * 0.4 / 130) + 3; k++) { const x = Math.round(k * 130 - sc * 0.4 + 10 + (lv & 1) * 65), mm = (((k + lv) % 6) + 6) % 6; drawMural(mm, x, CF[lv] - 40, now); } }   // wall paintings, one row per floor, drifting slowly (they are far behind)
  for (let lv = 0; lv < NF; lv++) { const F = CF[lv]; if (!vis(F)) continue; for (let x = 0; x < W; x += 4) { const wx = sc + x - HX; if (!cavSolid(lv, wx)) continue; const j = ((Math.floor(wx / 4) * 7) % 3 + 3) % 3; R(x, F, 4, 4, ORG); R(x, F + 4, 4, 3 + j, ORD); } }   // the ledges: orange rock, a ragged underside
  for (const st of CAVST) { if (st.kind !== "ladUp") continue; const xl = Math.round(HX + st.xs + 5 - sc); if (xl < -10 || xl > W + 10) continue; const top = CF[st.lvl - 1] - 14, bot = CF[st.lvl]; if (!vis(top) && !vis(bot)) continue; R(xl - 4, top, 1, bot - top, rgb(176, 120, 60)); R(xl + 4, top, 1, bot - top, rgb(176, 120, 60)); for (let yy = bot; yy > top; yy -= 6) R(xl - 4, yy, 9, 1, rgb(220, 160, 80)); }   // the ladders: through a hole in the floor above
  for (let lv = 0; lv < NF; lv++) { const F = CF[lv]; if (!vis(F)) continue;
    for (let k = Math.floor((sc - HX) / 170) - 1; k < Math.floor((sc - HX + W) / 170) + 2; k++) { if (((k + lv) & 1) !== 0) continue; const kk = k + lv * 3 + 20, wx = k * 170 + 60, x = Math.round(HX + wx - sc); if (!cavSolid(lv, wx) || CAVST.some(st => Math.abs(st.xs + 5 - wx) < 40 && (st.lvl === lv || st.kind === "ladUp")) || cavGold.some(p => p.lvl === lv && Math.abs(p.x - wx) < 36)) continue;
      if (kk % 5 === 3) { R(x - 8, F - 8, 9, 8, rgb(130, 84, 40)); R(x - 8, F - 8, 9, 1, rgb(176, 120, 60)); R(x - 8, F - 4, 9, 1, rgb(90, 56, 26)); R(x + 1, F - 6, 8, 6, rgb(130, 84, 40)); R(x + 1, F - 6, 8, 1, rgb(176, 120, 60)); R(x - 5, F - 15, 8, 7, rgb(130, 84, 40)); R(x - 5, F - 15, 8, 1, rgb(176, 120, 60)); R(x - 2, F - 5, 2, 2, rgb(252, 208, 64)); }   // stacked crates of treasure
      else if (kk % 5 === 4) { R(x - 7, F - 6, 14, 6, rgb(130, 84, 40)); R(x - 7, F - 6, 14, 1, rgb(176, 120, 60)); R(x - 7, F - 9, 14, 3, rgb(176, 120, 60)); R(x - 7, F - 11, 14, 2, rgb(252, 208, 64)); R(x - 4, F - 12, 3, 1, rgb(255, 240, 150)); R(x + 1, F - 12, 5, 1, rgb(252, 208, 64)); R(x - 1, F - 4, 3, 3, rgb(252, 208, 64)); if (Math.floor(now * 3 + kk) & 1) { R(x + 4, F - 16, 1, 3, "#fff"); R(x + 3, F - 15, 3, 1, "#fff"); } }   // an open chest brimming with gold
      else if (kk % 3 === 0) { const fl = trebleFlame(now, kk); g.fillStyle = "rgba(255,150,40," + (0.10 + 0.04 * M.treble) + ")"; g.fillRect(x - 18, F - 30, 36, 30); R(x - 1, F - 9, 2, 9, ORD); R(x - 4, F - 11, 8, 3, rgb(120, 70, 30)); R(x - 3, F - 17 - fl, 6, 6 + fl, rgb(252, 160, 40)); R(x - 1, F - 15 - fl, 2, 4, rgb(255, 240, 160)); }   // a brazier: someone lives here
      else if (kk % 5 === 1) { R(x - 3, F - 8, 7, 8, rgb(176, 92, 52)); R(x - 2, F - 10, 5, 2, rgb(176, 92, 52)); R(x - 3, F - 5, 7, 1, rgb(40, 190, 180)); R(x + 4, F - 6, 2, 4, rgb(176, 92, 52)); }   // a clay jar with a painted band
      else { R(x - 8, F - 2, 16, 2, rgb(190, 60, 50)); R(x - 8, F - 2, 16, 1, rgb(252, 208, 64)); R(x - 6, F - 3, 12, 1, rgb(40, 190, 180)); }   // a woven mat
      if (lv > 0 && (kk & 2)) { const T = CF[lv - 1]; R(x - 3, T + 8, 7, 16, rgb(196, 56, 46)); R(x - 3, T + 8, 7, 2, rgb(252, 208, 64)); R(x - 1, T + 12, 3, 3, rgb(40, 190, 180)); R(x - 3, T + 24, 3, 3, rgb(196, 56, 46)); R(x + 1, T + 24, 3, 3, rgb(196, 56, 46)); } } }   // and a banner hangs from the ledge above
  g.save(); g.globalAlpha = 0.82;
  for (let lv = 0; lv < NF; lv++) { if (!vis(CF[lv])) continue; for (let k = Math.floor((sc - HX) / 48) - 1; k < Math.floor((sc - HX + W) / 48) + 2; k++) { const hh = Math.imul(k + lv * 131, 2654435761) >>> 0; if ((hh >>> 8) % 20 > 2) continue; const wx = k * 48 + 12 + (hh >>> 12) % 24, x = Math.round(HX + wx - sc); if (x < -30 || x > W + 30 || !cavSolid(lv, wx - 14) || !cavSolid(lv, wx + 14) || !cavSolid(lv, wx) || CAVST.some(st => Math.abs(st.xs + 5 - wx) < 34) || cavGold.some(p => p.lvl === lv && Math.abs(p.x - wx) < 20)) continue; drawResident(x, CF[lv] - 1, now, ["stand", "walk", "sit", "sleep", "stand", "walk"][(hh >>> 16) % 6], (hh >>> 20) % 9); } }
  g.restore();   // a crowd of guardians at home on every floor, a little back from the edge so that he runs in front of them
  for (const p of cavGold) { if (C.taken[p.id]) continue; const x = Math.round(HX + p.x - sc); if (x > -10 && x < W + 10 && vis(CF[p.lvl])) drawGold(x, CF[p.lvl]); }
  if (!C.maskTaken) { const x = Math.round(HX + 1300 - sc), fy = CF[8]; if (x > -20 && x < W + 20 && vis(fy)) { R(x - 12, fy - 17, 24, 17, rgb(114, 104, 90)); R(x - 12, fy - 17, 24, 3, rgb(172, 156, 124)); R(x - 2, fy - 8, 4, 3, rgb(40, 190, 180)); drawIdol(x, fy - 17, now, false); } }
  R(0, CWATER, W, 300, rgb(30, 50, 200)); for (let x = 0; x < W; x += 4) { const wy = CWATER + Math.round(Math.sin((x + now * 40) * 0.12) * 1); R(x, wy, 4, 2, rgb(110, 140, 255)); }   // the river below
  const wy0 = Math.floor((-cam - 10) / 6) * 6; R(W - 12, wy0, 12, CWATER - wy0, rgb(150, 110, 50)); for (let y = wy0; y < CWATER; y += 6) R(W - 12 + (((y % 5) + 5) % 5), y, 5, 3, rgb(110, 76, 32));   // the rock wall at the right
  if (S.chase && !m) drawChasers(now, CF[C.lvl]);
  if (S.chase && S.chase.attack > 0 && S.chase.attack < 0.28 && !m) { const ay = CF[C.lvl] - 19; seg(HX - 25, ay + 4, HX + 3, ay, rgb(190, 160, 104), 1); R(HX + 2, ay - 2, 4, 3, rgb(216, 224, 226)); }   // the nearest guardian jabs at the intruder
  for (const st of CAVST) { if (st.kind !== "rope") continue; const xa = Math.round(HX + st.xs - sc); if (xa < -50 || xa > W + 50 || !vis(CF[st.lvl])) continue; const att = CF[st.lvl] - 44; let ex = xa + Math.round(3 * Math.sin(now * 2)), ey = att + 36;
    if (m && m.kind === "swing" && st.lvl === C.lvl) { const dx = st.xs - sc, fy = att + Math.sqrt(Math.max(1, 36 * 36 - Math.min(35 * 35, dx * dx))) + 23; ex = HX + 3; ey = fy - 23; }
    R(xa - 3, att - 4, 6, 4, ORD); seg(xa, att, ex, ey, rgb(200, 160, 96), 1); for (let k = 1; k < 6; k++) R(Math.round(lp(xa, ex, k / 6)) - 1, Math.round(lp(att, ey, k / 6)), 2, 1, rgb(140, 100, 56)); R(ex - 1, ey, 3, 3, rgb(200, 160, 96)); }   // a rope hung from the ceiling over the wide gap
  let y = CF[C.lvl], mode = S.duck ? "hide" : "run";
  if (m && (m.kind === "drop" || m.kind === "miss")) { const t = m.t, yy = (m.from === undefined ? CF[0] : m.from) + 300 * t * t; y = Math.min(CWATER + 2, Math.round(yy)); if (yy > CWATER) R(HX - 8, CWATER - 2, 16, 3, "#fff"); drawHero(HX, y, now, "plunge"); }
  else if (m && m.kind === "swing") { const dx = m.xs - sc; S.swK = Math.max(-1, Math.min(1, dx / 29)); S.wob = 0; drawHero(HX, Math.round(CF[C.lvl] - 44 + Math.sqrt(Math.max(1, 36 * 36 - Math.min(35 * 35, dx * dx))) + 23), now, "swing"); }
  else if (m) { const q = cl01(m.t / 2.0), hy2 = Math.round(lp(CF[C.lvl], CF[C.lvl - 1], q)), z = 40 + (CF[C.lvl] - hy2); g.save(); g.translate(0, hy2 - GY); drawLadderHero(HX, z, 1); g.restore(); }
  else { if (S.jump >= 0) { const u = S.jump / (S.jd || JD); y = CF[C.lvl] - 4 * (S.jh || JH) * u * (1 - u); mode = "air"; } S.wob = 0; S.slope = 0; drawHero(HX, Math.round(y), now, mode); }
  if (C.maskAnim) drawIdol(HX, CF[C.lvl] - 28, now, true);
  for (const k of S.sparks) R(k.x, k.y, 2, 2, (Math.floor(k.t * 20) & 1) ? "#fff" : rgb(252, 208, 64));
  g.restore();
  drawBats(now);
  if (C.maskAnim) { g.fillStyle = "rgba(0,0,0,0.7)"; g.fillRect(72, 13, 96, 13); g.fillStyle = "#ffe08a"; g.font = "8px monospace"; g.fillText("GOLDEN MASK", 89, 22); }
  if (C.t < 3.2) { const a = Math.min(1, C.t / 0.5, (3.2 - C.t) / 0.6); g.save(); g.globalAlpha = Math.max(0, a); g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(60, 22, 120, 14); g.fillStyle = "#ffe08a"; g.font = "8px monospace"; g.fillText("THE TREASURY", 82, 32); g.restore(); }   // a caption as he arrives
}
function drawCamp(now) {   // night by a fire: stars, a moon, the fire flickering on the beat; dawn comes while he wakes
  const b = S.camp.b, dawn = Math.max(0, Math.min(1, (b - 38) / 8)), fx = 116;
  R(0, 0, W, GY, rgb(6, 8, 30)); for (let y = 40; y < GY; y += 8) R(0, y, W, 4, rgb(10, 14, 44));
  if (dawn < 1) { g.save(); g.globalAlpha = 0.7 * (1 - dawn); drawCodeRain(now); g.restore(); }
  for (let i = 0; i < 26; i++) { const x = (i * 83) % W, y = 4 + (i * 37) % 54; if (Math.sin(now * 2 + i * 1.7) > -0.5 && dawn < 0.6) R(x, y, 1, 1, "#cde"); }
  R(190, 18, 9, 9, rgb(235, 235, 200)); R(193, 18, 6, 9, rgb(6, 8, 30)); R(194, 19, 5, 7, rgb(10, 14, 44)); R(190, 21, 4, 3, rgb(235, 235, 200));
  for (let i = -1; i < 7; i++) { const x = i * 47; R(x, 16, 7, GY - 16, rgb(22, 16, 14)); }
  for (let x = -8; x < W + 8; x += 6) { const h = 14 + Math.sin(x * 0.09) * 6 + Math.sin(x * 0.31) * 3; R(x, 0, 6, h, rgb(4, 24, 14)); }
  R(0, GY, W, 4, rgb(24, 100, 34)); R(0, GY + 4, W, H - GY - 4, rgb(70, 44, 20)); R(0, GY + 14, W, 12, rgb(46, 28, 14));
  const fl = (b < 40 ? 1 : Math.max(0.3, 1 - (b - 40) / 6)), h = Math.round((6 + M.pulse * 4 + (Math.sin(now * 17) > 0 ? 1 : 0)) * fl);
  R(fx - 34, GY - 8, 68, 8, "rgba(255,150,40,0.06)"); R(fx - 22, GY - 14, 44, 14, "rgba(255,150,40,0.07)"); R(fx - 12, GY - 20, 24, 20, "rgba(255,170,60,0.08)");
  seg(fx - 7, GY - 1, fx + 6, GY - 3, C.log, 3); seg(fx - 6, GY - 3, fx + 7, GY - 1, C.logEnd, 2);
  R(fx - 3, GY - 3 - h, 6, h, rgb(220, 50, 20)); R(fx - 2, GY - 3 - h + 2, 4, Math.max(1, h - 2), rgb(250, 140, 30)); R(fx - 1, GY - 7, 2, 4, C.gold);
  if (b < 6) { seg(fx + 8, GY, fx + 10, GY - 10, C.log, 1); R(fx + 9, GY - 15, 3, 6, FISH); R(fx + 9, GY - 15, 3, 1, rgb(250, 190, 120)); }   // the fish roasting on a stick, until he takes it
  const x = b < 5 ? -10 + 94 * b / 5 : 84;
  const mode = b < 5 ? "run" : b < 6 ? "sit" : b < 16 ? "eat" : b < 40 ? "sleep" : b < 43 ? "sit" : "idle";
  S.wob = 0; drawHero(x, GY, now, mode);
  if (mode === "sleep") for (let i = 0; i < 3; i++) { const ph = ((now * 0.7 + i / 3) % 1); g.fillStyle = `rgba(220,230,255,${1 - ph})`; g.font = `${6 + i}px monospace`; g.fillText("z", x - 12 + ph * 8 + i * 2, GY - 12 - ph * 22); }
  if (dawn > 0) { g.fillStyle = `rgba(255,170,100,${dawn * 0.3})`; g.fillRect(0, 0, W, GY); }
}
function legTo(hx, hy, tx, ty, dark, sg) {
  sg = sg || 1;   // a two-bone leg reaching a foot target; the knee points forward
  let dx = tx - hx, dy = ty - hy, d = Math.hypot(dx, dy) || 1; const L = TH + SH - 0.3; if (d > L) { dx *= L / d; dy *= L / d; d = L; }
  const a = (TH * TH - SH * SH + d * d) / (2 * d), h = Math.sqrt(Math.max(0, TH * TH - a * a)), kx = hx + dx * a / d + sg * dy / d * h, ky = hy + dy * a / d - sg * dx / d * h;
  const pc = dark ? shade(PAL.p, 0.6) : PAL.p; seg(hx, hy, kx, ky, pc, 2); seg(kx, ky, hx + dx, hy + dy, pc, 2); R(Math.round(hx + dx) - 1, Math.round(hy + dy) - 1, 4, 2, dark ? shade(PAL.b, 0.6) : PAL.b);
}
function drawLadderHero(x, z, dir) {   // facing the ladder (mirrored when climbing down the other cliff): each rung is a step with the hand and foot of opposite sides, the other pair waits
  const u = (z - 40) / 6, hipY = GY - 10, lx = x + 5, rungY = k => GY - (40 + 6 * k - z), sm = f => f * f * (3 - 2 * f);
  const pair = s => { const w = u + s, b = Math.floor(w / 2), f = w / 2 - b, m = sm(Math.max(0, Math.min(1, (f - 0.5) / 0.5))), kh = 3 + 2 * (b + m) - s * 0; return { hand: rungY(kh + 0.0), foot: rungY(kh - 3) }; };
  g.save(); if (dir < 0) { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
  const p0 = pair(0), p1 = pair(1), lean = 12 * DEG, sx = x + TORSO_L * Math.sin(lean), sy = hipY - TORSO_L * Math.cos(lean) + 1;
  legTo(x, hipY, lx - 1, p0.foot - 1, true); armTo(sx, sy, lx + 1, p1.hand, true);   // the far hand and the far foot belong to different pairs
  drawBody(x, hipY, lean);
  legTo(x, hipY, lx - 1, p1.foot - 1, false); armTo(sx, sy, lx + 1, p0.hand, false);
  g.restore();
}
function drawBackLadderHero(x, z) {   // seen from behind, climbing a ladder that runs straight up the shaft: hands and feet take the rungs in diagonal pairs (left hand with right foot), his back to us: hair under the hat, the jacket's seam, no face
  const u = (z - 40) / 6, hipY = GY - 10, rungY = k => GY - (40 + 6 * k - z), sm = f => f * f * (3 - 2 * f);
  const pair = s => { const w = u + s, b = Math.floor(w / 2), f = w / 2 - b, m = sm(Math.max(0, Math.min(1, (f - 0.5) / 0.5))), kh = 3 + 2 * (b + m); return { hand: rungY(kh), foot: rungY(kh - 3) }; };
  const A = pair(0), B = pair(1), bx = x + Math.round(Math.sin(u * 1.6)), sy = hipY - 7;
  legTo(bx - 2, hipY + 1, x - 4, B.foot - 1, true, -1); legTo(bx + 2, hipY + 1, x + 4, A.foot - 1, false, 1);
  R(bx - 3, hipY - 1, 6, 4, PAL.p); R(bx - 3, sy - 1, 6, 8, PAL.g); R(bx, sy, 1, 6, shade(PAL.g, 0.7)); R(bx - 3, hipY - 1, 6, 1, PAL.b);
  armTo(bx - 3, sy, x - 4, A.hand, true, -1); armTo(bx + 3, sy, x + 4, B.hand, false, 1);
  R(bx - 2, sy - 4, 5, 3, PAL.k); R(bx - 5, sy - 5, 11, 1, PAL.h); R(bx - 2, sy - 6, 5, 1, PAL.h);   // hair, hat brim and crown from behind
}
function drawLedgeHero(q, z, dir, H0) {   // H0: the height of the ledge (100 on the cliff, higher on a long ladder)
  H0 = H0 || 100;   // pulling himself over a cliff edge (q 0 -> 1): hands flat on the top, chest up, one knee swings onto the ledge, then the other foot, then he stands; played backwards, mirrored, it is lowering himself off the edge
  g.save(); if (dir < 0) { g.translate(HX, 0); g.scale(-1, 1); g.translate(-HX, 0); }
  const pq = sm01(cl01((q - 0.5) / 0.5)), Ly = GY - (H0 - z), Lx = HX + 6 - 8 * pq, lx = HX + 5;
  const pull = sm01(cl01(q / 0.45)), sw = sm01(cl01((q - 0.4) / 0.4)), up2 = sm01(cl01((q - 0.7) / 0.3)), st = sm01(cl01((q - 0.8) / 0.2));
  const lean = (12 + 22 * pull - 25 * st) * DEG, hx = HX + 3 * sw * (1 - st), hy = GY - 10, sx = hx + TORSO_L * Math.sin(lean), sy = hy - TORSO_L * Math.cos(lean) + 1;
  const rY = h => GY - (h - z) - 1;
  legTo(hx, hy, lp(lx - 1, Lx + 1, up2), lp(rY(H0 - 18), Ly - 1, up2), true);
  armTo(sx, sy, lp(Lx + 2, sx, st), lp(Ly - 1, sy + 8, st), true);
  drawBody(hx, hy, lean);
  legTo(hx, hy, lp(lx - 1, Lx + 4, sw), lp(rY(H0 - 12), Ly - 1, sw), false);
  armTo(sx, sy, lp(Lx + 5, sx + 2, st), lp(Ly - 1, sy + 8, st), false);
  g.restore();
}
function drawLookoutHero(x, feetY) {   // one boot on a raised deck fitting, hand on that knee, looking toward the horizon
  const hipY = feetY - legAF(x, 0, 4, 3).ay - 1, lean = 8 * DEG;
  const shoulderX = x + TORSO_L * Math.sin(lean), shoulderY = hipY - TORSO_L * Math.cos(lean) + 1;
  drawLeg(legAF(x, hipY, -4, 3), x, hipY, true);   // the planted leg uses the usual idle skeleton
  armTo(shoulderX, shoulderY, x - 3, hipY + 1, true, -1);   // hand at the hip
  drawBody(x, hipY, lean);   // exactly the same face, hat and torso scale as the other poses
  seg(x, hipY, x + 4, hipY - 2, PAL.p, 2);
  seg(x + 4, hipY - 2, x + 8, feetY - 11, PAL.p, 2);
  R(x + 7, feetY - 12, 4, 2, PAL.b);   // raised boot rests on the fitting
  armTo(shoulderX, shoulderY, x + 4, hipY - 2, false);   // hand on the raised knee
}
function drawClimb(now) {   // the old climb route on the liner: lower deck, left ladder, bridge roof, right ladder, gangway to shore
  const c = S.cl, w = c.w, z = c.z, ix = wr => Math.round(HX + wr - w), iy = h => Math.round(GY - (h - z));
  const WHITE = rgb(245, 246, 238), SHADE = rgb(194, 213, 225), GLASS = rgb(80, 198, 225), SEA = rgb(7, 39, 112), BLUE = rgb(21, 75, 151), RAIL = rgb(75, 91, 105), WOOD = rgb(139, 94, 54);
  R(0, 0, W, H, rgb(105, 183, 231)); R(0, 0, W, 38, rgb(55, 136, 208));
  for (let i = 0; i < 3; i++) { const x = ((i * 91 - Math.round(now * 2)) % 300 + 300) % 300 - 25; R(x, 18 + i * 9, 22, 4, WHITE); R(x + 5, 16 + i * 9, 12, 2, WHITE); }
  for (let i = 0; i < 4; i++) { const x = ((i * 67 + Math.round(now * (8 + i * 2))) % 290 + 290) % 290 - 24;
    const y = 34 + (i % 3) * 12 + Math.round(Math.sin(now * 2.2 + i) * 2), wing = Math.round(Math.sin(now * 8 + i * 2) * 3);
    seg(x - 7, y - 3 + wing, x, y, WHITE, 1); seg(x, y, x + 7, y - 3 + wing, WHITE, 1); R(x - 1, y, 3, 1, SHADE); }
  R(0, 77, W, H - 77, SEA); R(0, 77, W, 3, rgb(44, 120, 184));
  for (let x = 0; x < W; x += 4) { const wr = w + x - HX, sy = iy(T(wr));
    if (wr < 460) { R(x, sy + 3, 4, H - sy - 3, WHITE); R(x, sy, 4, 3, SHADE); }
    else if (wr >= 540) { R(x, sy, 4, H - sy, rgb(190, 149, 101)); R(x, sy, 4, 3, rgb(241, 211, 161)); }
  }
  for (let wx = -40; wx < 460; wx += 18) { const x = ix(wx), y = iy(24); if (x < -10 || x > W + 10) continue; R(x, y, 8, 7, RAIL); R(x + 1, y + 1, 6, 5, GLASS); }
  for (let wx = 333; wx < 435; wx += 17) { const x = ix(wx), y = iy(78); if (x < -10 || x > W + 10) continue; R(x, y, 10, 9, RAIL); R(x + 1, y + 1, 8, 7, GLASS); R(x + 2, y + 2, 3, 1, rgb(199, 245, 250)); }
  R(ix(324), iy(103), ix(440) - ix(324), 3, WHITE); R(ix(324), iy(100), ix(440) - ix(324), 2, RAIL);
  R(ix(351), iy(110), 12, 10, SHADE); R(ix(351), iy(110), 12, 2, WHITE);   // bridge-roof fitting for the raised boot
  R(ix(375), iy(119), 2, 16, SHADE); R(ix(369), iy(120), 16, 3, WHITE); R(ix(372), iy(124), 10, 2, RAIL);
  for (let wx = 346; wx < 432; wx += 18) { const x = ix(wx); R(x, iy(101), 1, 5, RAIL); }
  const rail = (wx0, wx1, h) => { R(ix(wx0), iy(h + 4), ix(wx1) - ix(wx0), 1, RAIL); for (let wx = wx0; wx <= wx1; wx += 15) R(ix(wx), iy(h + 4), 1, 5, RAIL); };
  rail(-40, 318, 40); rail(442, 460, 40);
  const shoreX = Math.max(0, Math.min(W, ix(540)));
  R(0, H - 18, shoreX, 18, SEA); R(shoreX, H - 18, W - shoreX, 18, rgb(190, 149, 101));
  R(0, H - 18, shoreX, 2, BLUE); drawStageEQ("surf", H - 2, 6, now);
  if (shoreX < W) R(shoreX, H - 18, W - shoreX, 3, rgb(241, 211, 161));
  seg(ix(460), iy(40), ix(540), iy(0), WOOD, 5); seg(ix(460), iy(48), ix(540), iy(8), RAIL, 1);
  for (let wx = 460; wx <= 540; wx += 12) { const h = T(wx); seg(ix(wx), iy(h + 8), ix(wx), iy(h), RAIL, 1); }
  const rung = (lxw, h0, h1) => { const X = ix(lxw); R(X - 1, iy(h1), 1, iy(h0) - iy(h1), WOOD); R(X + 3, iy(h1), 1, iy(h0) - iy(h1), WOOD); for (let h = h0; h <= h1; h += 6) R(X - 1, iy(h), 5, 1, rgb(207, 157, 99)); };
  rung(UPX + 5, 40, 104); rung(DNW - 5, 40, 104);
  S.wob = 0; const dir = c.ph === "down" ? -1 : 1;
  if (c.ph === "mount") drawLedgeHero(c.q, z, 1);
  else if (c.ph === "look") drawLookoutHero(HX, GY);
  else if (c.ph === "lookWalk") drawHero(HX, GY, now, "run");
  else if (c.ph === "lower") drawLedgeHero(c.q, z, -1);
  else if (c.ph === "leap") { if (c.sub === "fall") { S.fq = c.q; drawHero(HX, GY - Math.round(c.zh - c.z), now, "fall"); } else drawHero(HX, GY, now, c.sub === "wind" || c.mt < 0.4 ? "hide" : "idle"); }
  else if (c.ph === "crouch") { g.save(); g.translate(HX, 0); g.scale(-1, 1); g.translate(-HX, 0); drawHero(HX, GY, now, "idle"); g.restore(); }   // at the edge he turns to face the cliff (back to the drop) and goes straight over the edge (no sitting, no squatting)
  else if (c.ph === "turn") { g.save(); g.translate(HX, 0); g.scale(-1, 1); g.translate(-HX, 0); drawHero(HX, GY, now, "idle"); g.restore(); }
  else if (c.ph === "walk") { const tg = c.w > 460 && c.w < 540 ? -1 : 0; S.sl = (S.sl || 0) + (tg - (S.sl || 0)) * 0.12; S.slope = 0.5 * S.sl; S.wob = S.sl > 0 ? 4 * S.sl : 12 * S.sl; drawHero(HX, GY, now, "run"); S.wob = 0; S.slope = 0; }
  else drawLadderHero(HX, z, dir);
}
function drawCondor(x, y, now) {   // broad dark wings, hooked beak and pale neck; a low pass at the climber
  const flap = Math.round(5 * Math.sin(now * 15));
  seg(x - 3, y, x - 18, y - 5 + flap, rgb(56, 47, 44), 4); seg(x + 3, y, x + 18, y - 5 + flap, rgb(56, 47, 44), 4);
  for (let i = 0; i < 3; i++) { R(x - 18 + i * 3, y - 5 + flap + i, 2, 4, rgb(44, 39, 39)); R(x + 12 + i * 3, y - 3 + flap - i, 2, 4, rgb(44, 39, 39)); }
  R(x - 5, y - 2, 11, 6, rgb(69, 54, 48)); R(x - 6, y - 2, 4, 4, rgb(211, 191, 160));
  R(x - 8, y - 3, 3, 4, rgb(151, 68, 55)); R(x - 10, y, 3, 2, rgb(225, 181, 69)); R(x - 8, y - 2, 1, 1, rgb(15, 13, 13));
  R(x + 5, y + 2, 7, 2, rgb(46, 38, 36));
}
function wallRockPos(rock) {   // three contacts with the cliff face reverse the falling stone's horizontal course
  const keys = [[0, rock.x, -9], [0.55, rock.x - 24, rock.y], [1.02, rock.x + 8, rock.y + 25], [1.52, rock.x - 20, rock.y + 49], [2.3, rock.x + 12, H + 20]];
  for (let i = 1; i < keys.length; i++) if (rock.t <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i], t = (rock.t - a[0]) / (b[0] - a[0]);
    return { x: Math.round(lp(a[1], b[1], t)), y: Math.round(lp(a[2], b[2], t)) };
  }
  return { x: rock.x + 12, y: H + 20 };
}
function drawWallRock(x, y) {
  R(x - 5, y - 2, 10, 6, rgb(66, 62, 57)); R(x - 4, y - 5, 8, 3, rgb(84, 79, 69));
  R(x - 2, y - 6, 4, 2, rgb(119, 111, 91)); R(x - 4, y - 2, 3, 2, rgb(145, 134, 108));
  R(x + 3, y + 2, 3, 2, rgb(43, 42, 40));
}
function drawWallRear(now) {   // after the first grips, look over his shoulder straight at the rock face
  const c = S.wl, camera = Math.max(0, c.z - 22), groundY = 98 + camera, crestY = groundY - WALL_HEIGHT, bx = 120;
  R(0, 0, W, H, rgb(106, 177, 211)); R(0, 0, W, 30, rgb(69, 144, 202));
  if (crestY > 0) { for (let x = 0; x < W; x += 8) { const h = 10 + 3 * (M.far[Math.floor((W - x) / PITCH)] || 0); R(x, crestY - h, 8, h, rgb(42, 102, 87)); } }
  const top = Math.max(0, crestY), stone = rgb(111, 75, 43), shadeStone = rgb(79, 58, 39);
  R(8, top, 224, H - top, stone); R(8, top, 10, H - top, shadeStone); R(222, top, 10, H - top, shadeStone);
  if (crestY > -3) { R(8, crestY, 224, 3, rgb(144, 110, 72)); R(8, crestY - 3, 224, 3, C.grass); }
  for (let i = 0; i < 100; i++) { const x = 19 + (i * 47) % 198, y = crestY + 8 + (i * 31) % (WALL_HEIGHT + 40);
    if (y < top + 3 || y > H - 3) continue;
    R(x, y, 5 + i % 4, 2 + i % 2, i % 3 ? rgb(136, 119, 94) : rgb(92, 83, 70));
    if (i % 4 === 0) R(x + 1, y, 3, 1, rgb(174, 153, 119)); }
  const pos = k => ({ x: bx + c.L[k].x, y: Math.round(groundY - c.L[k].h) });
  if (c.phase === "up") for (const k of ["LH", "RH", "LF", "RF"]) { const p = pos(k); R(p.x - 3, p.y + 1, 8, 3, shadeStone); R(p.x - 3, p.y, 8, 1, rgb(166, 143, 108)); }
  if (c.phase === "up") for (const rock of c.rocks) {
    const ledges = [[rock.x - 24, rock.y], [rock.x + 8, rock.y + 25], [rock.x - 20, rock.y + 49]];
    for (const [x, y] of ledges) if (y > top + 3 && y < H) { R(x - 6, y + 4, 13, 3, shadeStone); R(x - 4, y + 3, 9, 1, rgb(171, 148, 112)); }
    const p = wallRockPos(rock); if (p.y > -8 && p.y < H + 6) drawWallRock(p.x, p.y);
    for (const hit of [0.55, 1.02, 1.52]) if (Math.abs(rock.t - hit) < 0.12) {
      R(p.x - 9, p.y - 5, 2, 2, rgb(174, 155, 121)); R(p.x + 7, p.y - 8, 2, 2, rgb(174, 155, 121));
    }
  }
  const hipY = Math.round(groundY - c.z), sy = hipY - 7, LF = pos("LF"), RF = pos("RF"), LH = pos("LH"), RH = pos("RH");
  if (c.condor) { const bird = c.condor; drawCondor(Math.round(bird.x), hipY - 27 + Math.round(8 * cl01((W - bird.x) / 130)), now); }
  legTo(bx - 2, hipY + 1, LF.x, LF.y, true, -1);
  legTo(bx + 2, hipY + 1, RF.x, RF.y, false, 1);
  R(bx - 3, hipY - 1, 6, 4, PAL.p); R(bx - 3, sy - 1, 6, 8, PAL.g);
  R(bx, sy, 1, 6, shade(PAL.g, 0.7)); R(bx - 3, hipY - 1, 6, 1, PAL.b);   // jacket seam identifies the rear view
  armTo(bx - 3, sy, LH.x, LH.y, true, -1);
  if (c.dodge > 0) { armTo(bx + 3, sy, bx + 2, sy - 7, false, 1); R(bx - 4, sy - 7, 9, 2, PAL.h); }
  else armTo(bx + 3, sy, RH.x, RH.y, false, 1);
  R(bx - 2, sy - 4, 5, 3, PAL.k); R(bx - 5, sy - 5, 11, 1, PAL.h); R(bx - 2, sy - 6, 5, 1, PAL.h);   // hair, hat and no face
}
function drawWall(now) {   // the landslide blocks the trail; the camera follows a long vertical climb until the ground vanishes
  const c = S.wl, camera = Math.max(0, c.z - 22), groundY = 98 + camera, toeX = 96, crestY = groundY - WALL_HEIGHT;
  if (c.phase === "top" || c.phase === "up" && c.steps >= 2) { drawWallRear(now); return; }
  const slopeY = x => crestY - Math.round(Math.min(30, Math.max(0, x - toeX) * 0.25)) + [0, -1, 1, 0, -2, 1][Math.floor(Math.max(0, x - toeX) / 6) % 6];
  R(0, 0, W, H, rgb(106, 177, 211)); R(0, 0, W, 30, rgb(69, 144, 202));
  for (let i = 0; i < 4; i++) { const x = 14 + i * 61, y = 20 + i * 6; R(x, y, 20, 3, rgb(216, 240, 237)); R(x + 5, y - 2, 12, 2, rgb(216, 240, 237)); }
  for (let x = 0; x < W; x += 4) { const y = 74 + camera + Math.round(7 * Math.sin(x * 0.045)); if (y < H) R(x, y, 4, H - y, rgb(42, 102, 87)); }
  if (groundY < H) { R(0, groundY, toeX, H - groundY, C.dirt); R(0, groundY, toeX, 3, C.grass); R(0, groundY + 13, toeX, 7, C.dirt2); }
  for (let y = Math.max(0, Math.floor((crestY - 32) / 3) * 3); y < H; y += 3) {
    const row = Math.floor((y - crestY) / 8), jag = [0, -3, 2, -2, 3, -4, 1, -1][((row % 8) + 8) % 8];
    const slopeStart = y < crestY ? toeX + Math.ceil((crestY - y) * 4) : toeX - 4;
    const x0 = Math.max(y >= groundY ? toeX - 4 : toeX + jag, slopeStart);
    if (x0 < W) R(x0, y, W - x0, 3, y > groundY + 12 ? C.dirt2 : C.dirt);
  }
  for (let x = toeX; x < W; x += 4) R(x, slopeY(x), 4, 2, rgb(146, 112, 77));
  for (let i = 0; c.phase !== "exit" && i < 90; i++) { const x = toeX + ((i * 29) % 150), y = slopeY(x) + 5 + ((i * 37) % (WALL_HEIGHT + 24));
    if (y > -9 && y < H - 3) { const w = 5 + i % 5, h = 3 + i % 4; R(x, y, w, h, i % 3 ? rgb(105, 99, 86) : rgb(129, 119, 98)); R(x + 1, y, Math.max(2, w - 3), 1, rgb(170, 158, 128)); } }
  if (groundY < H + 12) for (let i = 0; i < 13; i++) { const x = toeX - 19 + i * 7, y = groundY - 2 - ((i * 7) % 8); R(x, y, 5 + i % 3, 4 + i % 3, i % 2 ? rgb(121, 108, 86) : rgb(88, 82, 69)); }
  const treeTop = groundY - 90; if (treeTop < H) { R(70, treeTop, 6, 90, C.trunk); R(74, treeTop, 2, 90, C.dirt2);
    for (let i = 0; i < 6; i++) { const x = 52 + i * 7, y = treeTop + 3 + i % 2 * 3; R(x, y, 16, 8, C.leaf); R(x + 3, y - 3, 9, 3, C.leaf2); } }
  R(115, slopeY(115) + 8, 3, 16, C.trunk); R(117, slopeY(115) + 8, 7, 2, C.trunk);
  for (let i = 0; i < 5; i++) { const x = 116 + i * 24, y = slopeY(x) - 5; R(x, y, 10, 5, C.leaf); R(x + 3, y - 3, 6, 3, C.leaf2); }
  if (c.condor) { const bird = c.condor, heroY = groundY - c.z, dive = cl01((W + 20 - bird.x) / (W - 92));
    drawCondor(Math.round(bird.x), Math.round(heroY - 26 + 20 * dive - 8 * cl01((111 - bird.x) / 70)), now); }
  if (c.phase === "approach" || c.phase === "pause") { drawHero(Math.round(c.x), groundY, now, c.phase === "approach" ? "run" : "idle"); return; }
  if (c.phase === "exit") { drawHero(Math.round(c.x), slopeY(c.x), now, "run"); return; }
  if (c.phase === "top") { drawHero(100, slopeY(100), now, "idle"); return; }
  drawLadderHero(91, 40 + c.z, 1);   // body stays outside the wall; hands meet the rock at x=96
}
function drawSmallBoat(x, y, tilt = 0) {   // wood hull and raised bow, wide enough for one explorer
  g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(tilt);
  R(-23, -2, 46, 3, rgb(70, 42, 27)); R(-21, 1, 42, 5, rgb(141, 90, 48));
  R(-18, 6, 36, 3, rgb(104, 59, 34)); R(-13, 9, 26, 2, rgb(70, 42, 27));
  R(-22, -5, 4, 7, rgb(116, 68, 36)); R(18, -7, 5, 9, rgb(116, 68, 36));
  R(-14, -2, 11, 2, rgb(187, 132, 75)); R(6, -2, 10, 2, rgb(187, 132, 75));
  g.restore();
}
function drawBoatRower(x, y, now) {   // seated low in the hull, rowing with a visible stroke
  const stroke = Math.sin(now * 6), handX = x + 6 + Math.round(stroke * 2), handY = y - 12;
  seg(x, y - 5, x + 5, y - 7, PAL.p, 2); seg(x + 5, y - 7, x + 9, y - 3, PAL.p, 2); R(x + 8, y - 4, 4, 2, PAL.b);
  seg(x - 1, y - 5, x + 3, y - 8, shade(PAL.p, 0.6), 2); seg(x + 3, y - 8, x + 7, y - 3, shade(PAL.p, 0.6), 2);
  drawBody(x, y - 5, 3 * DEG);   // same torso, head and fedora proportions as the running explorer
  armTo(x, y - 12, x + 3, y - 9, true);
  armTo(x + 1, y - 12, handX, handY, false);
}
function drawBoatOar(x, y, now) {
  const stroke = Math.sin(now * 6);
  seg(x + 6 + Math.round(stroke * 2), y - 12, x + 25 + Math.round(stroke * 5), y + 9, rgb(112, 70, 40), 2);
  R(x + 23 + Math.round(stroke * 5), y + 7, 8, 2, rgb(174, 125, 74));
}
function drawBoatTumble(x, y, now, u) {   // head tips forward; arms and legs flail independently
  g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(lp(0.4, 1.15, sm01(cl01(u * 2))) + Math.sin(now * 15) * 0.14);
  drawHero(0, 0, now, "plunge"); g.restore();
}
function drawBoatfallRidge(endX) {   // recorded volume columns travel left; each mountain height stays fixed after entering
  for (let x = 0; x < endX; x += 4) {
    const i = Math.floor((W - M.farOff - x) / PITCH), h = 10 + 3 * (M.far[i] || 0), w = Math.min(4, endX - x);
    R(x, 74 - h, w, h, rgb(31, 105, 93)); R(x, 74 - h, w, 2, rgb(91, 173, 162));
  }
}
function drawBoatfallSurf(endX, now) {   // pale blue and white EQ in the lower part of the stream
  for (let j = 0; j < 30 && j * PITCH < endX; j++) {
    const x = j * PITCH + 1, n = Math.max(1, Math.min(5, Math.round(M.eqH[j] + 0.5 + 0.6 * Math.sin(now * 3 + j * 0.7))));
    for (let k = 0; k < n; k++) { const y = 114 - 4 * (k + 1); R(x, y, Math.min(6, endX - x), 3, SURF_EQ[5 - k]); }
    if (n > 2) R(x + 1, 112 - 4 * n, Math.min(4, endX - x - 1), 1, rgb(245, 253, 255));
  }
}
function drawBoatfallCascade(lipX, topY, now) {   // the stream keeps its forward motion as it pours over the edge
  const fallSpeed = Math.floor(now * 48);
  for (let y = Math.floor(topY); y < H; y += 2) {
    const d = y - topY, bend = Math.round(0.35 * d - 0.0006 * d * d), x = lipX + bend;
    R(x, y, 16, 2, rgb(34, 134, 197)); R(x + 2, y, 8, 2, rgb(113, 210, 239));
    if (((y + fallSpeed) % 13 + 13) % 13 < 3) R(x + 1, y, 4, 2, rgb(238, 250, 255));
    if (((y + fallSpeed + 6) % 17 + 17) % 17 < 3) R(x + 13, y, 3, 2, rgb(214, 244, 255));
    if (d > 20 && y % 9 < 2) R(x + 18 + d % 5, y - 1, 2, 2, rgb(187, 234, 249));
  }
}
function drawBoatfall(now) {   // vines land beside a brook; a moored boat carries him over a waterfall into the river
  const t = S.boat.t, phase = S.boat.phase, WATER = rgb(26, 104, 174), DEEP = rgb(13, 65, 136), FOAM = rgb(226, 250, 255);
  if (phase === "drop") {
    const u = cl01((t - 11) / 2.5), rush = Math.round(u * 210), cliffTop = Math.round(74 - rush);
    R(0, 0, W, H, rgb(105, 184, 220));
    R(0, Math.max(0, cliffTop), 105, H, rgb(110, 80, 55));
    for (let row = -1; row < 14; row++) { const y = ((row * 15 - rush) % 165 + 165) % 165 - 15;
      R(4, y + 4, 31, 2, rgb(151, 121, 82)); R(55, y + 10, 40, 2, rgb(74, 63, 51)); }
    if (cliffTop > 0) { R(0, cliffTop - 5, 105, 5, WATER); R(0, cliffTop - 1, 105, 2, FOAM); }
    drawBoatfallCascade(105, cliffTop - 5, now);
    if (u > 0.64) { const poolY = Math.round(137 - 29 * sm01(cl01((u - 0.64) / 0.36))); R(0, poolY, W, H - poolY, DEEP); R(0, poolY, W, 3, FOAM); }
    const boatY = Math.round(78 + 57 * sm01(cl01(u * 1.18)));
    const heroY = Math.round(67 + 51 * sm01(cl01((u - 0.08) / 0.92)));
    drawSmallBoat(117 + Math.round(9 * u), boatY, u * 0.55);
    drawBoatTumble(107 + Math.round(14 * u), heroY, now, u);
    return;
  }
  if (phase === "splash") {
    const u = cl01((t - 13.5) / 2), hx = Math.round(lp(100, HX, u));
    R(0, 0, W, 42, rgb(73, 150, 197)); R(0, 42, W, H - 42, WATER); R(0, 92, W, H - 92, DEEP);
    for (let i = 0; i < 30; i++) { const x = i * 11 - 8, y = 41 + Math.round(Math.sin(i * 0.7 - now * 5) * 2); R(x, y, 8, 2, FOAM); }
    drawSmallBoat(150 + Math.round(75 * u), 78 + Math.round(3 * Math.sin(now * 4)), 0.2);
    for (let i = 0; i < 14; i++) { const x = 95 + ((i * 19) % 40) - Math.round(9 * u), y = 40 + ((i * 13) % 48) - Math.round(15 * u); R(x, y, 2, 3, i % 2 ? FOAM : rgb(139, 217, 248)); }
    drawHero(hx, 91, now, "swim"); return;
  }
  const moving = phase === "cruise" || phase === "lip", off = moving ? (t - 2.8) * 21 : 0;
  R(0, 0, W, H, rgb(105, 184, 220)); R(0, 0, W, 27, rgb(68, 145, 205));
  const lipX = phase === "lip" ? Math.round(260 - (t - 8.4) * 62) : W + 20, bankEnd = Math.min(W, lipX);
  drawBoatfallRidge(bankEnd);
  for (let i = -1; i < 7; i++) { const x = ((i * 48 - off * 0.7) % 335 + 335) % 335 - 35;
    R(x, 25, 5, 51, C.trunk); R(x - 10, 21, 27, 8, C.leaf); R(x - 5, 17, 18, 5, C.leaf2); }
  if (lipX < W) R(lipX, 27, W - lipX, 51, rgb(105, 184, 220));   // open air beyond the last bank
  R(0, 74, bankEnd, H - 74, WATER); R(0, 93, bankEnd, H - 93, DEEP);
  for (let i = 0; i < 16; i++) { const x = ((i * 27 - off * 1.3) % 300 + 300) % 300 - 20; if (x + 8 < lipX) R(x, 75 + (i % 4) * 8, 8, 1, rgb(151, 220, 246)); }
  R(0, 115, bankEnd, H - 115, rgb(110, 80, 55)); R(0, 115, bankEnd, 3, rgb(71, 83, 55));
  drawBoatfallSurf(bankEnd, now);
  if (lipX < W) { R(lipX - 3, 73, 6, 6, FOAM); drawBoatfallCascade(lipX, 78, now); }
  if (!moving) { R(0, 87, 68, H - 87, C.dirt); R(0, 85, 68, 3, C.grass); }
  const bob = Math.round(Math.sin(now * 4) * (1 + M.level * 2));
  if (phase === "cruise" || phase === "lip") drawBoatRower(100, 77 + bob, now);
  drawSmallBoat(102, 77 + bob, phase === "lip" ? 0.04 * (t - 8.4) : 0);
  if (phase === "cruise" || phase === "lip") drawBoatOar(100, 77 + bob, now);
  if (phase === "shore") drawHero(Math.round(lp(15, 70, cl01(t / 1.6))), 85, now, "run");
  else if (phase === "board") { const u = sm01(cl01((t - 1.6) / 1.2)); drawHero(Math.round(lp(70, 102, u)), Math.round(lp(85, 76 + bob, u) - 10 * Math.sin(Math.PI * u)), now, "air"); }
}
function drawRiver(now) {
  const entry = S.under && S.waterEntry ? S.waterEntry.t : 1, lift = S.under ? Math.round(62 * (1 - sm01(cl01(entry / 1.1)))) : 0;
  if (lift) { R(0, 0, W, H, rgb(8, 7, 10)); g.save(); g.translate(0, lift); }   // the same waterline starts where the treasury fall ended, then the camera follows him down
  if (S.under) { R(0, 0, W, 40, rgb(22, 16, 28)); const gapX = Math.round(HX - (S.scroll - S.sceneScroll) * 0.75); for (let x = 0; x < W; x += 4) { if (x + 4 > gapX - 9 && x < gapX + 9) continue; R(x, 0, 4, 8, rgb(212, 124, 42)); R(x, 8, 4, 4, rgb(150, 84, 26)); R(x, 12, 4, 1, rgb(96, 56, 26)); if (x % 24 === 0) R(x, 1, 1, 7, rgb(120, 66, 28)); }
    R(0, 19, W, 1, rgb(66, 48, 43)); for (let x = -((S.scroll * 0.35) % 24); x < W; x += 24) R(x, 20, 1, 13, rgb(58, 44, 44)); }   // a brick-lined waterway beneath the treasury, not an open river
  else { R(0, 0, W, 40, C.sky2);
    for (let i = M.far.length - 1; i >= 0; i--) { const x = W - M.farOff - (i + 1) * PITCH, h = 7 + 3 * M.far[i];
      R(x, 40 - h, PITCH, h, C.sky); R(x, 40 - h, PITCH, 2, C.leaf); } }   // the dark-green ridge keeps each volume-derived height as it scrolls left
  if (!S.under) drawStageEQ("riverSurf", 40, 6, now);   // pale-blue-to-white wave blocks sit behind the waterline
  R(0, 40, W, H - 40, C.water);
  for (let x = 0; x < W; x += 2) { const wave = Math.round(M.level * (4 * Math.sin(x * 0.11 - now * 3) + 1.5 * Math.sin(x * 0.05 + now * 1.7))), y = 34 + wave; R(x, y, 2, 40 - y, C.water); R(x, y, 2, 1, C.water2); }
  R(0, 90, W, H - 90, rgb(14, 50, 140));   R(0, 116, W, H - 116, C.deep);
  drawStageEQ("weed", H, 10, now); // green aquatic plants sway with the water
  for (let i = 0; i < 18; i++) { const x = S.under ? i * 53 % W + Math.round(Math.sin(now * 0.9 + i) * 2) : ((i * 53 - S.scroll * 0.8) % 270 + 270) % 270 - 15, y = 40 + (i * 29) % 90; R(x, y, 8, 1, C.water2); }
  if (S.under) drawWaterSnake(150 + Math.round(Math.sin(now * 0.7) * 10), 64 + Math.round(Math.sin(now * 1.1) * 2), now);
  for (const o of S.under ? [] : S.obs) { const x = obsX(o); if (x > W + 24) continue; const y = LANES[o.lane] + (o.sine ? Math.round(Math.sin(now * 2.6 + o.wx * 0.02) * 13) : 0);   // a sine swimmer weaves up and down within its lane
    if (o.type === "croc") drawRiverCroc(x, y, now, ttl(o));
    else if (o.type === "piranha") drawPiranha(x, y, now);
    else if (o.type === "snake") drawRiverSnake(x, y, now);
    else { R(x - 12, y - 4, 24, 7, C.log); R(x - 12, y - 4, 2, 7, C.logEnd); } }
  if (S.under) { const sx = Math.round(HX + WATERWAY_LEN - (S.scroll - S.sceneScroll)); if (sx < W + 20) { R(sx - 15, 13, 34, H - 13, rgb(52, 48, 49)); R(sx - 11, 15, 26, H - 15, rgb(24, 45, 78)); for (let y = 18; y < H; y += 8) R(sx - 9 + Math.round(Math.sin(now * 6 + y) * 2), y, 22, 3, rgb(96, 191, 235)); R(sx - 14, 10, 32, 4, rgb(145, 105, 63)); } }   // the water source at the end of the channel
  for (const b of S.bubbles) R(b.x, b.y, 2, 2, C.water2);
  for (const d of S.drops) R(d.x, d.y, 2, 2, d.vy < 0 ? "#fff" : rgb(190, 225, 255));
  if (S.waterExit) { const u = sm01(cl01(S.waterExit.t / 1.7)); R(HX + 22, 30, 27, 104, rgb(37, 103, 163)); for (let y = 36; y < 132; y += 9) R(HX + 26 + Math.round(Math.sin(now * 7 + y) * 3), y, 19, 3, rgb(144, 225, 255)); drawHero(HX + Math.round(28 * u), Math.round(S.laneY) + 8 - Math.round(11 * u), now, "swim"); }
  else if (S.under && S.waterEntry) { const u = sm01(cl01(entry / 1.1)), hy = Math.round(lp(98 - lift, S.laneY + 8, u)); if (entry < 0.45) R(HX - 8, 32, 16, 3, "#fff"); drawHero(HX, hy, now, entry < 0.25 ? "plunge" : "swim"); }
  else drawHero(HX, Math.round(S.laneY) + 8, now, "swim");
  if (S.under) { g.fillStyle = "rgba(0,0,30,0.34)"; g.fillRect(0, 0, W, H); }
  if (lift) g.restore();
}
const MAPP = [[26, 100], [54, 80], [82, 96], [112, 66], [142, 84], [174, 52], [206, 34]];   // the route of one day on the expedition map: six legs from the camp to the ruins
const PLACE = { jungle: "THE JUNGLE", river: "THE RIVER", climb: "THE LINER", wall: "THE OLD WALL", cave: "THE CAVE", camp: "CAMP FOR THE NIGHT" };
function drawMap(now) {   // between two scenes: an old parchment map; the red dotted route grows by one leg and a little hat marks where he is now
  const m = S.map, t = m.t, INK = rgb(86, 56, 28), RED = rgb(200, 40, 36), PA = rgb(218, 194, 144), SP = rgb(204, 178, 128);
  g.save(); g.globalAlpha = Math.max(0, Math.min(1, t / 0.35, (2.8 - t) / 0.35));
  R(0, 0, W, H, rgb(58, 38, 18)); R(4, 4, W - 8, H - 8, rgb(196, 168, 114)); R(6, 6, W - 12, H - 12, PA);
  for (let i = 0; i < 70; i++) { const h = Math.imul(i + 1, 2654435761) >>> 0; R(8 + (h >>> 8) % (W - 16), 8 + (h >>> 16) % (H - 16), 1, 1, SP); }   // paper speckles
  R(W / 2, 6, 1, H - 12, SP); R(6, H / 2, W - 12, 1, SP);   // fold lines
  {   // Nazca-style line drawings scratched into the desert of the map: a hummingbird, a monkey with a spiral tail, a spider, and a few long straight lines
    const GL = rgb(166, 118, 78), ln = (x0, y0, x1, y1) => seg(x0, y0, x1, y1, GL, 1), ring = (cx, cy, r) => { let px = cx + r, py = cy; for (let a = 0.5; a <= 6.9; a += 0.5) { const nx = cx + Math.cos(a) * r, ny = cy + Math.sin(a) * r; ln(px, py, nx, ny); px = nx; py = ny; } };
    ln(150, 14, 160, 19); ln(160, 19, 176, 16); ln(176, 16, 186, 24); ln(186, 24, 178, 28); ln(178, 28, 160, 25); ln(160, 25, 150, 14);   // hummingbird: the long beak, head and body
    ln(172, 17, 168, 6); ln(168, 6, 180, 12); ln(180, 12, 184, 22); ln(186, 24, 198, 22); ln(186, 24, 200, 28); ln(186, 24, 196, 34);   // a wing, and the fanned tail
    ring(220, 80, 5); ln(220, 85, 220, 98); ln(220, 88, 212, 94); ln(220, 88, 228, 82); ln(220, 98, 214, 106); ln(220, 98, 227, 105);   // the monkey: head, body, arms, legs
    { let px = 220, py = 98; for (let a = 0; a < 15; a += 0.7) { const r = 1.2 + a * 0.55, nx = 230 + Math.cos(a + 2) * r * 0.9, ny = 94 + Math.sin(a + 2) * r * 0.9; ln(px, py, nx, ny); px = nx; py = ny; } }   // and its spiral tail
    ring(24, 62, 3); ring(24, 69, 4); for (let i = 0; i < 4; i++) { ln(21, 62 + i * 3, 11, 58 + i * 6); ln(27, 62 + i * 3, 37, 58 + i * 6); }   // the spider
    ln(8, 112, 70, 119); ln(8, 119, 70, 112); ln(100, 8, 112, 40); ln(190, 62, 232, 56);   // long straight lines
  }
  for (let y = 8; y < H - 8; y += 2) R(Math.round(120 + Math.sin(y * 0.09) * 14 - y * 0.15), y, 2, 2, rgb(96, 140, 190));   // the river
  const mtn = (cx, by, w, h) => { for (let i = 0; i < h; i++) { const ww = Math.max(1, Math.round(w * (i + 1) / h)); R(cx - (ww >> 1), by - h + i, ww, 1, INK); if (i > 1 && i < h - 1) R(cx - (ww >> 1) + 1, by - h + i, Math.max(1, ww >> 2), 1, rgb(150, 110, 70)); } };
  mtn(70, 52, 16, 12); mtn(84, 54, 12, 9); mtn(160, 112, 18, 13); mtn(176, 114, 12, 9); mtn(36, 40, 12, 9);
  for (const [x, y] of [[36, 66], [42, 70], [96, 40], [102, 44], [190, 86], [196, 90], [130, 104], [136, 108], [210, 66], [60, 112], [66, 108]]) { R(x, y, 3, 3, rgb(70, 120, 60)); R(x + 1, y + 3, 1, 2, INK); }   // forests
  R(20, 18, 1, 9, INK); R(17, 22, 7, 1, INK); g.fillStyle = INK; g.font = "6px monospace"; g.fillText("N", 18, 17);   // a compass
  const lens = []; for (let i = 0; i < LEGS; i++) lens.push(Math.hypot(MAPP[i + 1][0] - MAPP[i][0], MAPP[i + 1][1] - MAPP[i][1]));
  const done = lens.slice(0, m.leg0).reduce((a, b) => a + b, 0), prog = done + (m.leg0 < LEGS ? lens[m.leg0] * sm01(cl01((t - 0.5) / 1.6)) : 0);
  const posAt = L => { let a = 0; for (let i = 0; i < LEGS; i++) { if (L <= a + lens[i] || i === LEGS - 1) { const f = cl01((L - a) / lens[i]); return [lp(MAPP[i][0], MAPP[i + 1][0], f), lp(MAPP[i][1], MAPP[i + 1][1], f)]; } a += lens[i]; } };
  for (let L = 0; L <= prog; L += 4) { const [px, py] = posAt(L); R(px - 1, py - 1, 2, 2, RED); }   // the dotted red route
  const [tx, ty] = MAPP[LEGS]; R(tx - 9, ty, 18, 3, INK); R(tx - 6, ty - 3, 12, 3, INK); R(tx - 3, ty - 6, 6, 3, INK); R(tx - 1, ty - 9, 2, 3, rgb(230, 180, 40)); R(tx - 1, ty + 1, 2, 2, rgb(30, 20, 10));   // the ruins at the end of the day
  const [sx, sy] = MAPP[0]; R(sx - 4, sy, 9, 1, INK); for (let i = 0; i < 4; i++) R(sx - i, sy - 4 + i, 2 * i + 1, 1, INK);   // the camp
  const [hx, hy] = posAt(prog), pu = Math.round(M.pulse * 2); R(hx - 5, hy - 4 - pu, 10, 2, rgb(96, 58, 26)); R(hx - 3, hy - 8 - pu, 6, 4, rgb(96, 58, 26)); R(hx - 3, hy - 5 - pu, 6, 1, rgb(60, 36, 18));   // his hat, bobbing on the beat
  g.fillStyle = INK; g.font = "8px monospace"; g.fillText("DAY " + S.day, 14, 124); g.fillText(PLACE[m.name] || "", 70, 124); g.fillText("LEG " + Math.min(LEGS, m.leg0 + 1) + "/" + LEGS, 190, 124);
  g.restore();
}
const PYRAMID_X = 120, PYRAMID_ROCK_TIMES = [3.2, 6.2, 9.2];
function drawFountain(now) {   // the geyser throws him upward while the inside of the building rushes downward
  const t = now - S.t0, off = Math.round(t * 185);
  R(0, 0, W, H, rgb(18, 23, 38));
  for (let row = -2; row < 15; row++) { const y = ((row * 12 + off) % 156 + 156) % 156 - 12;
    for (let x = 0; x < W; x += 24) { R(x + (row & 1 ? 12 : 0), y, 23, 11, rgb(92, 80, 78)); R(x + (row & 1 ? 12 : 0), y, 23, 2, rgb(133, 112, 99)); }
    if (row % 3 === 0) { R(19, y + 2, 11, 7, rgb(246, 177, 72)); R(210, y + 2, 11, 7, rgb(246, 177, 72)); } }
  R(0, 0, 16, H, rgb(58, 52, 55)); R(W - 16, 0, 16, H, rgb(58, 52, 55));
  R(76, 0, 88, H, rgb(28, 92, 158));
  for (let y = -16; y < H + 16; y += 12) { const yy = ((y - off * 0.7) % (H + 24) + H + 24) % (H + 24) - 12; R(83 + Math.round(Math.sin(y + now * 5) * 5), yy, 65, 4, rgb(80, 181, 231)); R(98, yy + 4, 42, 2, rgb(215, 249, 255)); }
  if (t > 3.8) { const lip = Math.round(-10 + (t - 3.8) * 130); R(0, 0, W, Math.max(0, lip), rgb(110, 185, 229)); R(0, lip, W, 7, rgb(178, 142, 91)); }
  const lift = t < 3.8 ? 0 : Math.round(110 * sm01(cl01((t - 3.8) / 1.1)));
  drawHero(PYRAMID_X + Math.round(Math.sin(now * 11) * 3), 79 - lift, now, "plunge");
  for (let i = 0; i < 11; i++) { const x = 84 + i * 7, y = Math.round((i * 37 - off * 1.2) % 150); R(x, (y + 150) % 150, 2, 3, "#fff"); }
}
function drawPyramidBackdrop(now, rise, fall, move = 0) {
  R(0, 0, W, H, rgb(101, 181, 226)); R(0, 0, W, 40, rgb(61, 138, 204));
  for (let i = 0; i < 4; i++) { const x = (i * 79 - S.scroll * 0.04 + 300) % 300 - 20, y = 17 + i * 8 - Math.round(fall * 18); R(x, y, 25, 4, "#fff"); R(x + 5, y - 3, 15, 3, "#fff"); }
  for (let x = 0; x < W; x += 8) { const top = 57 + Math.floor(x / 24) * 5 + rise; if (top >= H) continue; R(x, top, 8, H - top, rgb(174, 135, 82)); R(x, top, 8, 3, rgb(239, 195, 108)); }
  for (let y = 84 + rise; y < H; y += 10) for (let x = -((Math.round(move) + (y % 20 ? 0 : 8)) % 24); x < W; x += 24) if (y >= 60 + Math.floor(Math.max(0, x) / 24) * 5 + rise) R(x, y, 13, 1, rgb(113, 82, 55));
  for (let x = 36 - (Math.round(move * 0.6) % 60); x < W; x += 60) { const top = 57 + Math.floor(Math.max(0, x) / 24) * 5 + rise; if (top + 24 < H) { R(x, top + 12, 7, 7, rgb(126, 89, 51)); R(x + 2, top + 14, 3, 3, rgb(228, 182, 98)); } }
}
function drawSkyfall(now) {   // after leaving the water jet above the screen, he drops back into view over the pyramid
  const t = now - S.t0, u = cl01(t / 3.3), rise = Math.round(80 * (1 - sm01(cl01(t / 2.7))));
  drawPyramidBackdrop(now, rise, t);
  const feet = -24 + Math.round(106 * Math.pow(u, 1.7));
  if (t > 0.35) drawHero(PYRAMID_X, feet, now, u > 0.86 ? "air" : "plunge");
  for (let i = 0; i < 7; i++) { const y = feet + 13 + i * 3; R(PYRAMID_X - 5 + (i * 7) % 12, y, 1, 2, i & 1 ? "#fff" : rgb(164, 230, 255)); }
}
function drawPyramid(now) {   // the falling hero has landed on the sunlit stepped outer wall
  const t = now - S.t0;
  const move = Math.max(0, S.scroll - S.sceneScroll), runX = PYRAMID_X + Math.round(24 * sm01(cl01(t / 0.9)));
  drawPyramidBackdrop(now, 0, 0, move);
  if (t < 0.65) for (let i = 0; i < 9; i++) { const d = t * 20, x = PYRAMID_X + (i - 4) * (2 + d * 0.28), y = 81 - Math.sin(i * 1.8) * (4 + d) + d * 0.7; R(Math.round(x), Math.round(y), 2, 2, i & 1 ? "#fff" : rgb(164, 230, 255)); }
  drawHero(runX, 57 + Math.floor(runX / 24) * 5, now, S.pyramidDuck ? "rockCover" : S.pyramidLook ? "pyramidLook" : "pyramidRun");
  for (const rock of S.pyramidRocks || []) { const x = Math.round(rock.x), ground = 57 + Math.floor(Math.max(0, x) / 24) * 5, bounce = 22 * Math.abs(Math.sin((rock.x + 12) * Math.PI / 62)), y = Math.round(ground - 10 - bounce);
    R(x - 8, ground + 1, 16, 1, rgb(102, 74, 53));
    for (let dy = -10; dy <= 10; dy++) { const half = Math.floor(Math.sqrt(100 - dy * dy)); R(x - half, y + dy, 2 * half + 1, 1, rgb(61, 58, 57)); if (half > 1) R(x - half + 1, y + dy, 2 * half - 1, 1, dy > 5 ? rgb(103, 99, 93) : rgb(137, 132, 122)); }
    R(x - 5, y - 5, 4, 2, rgb(211, 204, 184)); R(x + 2, y - 3, 3, 2, rgb(91, 88, 83)); R(x - 1, y + 4, 4, 2, rgb(105, 100, 93));
    if (bounce < 3) for (let i = 0; i < 3; i++) R(x - 10 + i * 8, ground - 2 - i % 2, 2, 1, rgb(201, 164, 107)); }
}
function drawFrame(now) {
  if (S.scene === "jungle") { if (S.tarzan) drawTarzan(now); else drawJungle(now); } else if (S.scene === "cavern") drawCavern(now); else if (S.scene === "fountain") drawFountain(now); else if (S.scene === "skyfall") drawSkyfall(now); else if (S.scene === "pyramid") drawPyramid(now); else if (S.scene === "camp") drawCamp(now); else if (S.scene === "climb") drawClimb(now); else if (S.scene === "wall") drawWall(now); else if (S.scene === "boatfall") drawBoatfall(now); else if (S.scene === "cave") drawCave(now); else drawRiver(now);
  const dark = (["camp", "cave", "boatfall", "fountain", "skyfall", "pyramid"].includes(S.scene) ? 0 : M.sounding ? Math.max(0, 0.5 - M.level * 0.9) : 0.55) * (S.scene === "climb" || S.scene === "jungle" && S.land === "open" ? 0.45 : 1);
  if (S.scene === "jungle" && S.land !== "open" && S.tired > 0.5) { g.fillStyle = `rgba(255,110,30,${Math.min(0.5, (S.tired - 0.5) * 0.5)})`; g.fillRect(0, 0, W, GY); }   // the evening tint belongs to the outdoor journey, not the treasury
  S.visualDark = (S.visualDark === undefined ? dark : S.visualDark + (dark - S.visualDark) * 0.018);
  if (S.visualDark > 0) { g.fillStyle = `rgba(0,0,12,${S.visualDark})`; g.fillRect(0, 0, W, H); }
  // No full-screen beat flash: the EQ and character provide the music cues without flicker.
  if (S.fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, S.fade)})`; g.fillRect(0, 0, W, H); }
  if (S.map) drawMap(now);
  if (!M.sounding) { g.fillStyle = "#fff"; g.font = "8px monospace"; g.fillText("BEAT ADVENTURE", 70, 60); g.fillStyle = "#aaa"; g.fillText("play music (Test song / MIC / TAB AUDIO)", 24, 76); }
  // No status line on the screen, as in KeySpeaker: nothing is written while it plays. The d key (or the Numbers button) shows the same numbers as the Cardputer build: stage, day and tempo, and PULSE (green: the tracker holds a clear pulse) or onset (amber).
  if (showDiag) {
    const stage = S.under ? "WATERWAY" : S.scene === "climb" ? "LINER" : S.scene === "jungle" ? (S.tarzan ? "VINES" : S.land === "open" ? "BEACH" : S.landN === 2 ? "FOREST 2" : "FOREST") : S.scene === "cavern" ? "TREASURY" : S.scene === "cave" ? (S.lab ? "TUNNEL" : "CAVE") : S.scene === "boatfall" ? "BOAT+FALLS" : S.scene.toUpperCase();
    const label = (t, x, y, c) => { g.font = "7px monospace"; g.fillStyle = "#000"; g.fillText(t, x + 1, y + 1); g.fillStyle = c; g.fillText(t, x, y); };
    label(stage + "  DAY " + S.day + "  " + Math.round(60 / M.T) + " bpm", 4, 127, "#fff");
    if (M.sounding) label(bt.locked ? "PULSE" : "onset", 180, 117, bt.locked ? "#4cd964" : "#ffb020");
  }
  for (let i = 0; i < 6; i++) R(W - 10 - i * 5, 125, 3, 3, M.pulse > 0.5 && i === 0 ? C.gold : (M.level * 6 > i ? C.grass : rgb(40, 50, 40)));
}

/* ---------- loop and controls ---------- */
let paused = false, pauseStarted = 0, pauseOffset = 0;
const gameTime = () => (paused ? pauseStarted : performance.now() / 1000) - pauseOffset;
let last = gameTime();
function refreshAudioStatus() {
  const ja = document.documentElement.dataset.lang === "ja", src = A.src;
  const message = paused ? (ja ? "画面を停止中。音声の接続は維持しています。" : "Screen paused. Audio remains connected.")
    : S.scene === "camp" ? (ja ? "キャンプで休憩中。音楽が戻ると冒険を再開します。" : "Resting at Camp. The adventure resumes with the music.")
    : src === "tab" ? (ja ? "タブの音声に反応しています。" : "Reacting to tab audio.")
    : src === "mic" ? (ja ? "マイクの音に反応しています。" : "Reacting to the microphone.")
    : src === "test" ? (ja ? "テスト曲を再生中。" : "Playing the test song.")
    : (ja ? "音源を選ぶと冒険が音に反応します。" : "Choose a sound source to sync the adventure.");
  if ($("msg").textContent !== message) $("msg").textContent = message;
  for (const [id, kind] of [["bShare", "tab"], ["bMic", "mic"], ["bTest", "test"]]) $(id).setAttribute("aria-pressed", String(src === kind));
  const stage = S.scene === "jungle" ? (S.tarzan ? "bVines" : S.land === "open" ? "bBeach" : S.landN === 2 ? "bForest2" : "bForest")
    : S.scene === "river" ? (S.under ? "bWaterway" : "bRiver")
    : ({ climb: "bClimb", wall: "bWall", boatfall: "bBoatfall", cave: "bTunnel", cavern: "bCav", fountain: "bFountain", skyfall: "bSkyfall", pyramid: "bPyramid", camp: "bCamp" })[S.scene];
  for (const button of document.querySelectorAll(".stage-grid button")) button.classList.toggle("active", button.id === stage);
}
window.refreshAudioStatus = refreshAudioStatus;
function setPaused(value) {
  if (value === paused) return;
  if (value) { pauseStarted = performance.now() / 1000; paused = true; }
  else { pauseOffset += performance.now() / 1000 - pauseStarted; paused = false; last = gameTime(); }
  $("bStop").setAttribute("aria-pressed", String(paused));
  window.refreshPauseLabel(); refreshAudioStatus();
}
function frame(ms) {
  requestAnimationFrame(frame);
  if (paused) return;
  const now = ms / 1000 - pauseOffset, dt = Math.min(0.05, now - last); last = now;
  for (const step of [() => readAudio(now), () => update(now, dt), () => drawFrame(now)]) { try { step(); } catch (e) { frame.err = String(e && e.stack || e).split("\n").slice(0, 2).join(" | "); } }   // a step that throws must not stop the others (or the page looks frozen); the message goes on the debug line
  if (Math.floor(now * 4) !== frame.q) { frame.q = Math.floor(now * 4); $("dbg").textContent = (frame.err ? "ERROR " + frame.err + "  " : "") + `src=${A.src}  level=${M.level.toFixed(2)}  beat ${bt.locked ? 'LOCKED' : 'free'} T=${M.T.toFixed(2)}s conf=${bt.conf.toFixed(2)}  beats=${M.beatN}  obstacles=${S.obs.length}  palm=${S.trees.length ? 'on screen' : 'in ' + Math.max(0, S.nextTree - now).toFixed(0) + 's'}  tired=${S.tired.toFixed(2)}  day=${S.day}${S.camp && S.scene === "camp" ? "  camp b=" + S.camp.b.toFixed(1) : ""}`; refreshAudioStatus(); }
}
setScene("climb", performance.now() / 1000);   // the adventure starts aboard the passenger liner, then continues on the beach
requestAnimationFrame(frame);
$("bTest").onclick = startTest; $("bMic").onclick = () => startStream("mic"); $("bShare").onclick = () => startStream("tab"); $("bDisconnect").onclick = stopSource;
$("bStop").onclick = () => setPaused(!paused);
$("bFull").onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $("gameView").requestFullscreen(); } catch (e) { $("dbg").textContent = "fullscreen unavailable: " + (e.name || e); } };
const previewOrder = ["cliff", "beach", "forest2", "wall", "vines", "boatfall", "river", "forest", "tunnel", "treasury", "waterway", "fountain", "skyfall", "pyramid", "camp"];
let previewIndex = 0;
function previewStage(stage) {   // direct entry: reset the scene and its story-specific starting state
  setPaused(false);
  const now = gameTime(); S.scroll = 0; S.fade = 0; S.fadeDir = 0; S.map = null; S.next = null; S.noMap = false; S.pendingLab = false; S.pendingUnder = false; S.waterTransfer = false; S.tired = 0; S.quietT = 0; S.visualDark = 0;
  if (stage === "beach" || stage === "forest" || stage === "vines" || stage === "forest2") { S.landN = stage === "beach" ? 0 : stage === "forest" ? 2 : 1; setScene("jungle", now); if (stage === "vines") S.tarzan = { t: 0 }; }
  else if (stage === "tunnel") { S.pendingLab = true; setScene("cave", now); }
  else if (stage === "treasury") setScene("cavern", now);
  else if (stage === "waterway") { S.pendingUnder = true; setScene("river", now); }
  else if (stage === "fountain" || stage === "skyfall" || stage === "pyramid") setScene(stage, now);
  else if (stage === "river") { S.landN = 2; setScene("river", now); }
  else if (stage === "boatfall") { S.landN = 2; setScene("boatfall", now); }
  else if (stage === "cliff") setScene("climb", now);
  else setScene(stage, now);
  previewIndex = previewOrder.indexOf(stage);
}
$("bBeach").onclick = () => previewStage("beach");
$("bForest").onclick = () => previewStage("forest");
$("bVines").onclick = () => previewStage("vines");
$("bBoatfall").onclick = () => previewStage("boatfall");
$("bRiver").onclick = () => previewStage("river");
$("bForest2").onclick = () => previewStage("forest2");
$("bTunnel").onclick = () => previewStage("tunnel");
$("bCav").onclick = () => previewStage("treasury");
$("bWaterway").onclick = () => previewStage("waterway");
$("bFountain").onclick = () => previewStage("fountain");
$("bSkyfall").onclick = () => previewStage("skyfall");
$("bPyramid").onclick = () => previewStage("pyramid");
$("bClimb").onclick = () => previewStage("cliff");
$("bWall").onclick = () => previewStage("wall");
$("bCamp").onclick = () => previewStage("camp");
$("bScene").onclick = () => previewStage(previewOrder[(previewIndex + 1) % previewOrder.length]);
$("bDusk").onclick = () => { S.tired = 0.75; };
$("bCol").onclick = () => { S.col = { t: 0 }; };
$("bHole").onclick = () => { previewStage("forest"); S.rel.push({ wx: S.scroll + 120, taken: false, entrance: true, shift: 0 }); S.nextRelic = Infinity; };
let showDiag = false;
function toggleDiag() { showDiag = !showDiag; const b = $("bDiag"); if (b) b.setAttribute("aria-pressed", String(showDiag)); }
$("bDiag").onclick = toggleDiag;
addEventListener("keydown", e => {
  if (e.code === "KeyD" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) { toggleDiag(); return; }   // the numbers on or off, as with the d key on the Cardputer
  if (paused) return;
  const now = gameTime();
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault(); else return;
  S.manualUntil = now + 4;
  if (S.scene === "jungle" || S.scene === "cave") { if ((e.code === "Space" || e.code === "ArrowUp") && S.jump < 0) { S.jump = 0; S.jd = JD; S.jh = JH; } }
  else S.lane = Math.max(0, Math.min(2, S.lane + (e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0)));
});
