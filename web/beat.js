// Copyright (c) 2026 Kariage POMPADOUR Entertainment Corporation. MIT License.
/* A beat tracker for music of any kind (not just a loud kick).
   Every frame it is fed an "onset strength" (how much the spectrum just jumped, over several bands). That is stored at a fixed 50 Hz, and every 0.4 s
   - the tempo is found with an autocorrelation of the last 6 s (70..200 bpm, with a prior toward 120 so that it does not pick half or double time),
   - the phase is found by laying a comb of beats at that tempo over the last 6 s and sliding it to where the onsets pile up,
   - a clock (a phase-locked loop) is nudged toward that phase and fires a beat every period, so beats keep coming on time even when a kick is missing.
   When the music has no clear pulse the tracker says so (locked = false) and the caller falls back to plain onset detection. */
(function (root) {
  const DT = 0.02, N = 512, MINL = 15, MAXL = 50, WIN = 300;   // tick length, ring size, lags 0.30 .. 1.0 s, a 6 s window
  function BeatTracker() { this.reset(); }
  BeatTracker.prototype.reset = function () {
    this.buf = new Float32Array(N); this.cur = -1; this.count = 0; this.acc = 0; this.avg = 1; this.T = 0.5; this.conf = 0; this.locked = false;
    this.clk = 0; this.nextB = 0; this.lastFire = -9; this.lastAn = -9; this.cand = 0; this.candN = 0; this.jumpN = 0;
  };
  BeatTracker.prototype.get = function (i) { return this.buf[((i % N) + N) % N]; };
  BeatTracker.prototype.push = function (raw) {   // close one tick: store its onset strength relative to the running average
    this.cur++; this.avg += (raw - this.avg) * 0.02; this.buf[((this.cur % N) + N) % N] = raw / (this.avg + 1e-3); this.count = Math.min(N, this.count + 1);
  };
  // feed: call every frame with the time (s) and the onset strength; returns true when a beat falls on this frame
  BeatTracker.prototype.feed = function (now, oss) {
    const ci = Math.floor(now / DT);
    if (this.cur < 0) this.cur = ci - 1;
    if (ci - this.cur > 150) { const a = this.avg; this.reset(); this.avg = a; this.cur = ci - 1; }   // a long pause (a hidden tab): start again
    if (ci > this.cur + 1) { this.push(this.acc); this.acc = 0; while (this.cur < ci - 1) this.push(0); }   // ticks with no frame count as silence
    this.acc = Math.max(this.acc, oss);
    if (now - this.lastAn >= 0.4 && this.count >= 150) { this.lastAn = now; this.analyse(now); }
    if (!this.locked) return false;
    if (now >= this.nextB) {   // the clock rings: a beat, and the next one is set on the grid at least 0.3 T away
      this.lastFire = now; this.nextB = Math.max(this.clk + this.T * Math.ceil((now + 0.3 * this.T - this.clk) / this.T), now + 0.45 * this.T);
      return true;
    }
    return false;
  };
  BeatTracker.prototype.analyse = function (now) {
    const W = Math.min(WIN, this.count - 1), end = this.cur;   // the newest finished tick is `end`
    const x = new Float32Array(W); let m = 0;
    for (let k = 0; k < W; k++) { x[k] = this.get(end - k); m += x[k]; } m /= W;
    let v0 = 1e-6; for (let k = 0; k < W; k++) { x[k] -= m; v0 += x[k] * x[k]; } v0 /= W;
    const ac = new Float32Array(2 * MAXL + 2);
    for (let L = MINL; L <= 2 * MAXL; L++) { let s = 0; for (let k = 0; k + L < W; k++) s += x[k] * x[k + L]; ac[L] = s / (W - L) / v0; }
    const score = new Float32Array(MAXL + 2); let bL = -1, bS = -1e9;
    for (let L = MINL; L <= MAXL; L++) {
      const lg = Math.log2(L * DT / 0.5) / 0.8, prior = Math.exp(-0.5 * lg * lg);   // a prior toward 120 bpm (0.5 s)
      score[L] = (ac[L] + 0.5 * ac[2 * L]) * (0.4 + 0.6 * prior);
      if (score[L] > bS) { bS = score[L]; bL = L; }
    }
    let Lr = bL; if (bL > MINL && bL < MAXL) { const a = score[bL - 1], b = score[bL], c = score[bL + 1], d = a - 2 * b + c; if (d < 0) Lr = bL + 0.5 * (a - c) / d; }   // a parabola through the peak: finer than a tick
    this.conf = ac[bL];
    if (this.locked ? this.conf < 0.1 : this.conf < 0.2) { this.locked = false; return; }
    const Tn = Lr * DT;
    if (!this.locked) { this.T = Tn; this.locked = true; this.candN = 0; this.clk = NaN; }
    else if (Math.abs(Tn - this.T) / this.T < 0.06) { this.T += (Tn - this.T) * 0.35; this.candN = 0; }
    else { if (this.candN && Math.abs(Tn - this.cand) / this.cand < 0.06) this.candN++; else { this.cand = Tn; this.candN = 1; } if (this.candN >= 3) { this.T = Tn; this.candN = 0; this.clk = NaN; } }   // a new tempo has to be seen three times in a row
    // the phase: slide a comb of beats at this tempo over the window and keep the offset where the onsets pile up
    const T = this.T, steps = Math.round(T / DT); let bo = 0, bp = -1e9;
    for (let o = 0; o < steps; o++) { let s = 0; for (let t = o; t < W; t += T / DT) { const k = Math.round(t); s += (x[k - 1] || 0) + 2 * (x[k] || 0) + (x[k + 1] || 0); } if (s > bp) { bp = s; bo = o; } }
    const est = (end - bo) * DT + DT / 2;   // the time of the most recent beat in the data
    if (isNaN(this.clk)) { this.clk = est; this.nextB = this.clk + T * Math.ceil((now - this.clk) / T); this.jumpN = 0; return; }
    let err = ((est - this.clk) % T + T) % T; if (err > T / 2) err -= T;
    if (Math.abs(err) < 0.25 * T) { this.clk += err * 0.3; this.nextB += err * 0.3; this.jumpN = 0; }   // small disagreement: nudge the clock
    else if (++this.jumpN >= 3) { this.clk = est; this.jumpN = 0; this.nextB = Math.max(this.clk + T * Math.ceil((now + 0.3 * T - this.clk) / T), this.lastFire + 0.45 * T); }   // large and consistent: move the clock
  };
  root.BeatTracker = BeatTracker;
  if (typeof module !== "undefined") module.exports = BeatTracker;
})(typeof window !== "undefined" ? window : globalThis);
