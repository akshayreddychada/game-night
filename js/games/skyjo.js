import { esc, shuffle, randInt, sfx } from '../util.js';

export const meta = {
  id: 'skyjo', name: 'Skyjo', min: 2, max: 8, lowerWins: true,
  blurb: 'Flip, swap and clear columns. Lowest score wins.'
};

export function defaultSettings() { return { target: 100 }; }
export function settingsHtml(st, canEdit) {
  const opt = (v, label) => `<button type="button" class="seg-btn" data-set="target" data-val="${v}" aria-pressed="${st.target === v}" ${canEdit ? '' : 'disabled'}>${label}</button>`;
  return `<div class="setting"><span class="setting-label">Game ends at</span><div class="seg">${opt(50, '50 points (quick)')}${opt(100, '100 points')}</div></div>`;
}
export function applySetting(st, key, val) {
  if (key === 'target') st.target = val === '50' ? 50 : 100;
  return st;
}

/* ---------- rules ---------- */
function buildDeck() {
  const d = [];
  for (let i = 0; i < 5; i++) d.push(-2);
  for (let i = 0; i < 10; i++) d.push(-1);
  for (let i = 0; i < 15; i++) d.push(0);
  for (let v = 1; v <= 12; v++) for (let i = 0; i < 10; i++) d.push(v);
  return shuffle(d);
}
const N = s => s.names.length;

function deal(s) {
  const d = buildDeck();
  s.grids = s.names.map(() => { const g = []; for (let i = 0; i < 12; i++) g.push({ v: d.pop(), up: false }); return g; });
  s.discard = [d.pop()];
  s.deck = d;
  s.drawn = null; s.from = null;
  s.stage = 'setup';
  s.setupDone = s.names.map(() => 0);
  s.turn = -1;
  s.finisher = null;
  s.turnAt = Date.now();
  s.log = `Round ${s.round}. Everyone flips two cards.`;
  return s;
}
export function init(players, settings) {
  const s = { names: players.map(p => p.name), target: settings.target || 100, round: 1, totals: players.map(() => 0), rounds: [], over: false };
  return deal(s);
}
function reshuffleIfNeeded(s) {
  if (s.deck.length === 0) { const top = s.discard.pop(); s.deck = shuffle(s.discard); s.discard = [top]; }
}
function faceDown(g) { const r = []; g.forEach((c, i) => { if (!c.gone && !c.up) r.push(i); }); return r; }
function clearColumns(s, p) {
  const g = s.grids[p]; let cleared = 0;
  for (let c = 0; c < 4; c++) {
    const a = g[c], b = g[c + 4], d = g[c + 8];
    if (!a.gone && !b.gone && !d.gone && a.up && b.up && d.up && a.v === b.v && b.v === d.v) {
      s.discard.push(a.v, b.v, d.v);
      g[c] = { gone: true, v: 0, up: true }; g[c + 4] = { gone: true, v: 0, up: true }; g[c + 8] = { gone: true, v: 0, up: true };
      cleared++;
    }
  }
  return cleared;
}
function startPlay(s) {
  const sums = s.grids.map(g => g.reduce((a, c) => a + (c.up ? c.v : 0), 0));
  const first = (s.round - 1) % N(s);
  let best = first;
  for (let k = 1; k < N(s); k++) { const p = (first + k) % N(s); if (sums[p] > sums[best]) best = p; }
  s.turn = best; s.stage = 'draw'; s.turnAt = Date.now();
  s.log = `${s.names[best]} starts with the highest flip (${sums[best]}).`;
}
function endRound(s) {
  s.grids.forEach(g => g.forEach(c => { c.up = true; }));
  const raw = s.grids.map(g => g.reduce((a, c) => a + (c.gone ? 0 : c.v), 0));
  const fin = raw.slice(); const f = s.finisher; let doubled = false;
  if (f !== null && raw[f] > 0 && raw.some((r, i) => i !== f && r <= raw[f])) { fin[f] = raw[f] * 2; doubled = true; }
  s.totals = s.totals.map((t, i) => t + fin[i]);
  s.rounds.push({ raw, final: fin, finisher: f, doubled });
  s.drawn = null; s.from = null;
  s.over = s.totals.some(t => t >= s.target);
  s.stage = s.over ? 'over' : 'roundEnd';
  s.log = (f !== null ? `${s.names[f]} went out.` : 'Round over.') + (doubled ? ` ${s.names[f]} did not have the lowest score, so theirs is doubled.` : '');
  return s;
}
function endMove(s, p, note) {
  if (clearColumns(s, p)) note += ' A column of matching cards was cleared.';
  const all = s.grids[p].every(c => c.gone || c.up);
  if (all && s.finisher === null) { s.finisher = p; note += ` ${s.names[p]} is out. Everyone else gets one last turn.`; }
  s.log = note;
  const next = (p + 1) % N(s);
  if (s.finisher !== null && next === s.finisher) return endRound(s);
  s.turn = next; s.stage = 'draw'; s.turnAt = Date.now();
  return s;
}

