import { esc, shuffle, randInt, sfx } from '../util.js';
import { CATS } from './feud-data.js';

export const meta = {
  id: 'feud', name: 'Family Feud', min: 2, max: 8, lowerWins: false,
  blurb: 'Guess what 100 people said. Take turns, three strikes and you sit out the round.'
};

/* ---------- settings ---------- */
export function defaultSettings() { return { rounds: 5, cats: CATS.map(c => c.id) }; }
export function settingsHtml(st, canEdit) {
  const dis = canEdit ? '' : 'disabled';
  const r = v => `<button type="button" class="seg-btn" data-set="rounds" data-val="${v}" aria-pressed="${st.rounds === v}" ${dis}>${v}</button>`;
  const chips = CATS.map(c => `<button type="button" class="chip" data-set="cat" data-val="${c.id}" aria-pressed="${st.cats.includes(c.id)}" ${dis}>${c.icon} ${esc(c.name)}</button>`).join('');
  const n = CATS.filter(c => st.cats.includes(c.id)).reduce((a, c) => a + c.qs.length, 0);
  return `<div class="setting"><span class="setting-label">Rounds (the last one is double points)</span><div class="seg">${r(3)}${r(5)}${r(7)}</div></div>
    <div class="setting"><span class="setting-label">Topics · ${n} questions</span><div class="chips">${chips}</div>
    ${canEdit ? '<div class="row-links"><button type="button" class="link" data-set="allcats" data-val="1">Select all</button><button type="button" class="link" data-set="desi" data-val="1">Desi night</button><button type="button" class="link" data-set="popgossip" data-val="1">Pop and gossip</button></div>' : ''}</div>`;
}
export function applySetting(st, key, val) {
  if (key === 'rounds') st.rounds = parseInt(val, 10) || 5;
  else if (key === 'cat') {
    const has = st.cats.includes(val);
    if (has && st.cats.length > 1) st.cats = st.cats.filter(c => c !== val);
    else if (!has) st.cats = st.cats.concat(val);
  }
  else if (key === 'allcats') st.cats = CATS.map(c => c.id);
  else if (key === 'desi') st.cats = ['tollywood', 'desi', 'movies'];
  else if (key === 'popgossip') st.cats = ['pop', 'gossip', 'movies'];
  return st;
}

