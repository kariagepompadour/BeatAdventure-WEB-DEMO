// Copyright (c) 2026 Kariage POMPADOUR Entertainment Corporation. MIT License.
// Run: node test/beat.test.js   (synthetic onset signals: does the tracker find the tempo and put its beats on the kicks?)
// Exit code 0 = all checks pass. Half or double of the true tempo counts as correct (a lock on every second kick still lands beats on kicks).
const BeatTracker = require("../web/beat.js");
let failed = 0;
function run(name, bpm, gen, secs, opts = {}) {
  const bt = new BeatTracker(), T = 60 / bpm, fps = opts.fps || 60, fires = [], kicks = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let f = 0, t = 0; t < secs; f++) {
    t += 1 / fps + (rnd() - 0.5) * 0.004;   // frame jitter
    const v = gen(t, T, rnd);
    if (bt.feed(t, v)) fires.push(t);
  }
  for (let t = 1; t < secs; t += T) kicks.push(t + (opts.off || 0));
  const late = fires.filter(t => t > secs - 15), errs = late.map(t => { let best = 1e9; for (const k of kicks) { const d = t - k; if (Math.abs(d) < Math.abs(best)) best = d; } return best; });
  const mean = errs.reduce((a, b) => a + b, 0) / (errs.length || 1), sd = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / (errs.length || 1));
  const ratio = bt.T / T, tempoOk = [0.5, 1, 2].some(r => Math.abs(ratio / r - 1) < 0.05);
  const problems = [];
  if (opts.expect === "none") { if (late.length) problems.push("fired beats on a signal with no usable pulse"); }
  else if (opts.expect === "fallback") { /* no lock is acceptable: the game falls back to plain onset detection */ }
  else {
    if (!bt.locked) problems.push("not locked");
    if (!tempoOk) problems.push("tempo " + bt.T.toFixed(3) + " is not 1/2, 1 or 2 x " + T.toFixed(3));
    if (late.length < 8) problems.push("too few beats in the last 15 s: " + late.length);
    if (Math.abs(mean) > (opts.maxOff || 0.05)) problems.push("mean offset " + (mean * 1000).toFixed(0) + " ms");
    if (sd > (opts.maxSd || 0.03)) problems.push("jitter sd " + (sd * 1000).toFixed(0) + " ms");
  }
  if (problems.length) failed++;
  console.log((problems.length ? "FAIL " : "ok   ") + name.padEnd(34), "locked", bt.locked, "T", bt.T.toFixed(3), "(true", T.toFixed(3) + ")", "beats/15s", late.length, "offset(ms)", (mean * 1000).toFixed(0), "sd(ms)", (sd * 1000).toFixed(0), problems.join("; "));
}
const kick = (t, T, off = 1) => { const ph = ((t - off) % T + T) % T; return ph < 0.04 ? 30 * (1 - ph / 0.04) : 0; };
run("steady kick 124 bpm", 124, (t, T, r) => kick(t, T) + r() * 2, 40);
run("kick + off-beat hats", 120, (t, T, r) => kick(t, T) + 0.5 * kick(t, T, 1 + T / 2) + r() * 3, 40);
run("kick 90 bpm", 90, (t, T, r) => kick(t, T) + r() * 2, 40);
run("kick 170 bpm (locks to half time)", 170, (t, T, r) => kick(t, T) + r() * 2, 40);
run("weak kick in loud noise 100 bpm", 100, (t, T, r) => kick(t, T) * 0.6 + r() * 8, 40);
run("every second kick missing 128", 128, (t, T, r) => (Math.floor((t - 1) / T) % 2 ? 0 : kick(t, T)) + r() * 2, 40);
run("snare on 2 and 4 only, 110", 110, (t, T, r) => (Math.floor((t - 1) / T) % 2 ? kick(t, T) : 0) + r() * 2, 40, { expect: "fallback" });
run("pure noise (no pulse)", 120, (t, T, r) => r() * 8, 40, { expect: "fallback" });
run("hidden-tab 10 fps, 120 bpm", 120, (t, T, r) => kick(t, T) + r() * 2, 40, { fps: 10, maxOff: 0.12, maxSd: 0.2 });
console.log(failed ? failed + " check(s) failed" : "all checks passed");
process.exit(failed ? 1 : 0);