export const A = {
  flipSetup(s, p, i) {
    if (s.stage !== 'setup' || p < 0) return null;
    const c = s.grids[p][i];
    if (!c || c.up || c.gone || s.setupDone[p] >= 2) return null;
    c.up = true; s.setupDone[p]++;
    s.log = `${s.names[p]} flipped a ${c.v}.`;
    if (s.setupDone.every(n => n >= 2)) startPlay(s);
    return s;
  },
  takeDeck(s, p) {
    if (s.stage !== 'draw' || s.turn !== p) return null;
    reshuffleIfNeeded(s);
    s.drawn = s.deck.pop(); s.from = 'deck'; s.stage = 'place';
    s.log = `${s.names[p]} drew from the deck.`;
    return s;
  },
  takeDiscard(s, p) {
    if (s.stage !== 'draw' || s.turn !== p || !s.discard.length) return null;
    s.drawn = s.discard.pop(); s.from = 'discard'; s.stage = 'place';
    s.log = `${s.names[p]} took the ${s.drawn} from the discard pile.`;
    return s;
  },
  place(s, p, i) {
    if (s.stage !== 'place' || s.turn !== p) return null;
    const c = s.grids[p][i];
    if (!c || c.gone) return null;
    const old = c.v, nv = s.drawn;
    s.discard.push(old);
    s.grids[p][i] = { v: nv, up: true };
    s.drawn = null; s.from = null;
    return endMove(s, p, `${s.names[p]} swapped a ${old} for a ${nv}.`);
  },
  discardDrawn(s, p) {
    if (s.stage !== 'place' || s.turn !== p || s.from !== 'deck') return null;
    const v = s.drawn;
    s.discard.push(v); s.drawn = null; s.from = null;
    if (faceDown(s.grids[p]).length === 0) return endMove(s, p, `${s.names[p]} discarded a ${v}.`);
    s.stage = 'flip';
    s.log = `${s.names[p]} discarded a ${v}.`;
    return s;
  },
  flip(s, p, i) {
    if (s.stage !== 'flip' || s.turn !== p) return null;
    const c = s.grids[p][i];
    if (!c || c.gone || c.up) return null;
    c.up = true;
    return endMove(s, p, `${s.log} Then flipped a ${c.v}.`);
  },
  nextRound(s) {
    if (s.stage !== 'roundEnd' || s.over) return null;
    s.round++;
    return deal(s);
  }
};

/* Idle players: anyone can let the app take a turn for them after a while. */
export const IDLE_MS = 90 * 1000;
export function idlePlayer(s) {
  if (s.stage === 'setup') { const i = s.setupDone.findIndex(n => n < 2); return i; }
  if (s.stage === 'draw' || s.stage === 'place' || s.stage === 'flip') return s.turn;
  return -1;
}
export function skip(s) {
  if (s.stage === 'setup') {
    s.setupDone.forEach((n, p) => {
      while (s.setupDone[p] < 2 && s.stage === 'setup') {
        const fd = faceDown(s.grids[p]);
        A.flipSetup(s, p, fd[randInt(fd.length)]);
      }
    });
    s.log = 'Cards were flipped for players who were away.';
    return s;
  }
  const p = s.turn, who = s.names[p];
  if (s.stage === 'draw') A.takeDeck(s, p);
  if (s.stage === 'place') {
    if (s.from === 'deck') A.discardDrawn(s, p);
    else {
      const g = s.grids[p]; let best = -1;
      g.forEach((c, i) => { if (!c.gone && (best < 0 || (c.up ? c.v : 13) > (g[best].up ? g[best].v : 13))) best = i; });
      return A.place(s, p, best) && note(s, who);
    }
  }
  if (s.stage === 'flip' && s.turn === p) {
    const fd = faceDown(s.grids[p]);
    A.flip(s, p, fd[randInt(fd.length)]);
  }
  return note(s, who);
}
function note(s, who) { s.log = `${who} was away, so their turn was played for them. ` + s.log; return s; }