/* ---------- matching ---------- */
function strip(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function stem(w) {
  if (w.length > 3 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (w.length > 3 && /(ss|x|ch|sh|o)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
}
export function norm(s) { return strip(s).split(' ').filter(w => w && w !== 'the' && w !== 'a' && w !== 'an').map(stem).join(' '); }
function lev(a, b) {
  if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = []; for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
function strength(g, cands) {
  let best = 0;
  for (const c of cands) {
    if (!c) continue;
    if (g === c) return 3;
    if (c.length >= 4 && (' ' + g + ' ').indexOf(' ' + c + ' ') > -1) { best = Math.max(best, 2); continue; }
    if (g.length >= 5 && c.indexOf(' ') > -1 && (' ' + c + ' ').indexOf(' ' + g + ' ') > -1) { best = Math.max(best, 2); continue; }
    const maxd = c.length >= 9 ? 2 : (c.length >= 4 ? 1 : 0);
    if (maxd && Math.abs(c.length - g.length) <= maxd && lev(g, c) <= maxd) best = Math.max(best, 1);
  }
  return best;
}
const QCACHE = {};
export function question(qid) {
  if (QCACHE[qid]) return QCACHE[qid];
  const [cid, idx] = qid.split(':');
  const cat = CATS.find(c => c.id === cid);
  const raw = cat.qs[parseInt(idx, 10)];
  const q = { id: qid, cat, text: raw[0], answers: raw[1].map(a => ({ label: a[0], pts: a[1], cands: [norm(a[0])].concat((a[2] || '').split('|').filter(Boolean).map(norm)) })) };
  QCACHE[qid] = q;
  return q;
}
export function judge(q, open, raw) {
  const g = norm(raw); if (!g) return { t: 'empty' };
  let bu = -1, su = 0, br = -1, sr = 0;
  q.answers.forEach((a, i) => {
    const s = strength(g, a.cands); if (!s) return;
    if (open[i]) { if (s > sr) { sr = s; br = i; } } else if (s > su) { su = s; bu = i; }
  });
  if (br >= 0 && sr >= su) return { t: 'already', i: br };
  if (bu >= 0) return { t: 'hit', i: bu };
  return { t: 'miss' };
}

/* ---------- host lines ({p} = the player who just acted) ---------- */
const LINES = {
  turnStart: ["{p}, you're up first this round.", "{p} kicks us off. No pressure. A little pressure.", "Fresh board! {p}, show us what 100 strangers think."],
  hitTop: ["THE NUMBER ONE ANSWER! {p}, is that mind reading?", "Top of the board! {p} thinks exactly like 100 strangers.", "INDUSTRY HIT! Number one, {p}!"],
  hit: ["Survey says... yes! Nice one, {p}.", "On the board! Don't let it go to your head, {p}.", "That answer has Eras Tour energy.", "MASS! A proper mass answer, {p}.", "Blockbuster answer! First-day-first-show energy.", "{p}'s brain is wearing a tuxedo today.", "A real answer from a real human. I'm moved."],
  hitLow: ["Weird pick, but some stranger said it too, {p}!", "A tiny answer, but it counts.", "Barely made the board, but we'll take it."],
  already: ["That one's already up there, {p}! Eyes on the board.", "Copycat! That answer is already on the board."],
  strike1: ["Strike one, {p}! It's fine. Everyone's fine.", "X! Bold answer, {p}. Wrong, but bold.", "Flop show! Not even a song in Switzerland could save that one.", "Not one of our 100 people said that. Honestly impressive."],
  strike2: ["Strike two, {p}. One more and you sit this round out.", "Two X's for {p}. Tread carefully."],
  out: ["Three strikes! {p} is out for this round.", "That's three X's. {p} heads to the bench."],
  pass: ["{p} passes. Zero points, maximum honesty."],
  appeal: ["The judge, a rubber duck named Gerald, reviewed the tape. {p}'s strike is overturned!", "Appeal granted! The judge was bribed with snacks.", "The judge says, and I quote, \"eh, fine.\" Strike removed for {p}."],
  skip: ["{p} wandered off, so that's a strike. Snooze, lose."],
  roundEnd: ["Board's done! Let's see who cashed in.", "That's the round. Show me the damage."]
};
function setLine(s, t, p) { s.line = { t, i: randInt(LINES[t].length), p }; }
export function lineText(s) {
  if (!s.line) return '';
  const arr = LINES[s.line.t] || [''];
  return (arr[s.line.i] || arr[0]).replace(/\{p\}/g, s.line.p >= 0 ? s.names[s.line.p] : '');
}

/* ---------- rules ---------- */
const N = s => s.names.length;
export function init(players, settings) {
  const pool = [];
  CATS.forEach(c => { if (settings.cats.includes(c.id)) c.qs.forEach((q, i) => pool.push(c.id + ':' + i)); });
  const qids = shuffle(pool).slice(0, settings.rounds);
  const s = { names: players.map(p => p.name), rounds: qids.length, round: 1, qids, scores: players.map(() => 0), appeals: players.map(() => 1), over: false, seq: 0 };
  return startRound(s);
}
function startRound(s) {
  const q = question(s.qids[s.round - 1]);
  s.open = q.answers.map(() => false);
  s.missed = q.answers.map(() => false);
  s.strikes = s.names.map(() => 0);
  s.earned = s.names.map(() => 0);
  s.turn = (s.round - 1) % N(s);
  s.mult = s.round === s.rounds ? 2 : 1;
  s.stage = 'guess';
  s.lastStrike = -1;
  s.event = null;
  s.turnAt = Date.now();
  setLine(s, 'turnStart', s.turn);
  s.seq++;
  return s;
}
function advance(s, p) {
  for (let k = 1; k <= N(s); k++) { const q = (p + k) % N(s); if (s.strikes[q] < 3) { s.turn = q; s.turnAt = Date.now(); return; } }
}
function endRound(s) {
  s.open.forEach((o, i) => { if (!o) { s.open[i] = true; s.missed[i] = true; } });
  s.over = s.round >= s.rounds;
  s.stage = s.over ? 'over' : 'roundEnd';
  setLine(s, 'roundEnd', -1);
  return s;
}
function strike(s, p, kind) {
  s.strikes[p]++;
  s.lastStrike = p;
  s.event = { type: 'strike', p, n: s.strikes[p], seq: ++s.seq };
  setLine(s, kind || (s.strikes[p] >= 3 ? 'out' : s.strikes[p] === 2 ? 'strike2' : 'strike1'), p);
  if (s.strikes.every(n => n >= 3)) return endRound(s);
  advance(s, p);
  return s;
}
export const A = {
  guess(s, p, text) {
    if (s.stage !== 'guess' || s.turn !== p) return null;
    const q = question(s.qids[s.round - 1]);
    const r = judge(q, s.open, text);
    if (r.t === 'empty') return null;
    s.lastStrike = -1;
    if (r.t === 'already') { setLine(s, 'already', p); s.event = { type: 'already', p, seq: ++s.seq }; return s; }
    if (r.t === 'hit') {
      const a = q.answers[r.i];
      s.open[r.i] = true;
      const pts = a.pts * s.mult;
      s.scores[p] += pts; s.earned[p] += pts;
      s.event = { type: 'hit', p, i: r.i, pts, seq: ++s.seq };
      setLine(s, r.i === 0 ? 'hitTop' : (a.pts < 8 ? 'hitLow' : 'hit'), p);
      if (s.open.every(Boolean)) return endRound(s);
      advance(s, p);
      return s;
    }
    s.event = null;
    return strike(s, p);
  },
  pass(s, p) {
    if (s.stage !== 'guess' || s.turn !== p) return null;
    s.lastStrike = -1;
    const r = strike(s, p);
    if (s.stage === 'guess' && s.strikes[p] < 3) setLine(s, 'pass', p);
    return r;
  },
  appeal(s, p) {
    if (s.stage !== 'guess' || s.lastStrike !== p || s.appeals[p] <= 0 || s.strikes[p] <= 0) return null;
    s.appeals[p]--; s.strikes[p]--; s.turn = p; s.turnAt = Date.now(); s.lastStrike = -1;
    s.event = { type: 'appeal', p, seq: ++s.seq };
    setLine(s, 'appeal', p);
    return s;
  },
  nextRound(s) {
    if (s.stage !== 'roundEnd') return null;
    s.round++;
    return startRound(s);
  }
};
export const IDLE_MS = 90 * 1000;
export function idlePlayer(s) { return s.stage === 'guess' ? s.turn : -1; }
export function skip(s) {
  const p = s.turn;
  s.lastStrike = -1;
  return strike(s, p, 'skip');
}
export function results(s, players) {
  return players.map((p, i) => ({ uid: p.uid, name: p.name, score: s.scores[i] }));
}

/* ---------- view ---------- */
export function view(ctx) {
  const { state: s, me, busy } = ctx;
  const q = question(s.qids[s.round - 1]);
  const chips = s.names.map((n, p) => {
    const pips = [0, 1, 2].map(j => `<span class="pip${j < s.strikes[p] ? ' on' : ''}"></span>`).join('');
    return `<div class="fchip${s.stage === 'guess' && s.turn === p ? ' turn' : ''}${s.strikes[p] >= 3 ? ' benched' : ''}"><span class="nm">${esc(n)}${p === me ? ' (you)' : ''}</span><span class="sc">${s.scores[p]}</span><span class="pips" aria-label="${s.strikes[p]} strikes">${pips}</span></div>`;
  }).join('');

  const rows = Math.ceil(q.answers.length / 2);
  const tiles = q.answers.map((a, i) => {
    const open = s.open[i];
    const fresh = s.event && s.event.type === 'hit' && s.event.i === i ? ' fresh' : '';
    if (!open) return `<div class="tile"><span class="num">${i + 1}</span></div>`;
    return `<div class="tile open${s.missed[i] ? ' missed' : ''}${fresh}"><span class="ans">${esc(a.label)}</span><span class="pts">${a.pts}</span></div>`;
  }).join('');

  const myTurn = me >= 0 && s.stage === 'guess' && s.turn === me && !busy;
  const canAppeal = me >= 0 && s.stage === 'guess' && s.lastStrike === me && s.appeals[me] > 0 && !busy;
  let controls = '';
  if (s.stage === 'guess') {
    if (me >= 0 && s.strikes[me] >= 3) controls = `<p class="turnline">You're out for this round. ${esc(s.names[s.turn])} is guessing.</p>`;
    else if (myTurn) controls = `<p class="turnline mine">Your turn, ${esc(s.names[me])}. ${3 - s.strikes[me]} strike${3 - s.strikes[me] === 1 ? '' : 's'} left.</p>
      <form class="guessrow" data-form="guess"><input id="guess" type="text" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="send" placeholder="Type your answer" aria-label="Your answer"><button type="submit" class="btn">Lock it in</button></form>
      <div class="row-links"><button type="button" class="link" data-act="pass">Pass and take a strike</button></div>`;
    else controls = `<p class="turnline">${esc(s.names[s.turn])} is guessing…</p>`;
    if (canAppeal) controls += `<button type="button" class="btn ghost hot" data-act="appeal">Appeal that strike (${s.appeals[me]} left)</button>`;
  } else if (s.stage === 'roundEnd') {
    const earned = s.names.map((n, p) => `${esc(n)} +${s.earned[p]}`).join(' · ');
    controls = `<p class="turnline">Round ${s.round} done. ${earned}</p>${me >= 0 ? `<button type="button" class="btn" data-act="nextRound" ${busy ? 'disabled' : ''}>Next question</button>` : ''}`;
  }

  return `<div class="feud">
    <div class="fchips">${chips}</div>
    <div class="roundinfo"><span class="tag2">Round ${s.round} of ${s.rounds}</span><span class="tag2 alt">${q.cat.icon} ${esc(q.cat.name)}</span>${s.mult > 1 ? '<span class="tag2 hot">Double points</span>' : ''}</div>
    <div class="boardwrap"><p class="ask">${esc(q.cat.ask)}:</p><h2 class="question">${esc(q.text)}</h2>
      <div class="fboard" style="--rows:${rows}">${tiles}</div></div>
    <div class="host"><div class="avatar" aria-hidden="true">🎤</div><div class="bubble" role="status"><span class="hostname">Chip Dazzle, your host</span>${esc(lineText(s))}</div></div>
    <div class="fcontrols">${controls}</div>
  </div>`;
}
export function actionFor(el, root) {
  const act = el.getAttribute('data-act');
  if (act === 'guess') {
    const inp = root.querySelector('#guess');
    const text = inp ? inp.value : '';
    if (!text.trim()) return null;
    if (inp) inp.value = '';
    return (s, me) => A.guess(s, me, text);
  }
  if (act === 'pass') return (s, me) => A.pass(s, me);
  if (act === 'appeal') return (s, me) => A.appeal(s, me);
  if (act === 'nextRound') return s => A.nextRound(s);
  return null;
}
export function onChange(prev, s, me) {
  if (!prev || !s.event || (prev.event && prev.event.seq === s.event.seq)) {
    if (prev && prev.turn !== s.turn && s.turn === me && s.stage === 'guess') sfx.turn();
    return;
  }
  if (s.event.type === 'hit') (s.event.i === 0 ? sfx.top : sfx.ding)();
  else if (s.event.type === 'strike') { sfx.buzz(); showX(s.event.n); }
  else if (s.event.type === 'appeal') sfx.ding();
  if (s.turn === me && s.stage === 'guess' && s.event.p !== me) setTimeout(sfx.turn, 500);
}
function showX(n) {
  let o = document.getElementById('xo');
  if (!o) { o = document.createElement('div'); o.id = 'xo'; o.className = 'xo'; o.setAttribute('aria-hidden', 'true'); document.body.appendChild(o); }
  o.innerHTML = '<div class="xb"></div>'.repeat(Math.max(1, Math.min(3, n)));
  o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
  clearTimeout(showX.t); showX.t = setTimeout(() => o.classList.remove('show'), 1000);
}
