export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function clone(o) { return JSON.parse(JSON.stringify(o)); }
export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function randInt(n) { return Math.floor(Math.random() * n); }
export function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }

const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function roomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ROOM_LETTERS[randInt(ROOM_LETTERS.length)];
  return s;
}
export function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
export function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 20); }

export function timeAgo(ms) {
  const d = Math.max(0, Date.now() - ms) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + ' min ago';
  if (d < 86400) return Math.floor(d / 3600) + ' h ago';
  const days = Math.floor(d / 86400);
  if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Ranks: equal scores share a rank. lowerWins for golf-style games. */
export function rankPlayers(players, scores, lowerWins) {
  const rows = players.map((p, i) => ({ uid: p.uid, name: p.name, score: scores[i] }));
  rows.sort((a, b) => lowerWins ? a.score - b.score : b.score - a.score);
  let rank = 0, last = null;
  rows.forEach((r, i) => { if (last === null || r.score !== last) { rank = i + 1; last = r.score; } r.rank = rank; });
  return rows;
}

/* Tiny sound kit; only plays after a tap has unlocked audio. */
let actx = null;
export function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
}
function tone(f, t0, dur, type, vol) {
  if (!actx || lsGet('gn-sound') === 'off') return;
  try {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + t0;
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* ignore */ }
}
export const sfx = {
  ding() { tone(880, 0, 0.25, 'sine'); tone(1318, 0.12, 0.45, 'sine'); },
  top() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.35, 'triangle', 0.16)); },
  buzz() { tone(120, 0, 0.6, 'sawtooth', 0.18); tone(95, 0, 0.6, 'square', 0.08); },
  tick() { tone(1200, 0, 0.05, 'square', 0.03); },
  turn() { tone(660, 0, 0.12, 'triangle', 0.12); tone(990, 0.1, 0.18, 'triangle', 0.12); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.38, 'triangle', 0.16)); }
};