export function results(s, players) {
  return players.map((p, i) => ({ uid: p.uid, name: p.name, score: s.totals[i] }));
}

/* ---------- view ---------- */
function band(v) { return v < 0 ? 'neg' : v === 0 ? 'zero' : v <= 4 ? 'low' : v <= 8 ? 'mid' : 'high'; }
function cardHtml(c, o = {}) {
  const cls = ['card'];
  let inner = '', label;
  if (c.gone) { cls.push('gone'); label = 'Cleared'; }
  else if (c.up) { cls.push(band(c.v)); inner = `<span class="corner">${c.v}</span><span>${c.v}</span>`; label = 'Card ' + c.v; }
  else { cls.push('back'); label = 'Face-down card'; }
  if (o.fresh) cls.push('fresh');
  if (o.act) {
    cls.push('target');
    return `<button type="button" class="${cls.join(' ')}" data-act="${o.act}"${o.i !== undefined ? ` data-i="${o.i}"` : ''} aria-label="${esc(o.aria || label)}">${inner}</button>`;
  }
  return `<div class="${cls.join(' ')}" role="img" aria-label="${label}">${inner}</div>`;
}
let prevState = null, prevRound = null;
function changed(p, i, s) {
  if (!prevState || prevRound !== s.round || !prevState.grids || !prevState.grids[p]) return false;
  const a = prevState.grids[p][i], b = s.grids[p][i];
  return !!a && (a.v !== b.v || a.up !== b.up || !!a.gone !== !!b.gone);
}
function targets(s, me, p, live) {
  const t = {};
  if (!live || p !== me) return t;
  const g = s.grids[p];
  for (let i = 0; i < 12; i++) {
    if (g[i].gone) continue;
    if (s.stage === 'setup' && s.setupDone[p] < 2 && !g[i].up) t[i] = 'flipSetup';
    else if (s.stage === 'place' && s.turn === p) t[i] = 'place';
    else if (s.stage === 'flip' && s.turn === p && !g[i].up) t[i] = 'flip';
  }
  return t;
}
function hand(s, me, p, cls, live) {
  const t = targets(s, me, p, live);
  let out = `<div class="hand ${cls}">`;
  for (let i = 0; i < 12; i++) {
    const act = t[i];
    out += cardHtml(s.grids[p][i], { fresh: changed(p, i, s), act, i, aria: act === 'place' ? 'Swap with this card' : (act ? 'Flip this card' : null) });
  }
  return out + '</div>';
}
const showing = (s, p) => s.grids[p].reduce((a, c) => a + (c.up && !c.gone ? c.v : 0), 0);

export function view(ctx) {
  const { state: s, me, busy } = ctx;
  const live = me >= 0 && !busy && s.stage !== 'over';
  const myTurn = live && s.turn === me;
  const top = s.discard[s.discard.length - 1];

  const chips = s.names.map((n, p) => `<div class="pchip${s.turn === p && (s.stage === 'draw' || s.stage === 'place' || s.stage === 'flip') ? ' turn' : ''}${s.finisher === p ? ' out' : ''}"><span class="nm">${esc(n)}${p === me ? ' (you)' : ''}</span><span class="tt">${s.totals[p]}</span></div>`).join('');

  const others = s.names.map((n, p) => p).filter(p => p !== me);
  const opp = others.map(p => `<div class="mini"><div class="who"><b>${esc(s.names[p])}</b><span>${s.stage === 'setup' ? (s.setupDone[p] >= 2 ? 'ready' : 'flipping') : 'showing ' + showing(s, p)}</span></div>${hand(s, me, p, 'opp', false)}</div>`).join('');

  const deckAct = myTurn && s.stage === 'draw' ? 'takeDeck' : null;
  const discAct = myTurn && s.stage === 'draw' ? 'takeDiscard' : (myTurn && s.stage === 'place' && s.from === 'deck' ? 'discardDrawn' : null);
  const deck = cardHtml({ up: false }, { act: deckAct, aria: 'Draw from the deck' });
  const disc = top === undefined ? '<div class="card empty">empty</div>' : cardHtml({ up: true, v: top }, { act: discAct, aria: discAct === 'takeDiscard' ? 'Take the top discard' : 'Discard the card you drew' });
  const drawn = s.drawn !== null && s.drawn !== undefined ? cardHtml({ up: true, v: s.drawn }) : '<div class="card empty">none</div>';
  const holder = s.stage === 'place' ? (s.turn === me ? 'In your hand' : esc(s.names[s.turn]) + ' holds') : 'In hand';
  const piles = `<div class="piles"><div class="slot">${deck}<span>Deck ${s.deck.length}</span></div><div class="slot">${disc}<span>Discard</span></div><div class="slot">${drawn}<span>${holder}</span></div></div>`;

  let big = '', mine = false;
  if (s.stage === 'setup') {
    if (me >= 0 && s.setupDone[me] < 2) { big = `Flip two of your cards (${2 - s.setupDone[me]} to go).`; mine = true; }
    else big = 'Waiting for everyone to flip two cards.';
  } else if (s.stage === 'draw' || s.stage === 'place' || s.stage === 'flip') {
    const n = esc(s.names[s.turn]);
    if (s.turn === me) {
      mine = true;
      big = s.stage === 'draw' ? 'Your turn. Draw from the deck or take the top discard.'
        : s.stage === 'place' ? (s.from === 'deck' ? 'Swap it with any card in your hand, or tap the discard pile to discard it and flip a card.' : 'Swap it with any card in your hand.')
        : 'Flip one of your face-down cards.';
    } else big = s.stage === 'draw' ? `${n} is drawing.` : s.stage === 'place' ? `${n} is placing a card.` : `${n} is flipping a card.`;
  }

  let middle;
  if (s.stage === 'roundEnd' || s.stage === 'over') {
    const r = s.rounds[s.rounds.length - 1];
    const rows = s.names.map((n, p) => `<tr><td>${esc(n)}${p === me ? ' (you)' : ''}</td><td>${r.raw[p]}</td><td>${r.final[p]}${r.doubled && r.finisher === p ? '<span class="tag">x2</span>' : ''}</td><td class="tot">${s.totals[p]}</td></tr>`).join('');
    middle = `<section class="panel"><h2>Round ${s.round} scores</h2><p class="muted">${esc(s.log)}</p>
      <table class="res"><thead><tr><th></th><th>Cards</th><th>Round</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      ${s.stage === 'roundEnd' ? (me >= 0 ? `<button type="button" class="btn" data-act="nextRound" ${busy ? 'disabled' : ''}>Deal round ${s.round + 1}</button><p class="muted small">Anyone at the table can deal. Game ends when someone reaches ${s.target}.</p>` : '') : ''}</section>`;
  } else {
    middle = `<div class="status${mine ? ' mine' : ''}"><span class="big">${big}</span><span class="log">${esc(s.log || '')}</span></div>`;
  }

  const meHand = me >= 0 ? `<div class="area"><div class="who"><b>You</b><span>showing ${showing(s, me)}</span></div>${hand(s, me, me, 'mine', live)}</div>` : '';
  const html = `<div class="skyjo"><div class="pchips">${chips}</div><div class="table-top"><div class="minis">${opp}</div>${piles}</div>${middle}${meHand}<p class="muted small center">Round ${s.round} · game ends at ${s.target}</p></div>`;
  prevState = JSON.parse(JSON.stringify(s)); prevRound = s.round;
  return html;
}

/* Map a tap to a pure action on the game state. */
export function actionFor(el) {
  const act = el.getAttribute('data-act'), i = parseInt(el.getAttribute('data-i'), 10);
  if (!(act in A)) return null;
  return (s, me) => A[act](s, me, i);
}

/* Sounds and turn alert for this device. */
export function onChange(prev, s, me) {
  if (!prev) return;
  if (prev.turn !== s.turn && s.turn === me && s.stage === 'draw') sfx.turn();
  else if ((prev.stage !== s.stage && (s.stage === 'roundEnd' || s.stage === 'over'))) sfx.ding();
}
