import { esc, clone, lsGet, lsSet, roomCode, cleanCode, cleanName, timeAgo, rankPlayers, unlockAudio, sfx } from './util.js';
import { createBackend } from './backend.js';
import * as skyjo from './games/skyjo.js';
import * as feud from './games/feud.js';

const GAMES = { skyjo, feud };
const app = document.getElementById('app');

let backend = null, uid = null, member = null, fatal = '';
let route = { name: 'home' };
let room = null, roomState = null, roomLoaded = false, roomUnsub = null, roomIdWatching = null;
let openRooms = [], openUnsub = null;
let history = null, historyErr = '';
let busy = false, toastMsg = '', toastTimer = null, joinErr = '', renaming = false, armed = '';

/* ---------- rendering with input preservation ---------- */
function paint(html) {
  const active = document.activeElement;
  const aid = active && active.id && app.contains(active) ? active.id : null;
  let sel = null;
  if (aid && typeof active.selectionStart === 'number') sel = [active.selectionStart, active.selectionEnd];
  const vals = {};
  app.querySelectorAll('input[id]').forEach(i => { vals[i.id] = i.value; });
  app.innerHTML = html;
  Object.keys(vals).forEach(id => { const el = document.getElementById(id); if (el && el.tagName === 'INPUT') el.value = vals[id]; });
  if (aid) {
    const el = document.getElementById(aid);
    if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text input */ } } }
  }
}
function toast(msg) {
  toastMsg = msg; render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg = ''; render(); }, 3500);
}
const wordmark = '<span class="wordmark">Game<span>Night</span></span>';
function topbar(extra) {
  return `<header class="topbar"><a class="home-link" href="#/" aria-label="Home">${wordmark}</a>${extra || ''}</header>`;
}

function render() {
  let html = '';
  if (fatal) html = topbar() + `<section class="panel"><h2>Can't open Game Night</h2><p>${esc(fatal)}</p></section>`;
  else if (!backend) html = topbar() + '<section class="panel"><p>Loading…</p></section>';
  else if (!member) html = onboardView();
  else if (route.name === 'room') html = roomView();
  else if (route.name === 'history') html = historyView();
  else html = homeView();
  if (toastMsg) html += `<div class="toast" role="alert">${esc(toastMsg)}</div>`;
  paint(html);
}

/* ---------- onboarding ---------- */
function onboardView() {
  return `<section class="hero">${wordmark}<p class="lede">Skyjo and Family Feud for your group. Everyone plays on their own phone, and every score is saved.</p></section>
  <form class="panel" data-form="onboard">
    <h2>Join your group</h2>
    <div class="field"><label for="ob-name">Your name</label><input id="ob-name" maxlength="20" autocomplete="nickname" placeholder="What friends call you"></div>
    <div class="field"><label for="ob-code">Invite code</label><input id="ob-code" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="From your group chat"></div>
    ${joinErr ? `<p class="err" role="alert">${esc(joinErr)}</p>` : ''}
    <button type="submit" class="btn big" ${busy ? 'disabled' : ''}>Join</button>
    <p class="muted small">You only do this once on each phone or browser.</p>
  </form>`;
}
async function doOnboard() {
  const name = cleanName(document.getElementById('ob-name').value);
  const code = String(document.getElementById('ob-code').value || '').trim();
  if (!name) { joinErr = 'Enter your name.'; render(); return; }
  if (!code) { joinErr = 'Enter the invite code from your group.'; render(); return; }
  busy = true; joinErr = ''; render();
  try {
    await backend.join(name, code);
    member = { name };
    lsSet('gn-name', name);
    onRoute();
  } catch (e) {
    joinErr = e && e.code === 'bad_code' ? "That invite code didn't work. Check it with whoever shared the app." : 'Could not join right now. Check your connection and try again.';
  } finally { busy = false; render(); }
}

/* ---------- home ---------- */
function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function homeView() {
  const tiles = Object.values(GAMES).map(G => `<button type="button" class="gametile ${G.meta.id}" data-act="new" data-game="${G.meta.id}" ${busy ? 'disabled' : ''}>
      <span class="gt-name">${G.meta.name}</span><span class="gt-blurb">${esc(G.meta.blurb)}</span><span class="gt-meta">${G.meta.min}–${G.meta.max} players · Start a table</span></button>`).join('');
  const live = openRooms.filter(r => r.players && r.players.length && r.status !== 'closed');
  const liveHtml = live.length ? live.map(r => {
    const G = GAMES[r.game]; const inIt = r.players.some(p => p.uid === uid);
    const status = r.status === 'lobby' ? 'Waiting to start' : r.status === 'playing' ? 'Playing' : 'Finished';
    const label = inIt ? 'Open' : r.status === 'lobby' ? 'Join' : 'Watch';
    return `<a class="liverow" href="#/room/${esc(r.id)}"><span class="lr-game ${esc(r.game)}">${G ? G.meta.name : esc(r.game)}</span>
      <span class="lr-main"><b>${esc(r.players.map(p => p.name).join(', '))}</b><span class="muted small">${status} · code ${esc(r.id)} · ${timeAgo(r.updatedAt)}</span></span><span class="lr-go">${label}</span></a>`;
  }).join('') : '<p class="muted">No tables right now. Start one above and your friends will see it here.</p>';
  const nameRow = renaming
    ? `<form class="inline" data-form="rename"><input id="rn-name" maxlength="20" value="${esc(member.name)}" aria-label="Your name"><button class="btn small" type="submit">Save</button><button type="button" class="link" data-act="rename-cancel">Cancel</button></form>`
    : `<span class="hello">Hi, ${esc(member.name)}</span><button type="button" class="link" data-act="rename">Change name</button>`;
  const install = isStandalone() ? '' : `<details class="panel quiet"><summary>Put Game Night on your home screen</summary>
    <p><b>iPhone:</b> open this page in Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>
    <p><b>Android:</b> in Chrome, tap the ⋮ menu, then <b>Install app</b> or <b>Add to Home screen</b>.</p></details>`;
  return topbar(`<div class="me">${nameRow}</div>`) + `
  <section class="section"><h2 class="h">Start a table</h2><div class="tiles">${tiles}</div></section>
  <section class="section"><h2 class="h">Join with a code</h2>
    <form class="inline" data-form="joincode"><input id="jc-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" aria-label="Table code" class="code-input"><button class="btn" type="submit">Go</button></form></section>
  <section class="section"><h2 class="h">Live tables</h2><div class="live">${liveHtml}</div></section>
  <section class="section"><a class="btn ghost wide" href="#/history">Leaderboard and past games</a></section>
  ${install}
  <p class="muted small center"><button type="button" class="link" data-act="sound">${lsGet('gn-sound') === 'off' ? 'Sound is off. Turn on' : 'Sound is on. Turn off'}</button></p>`;
}
async function newRoom(game) {
  const G = GAMES[game]; if (!G || busy) return;
  busy = true; render();
  try {
    for (let tries = 0; tries < 6; tries++) {
      const id = roomCode(), now = Date.now();
      const data = { id, game, status: 'lobby', host: uid, players: [{ uid, name: member.name }], settings: G.defaultSettings(), state: '', gameNo: 0, createdAt: now, updatedAt: now, rev: 1 };
      if (await backend.createRoom(id, data)) { location.hash = '#/room/' + id; return; }
    }
    toast('Could not create a table. Try again.');
  } catch (e) { toast('Could not create a table. Check your connection.'); }
  finally { busy = false; render(); }
}

/* ---------- room ---------- */
function myIndex(r) { return r && r.players ? r.players.findIndex(p => p.uid === uid) : -1; }
function roomView() {
  const id = route.id;
  if (!roomLoaded) return topbar() + '<section class="panel"><p>Opening table…</p></section>';
  if (!room) return topbar() + `<section class="panel"><h2>No table called ${esc(id)}</h2><p>Check the code, or start a new table.</p><a class="btn" href="#/">Back home</a></section>`;
  const G = GAMES[room.game];
  const me = myIndex(room);
  const head = topbar(`<div class="roomhead"><span class="rh-game">${G.meta.name}</span><button type="button" class="codebtn" data-act="share" aria-label="Share table code ${esc(room.id)}">${esc(room.id)}<span>Share</span></button></div>`);

  if (room.status === 'lobby') {
    const isHost = room.host === uid;
    const players = room.players.map(p => `<li><span>${esc(p.name)}${p.uid === uid ? ' (you)' : ''}</span>${p.uid === room.host ? '<span class="badge">host</span>' : ''}</li>`).join('');
    const full = room.players.length >= G.meta.max;
    let actions = '';
    if (me < 0) actions = full ? '<p class="muted">This table is full.</p>' : `<button type="button" class="btn big" data-act="join-room" ${busy ? 'disabled' : ''}>Join this table</button>`;
    else if (isHost) actions = room.players.length >= G.meta.min
      ? `<button type="button" class="btn big" data-act="start" ${busy ? 'disabled' : ''}>Start ${G.meta.name}</button>`
      : `<p class="muted">Waiting for at least ${G.meta.min} players. Share the code <b>${esc(room.id)}</b>.</p>`;
    else actions = `<p class="muted">Waiting for ${esc((room.players.find(p => p.uid === room.host) || {}).name || 'the host')} to start.</p>`;
    return head + `<section class="panel lobby">
      <h2>Table ${esc(room.id)}</h2>
      <p class="muted">Friends join from Live tables on their home screen, or by typing <b>${esc(room.id)}</b>.</p>
      <ul class="plist">${players}</ul>
      ${G.settingsHtml(room.settings, isHost && !busy)}
      ${actions}
      ${me >= 0 ? `<button type="button" class="link" data-act="leave-room">Leave table</button>` : ''}
    </section>`;
  }

  const s = roomState;
  if (!s) return head + '<section class="panel"><p>Loading game…</p></section>';
  let top = '';
  if (room.status === 'over') {
    const rows = rankPlayers(room.players, G.results(s, room.players).map(r => r.score), G.meta.lowerWins);
    const winners = rows.filter(r => r.rank === 1).map(r => esc(r.name));
    top = `<section class="panel results"><h2>${winners.length > 1 ? 'Tie: ' + winners.join(' and ') : winners[0] + ' wins!'}</h2>
      <ol class="ranks">${rows.map(r => `<li><span class="rk">${r.rank}</span><span class="rn">${esc(r.name)}${r.uid === uid ? ' (you)' : ''}</span><span class="rs">${r.score}</span></li>`).join('')}</ol>
      <p class="muted small">${G.meta.lowerWins ? 'Lowest total wins.' : 'Highest score wins.'} Saved to your group's history.</p>
      ${me >= 0 ? `<div class="btnrow"><button type="button" class="btn" data-act="play-again" ${busy ? 'disabled' : ''}>Play again</button><button type="button" class="btn ghost" data-act="to-lobby" ${busy ? 'disabled' : ''}>Change players or settings</button></div>` : ''}
    </section>`;
  }
  let idle = '';
  if (room.status === 'playing' && me >= 0 && G.idlePlayer) {
    const p = G.idlePlayer(s);
    if (p >= 0 && p !== me && s.turnAt && Date.now() - s.turnAt > G.IDLE_MS) {
      const label = room.game === 'feud' ? `${esc(s.names[p])} seems away. Give them a strike and move on` : (s.stage === 'setup' ? 'Some players seem away. Flip their cards for them' : `${esc(s.names[p])} seems away. Play their turn for them`);
      idle = `<button type="button" class="btn ghost wide" data-act="skip" ${busy ? 'disabled' : ''}>${label}</button>`;
    }
  }
  const spectator = me < 0 ? '<p class="muted center">You are watching. Only players at the table can move.</p>' : '';
  const quit = me >= 0 && room.status === 'playing'
    ? `<p class="center"><button type="button" class="link" data-act="end-game">${armed === 'end-game' ? 'Tap again to end this game without saving' : 'End this game'}</button></p>` : '';
  return head + top + spectator + `<div class="game-root">${G.view({ state: s, me, busy, room })}</div>` + idle + quit;
}

function decode(r) {
  if (!r || !r.state) return null;
  try { return JSON.parse(r.state); } catch (e) { return null; }
}
function watchRoom(id) {
  if (roomIdWatching === id) return;
  stopRoom();
  roomIdWatching = id; roomLoaded = false; room = null; roomState = null;
  roomUnsub = backend.watchRoom(id, r => {
    const prevRoom = room, prevState = roomState;
    room = r; roomState = decode(r); roomLoaded = true;
    if (r && prevRoom && prevState && roomState && prevRoom.gameNo === r.gameNo && r.status !== 'lobby') {
      try { GAMES[r.game].onChange(prevState, roomState, myIndex(r)); } catch (e) { /* sound is optional */ }
    }
    if (r && prevRoom && prevRoom.status === 'playing' && r.status === 'over') sfx.win();
    render();
  }, () => { roomLoaded = true; room = null; toast('Lost the connection to this table. Reload to try again.'); });
}
function stopRoom() { if (roomUnsub) roomUnsub(); roomUnsub = null; roomIdWatching = null; room = null; roomState = null; }

async function roomTx(fn) {
  if (busy || !route.id) return;
  busy = true; render();
  try { await backend.txRoom(route.id, cur => fn(cur)); }
  catch (e) { toast('That did not save. Try again.'); }
  finally { busy = false; render(); }
}
function bump(r) { r.updatedAt = Date.now(); r.rev = (r.rev || 0) + 1; return r; }
function newGameState(r) {
  const G = GAMES[r.game];
  return JSON.stringify(G.init(r.players, r.settings));
}
function historyFor(r, s) {
  const G = GAMES[r.game];
  const rows = rankPlayers(r.players, G.results(s, r.players).map(x => x.score), G.meta.lowerWins);
  return { id: `${r.id}-${r.createdAt}-${r.gameNo}`, data: { game: r.game, room: r.id, endedAt: Date.now(), players: rows, winners: rows.filter(x => x.rank === 1).map(x => x.name), rounds: s.round || 0 } };
}
function act(gameFn) {
  const gameNo = room && room.gameNo;
  return roomTx(cur => {
    if (!cur || cur.status !== 'playing' || cur.gameNo !== gameNo) return null;
    const me = myIndex(cur);
    if (me < 0) return null;
    const s = decode(cur); if (!s) return null;
    const ns = gameFn(s, me, cur);
    if (!ns) return null;
    const out = bump(clone(cur));
    out.state = JSON.stringify(ns);
    let history = null;
    if (ns.over) { out.status = 'over'; history = historyFor(out, ns); }
    return { room: out, history };
  });
}
const roomActions = {
  'join-room': () => roomTx(cur => {
    if (!cur || cur.status !== 'lobby' || myIndex(cur) >= 0 || cur.players.length >= GAMES[cur.game].meta.max) return null;
    const out = bump(clone(cur)); out.players.push({ uid, name: member.name }); return { room: out };
  }),
  'leave-room': () => roomTx(cur => {
    if (!cur || cur.status !== 'lobby' || myIndex(cur) < 0) return null;
    const out = bump(clone(cur)); out.players = out.players.filter(p => p.uid !== uid);
    if (out.host === uid) out.host = out.players.length ? out.players[0].uid : '';
    return { room: out };
  }).then(() => { location.hash = '#/'; }),
  'start': () => roomTx(cur => {
    if (!cur || cur.status !== 'lobby' || cur.host !== uid || cur.players.length < GAMES[cur.game].meta.min) return null;
    const out = bump(clone(cur)); out.state = newGameState(out); out.status = 'playing'; out.gameNo = (out.gameNo || 0) + 1; return { room: out };
  }),
  'play-again': () => roomTx(cur => {
    if (!cur || cur.status !== 'over' || myIndex(cur) < 0) return null;
    const out = bump(clone(cur)); out.state = newGameState(out); out.status = 'playing'; out.gameNo = (out.gameNo || 0) + 1; return { room: out };
  }),
  'to-lobby': () => roomTx(cur => {
    if (!cur || cur.status !== 'over' || myIndex(cur) < 0) return null;
    const out = bump(clone(cur)); out.status = 'lobby'; out.state = '';
    if (!out.players.some(p => p.uid === out.host)) out.host = out.players[0].uid;
    return { room: out };
  }),
  'skip': () => act((s, me, cur) => {
    const G = GAMES[cur.game]; const p = G.idlePlayer(s);
    if (p < 0 || p === me || !s.turnAt || Date.now() - s.turnAt < G.IDLE_MS) return null;
    return G.skip(s);
  }),
  'end-game': () => {
    if (armed !== 'end-game') { armed = 'end-game'; render(); setTimeout(() => { if (armed === 'end-game') { armed = ''; render(); } }, 3500); return; }
    armed = '';
    roomTx(cur => {
      if (!cur || cur.status !== 'playing' || myIndex(cur) < 0) return null;
      const out = bump(clone(cur)); out.status = 'lobby'; out.state = ''; return { room: out };
    });
  },
  'share': async () => {
    const url = location.origin + location.pathname + '#/room/' + room.id;
    const text = `Join my ${GAMES[room.game].meta.name} table on Game Night. Code ${room.id}`;
    try { if (navigator.share) { await navigator.share({ title: 'Game Night', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link copied. Paste it in your group chat.'); }
    catch (e) { toast('Table code: ' + room.id); }
  }
};
function setSetting(key, val) {
  roomTx(cur => {
    if (!cur || cur.status !== 'lobby' || cur.host !== uid) return null;
    const out = bump(clone(cur)); out.settings = GAMES[cur.game].applySetting(out.settings, key, val); return { room: out };
  });
}

/* ---------- history ---------- */
function historyView() {
  const head = topbar('<a class="link" href="#/">Back home</a>');
  if (historyErr) return head + `<section class="panel"><p>${esc(historyErr)}</p></section>`;
  if (!history) return head + '<section class="panel"><p>Loading scores…</p></section>';
  if (!history.length) return head + '<section class="panel"><h2>No games yet</h2><p>Finished games show up here with everyone\'s scores.</p></section>';
  const boards = Object.values(GAMES).map(G => {
    const games = history.filter(g => g.game === G.meta.id);
    if (!games.length) return '';
    const by = {};
    games.forEach(g => g.players.forEach(p => {
      const k = p.name.trim().toLowerCase();
      const r = by[k] || (by[k] = { name: p.name, played: 0, wins: 0, best: null, total: 0 });
      r.played++; r.total += p.score; if (p.rank === 1) r.wins++;
      if (r.best === null || (G.meta.lowerWins ? p.score < r.best : p.score > r.best)) r.best = p.score;
    }));
    const rows = Object.values(by).sort((a, b) => b.wins - a.wins || (b.wins / b.played) - (a.wins / a.played) || b.played - a.played);
    return `<section class="panel"><h2>${G.meta.name}</h2><div class="tablewrap"><table class="lb"><thead><tr><th>Player</th><th>Wins</th><th>Played</th><th>Win rate</th><th>${G.meta.lowerWins ? 'Best (low)' : 'Best'}</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num strong">${r.wins}</td><td class="num">${r.played}</td><td class="num">${Math.round(100 * r.wins / r.played)}%</td><td class="num">${r.best}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  }).join('');
  const recent = history.slice(0, 40).map(g => {
    const G = GAMES[g.game];
    return `<li><span class="lr-game ${esc(g.game)}">${G ? G.meta.name : esc(g.game)}</span><span class="rg-main">${g.players.map(p => `${p.rank}. ${esc(p.name)} <span class="muted">${p.score}</span>`).join(' · ')}</span><span class="muted small">${timeAgo(g.endedAt)}</span></li>`;
  }).join('');
  return head + `<h1 class="pagetitle">Leaderboard</h1>${boards}<section class="panel"><h2>Recent games</h2><ul class="recent">${recent}</ul></section>`;
}
async function loadHistory() {
  history = null; historyErr = ''; render();
  try { history = await backend.listGames(300); }
  catch (e) { historyErr = 'Could not load scores. Check your connection and try again.'; }
  render();
}

/* ---------- routing ---------- */
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'room' && parts[1]) return { name: 'room', id: cleanCode(parts[1]) };
  if (parts[0] === 'history') return { name: 'history' };
  return { name: 'home' };
}
function onRoute() {
  route = parseRoute(); armed = '';
  if (!member) { render(); return; }
  if (route.name === 'room') watchRoom(route.id); else stopRoom();
  if (route.name === 'home') {
    if (!openUnsub) openUnsub = backend.watchOpenRooms(list => { openRooms = list; if (route.name === 'home') render(); }, () => { openRooms = []; });
  } else if (openUnsub) { openUnsub(); openUnsub = null; }
  if (route.name === 'history') loadHistory();
  render();
  window.scrollTo(0, 0);
}

/* ---------- events ---------- */
app.addEventListener('click', e => {
  unlockAudio();
  const el = e.target.closest('[data-act],[data-set]');
  if (!el || el.disabled) return;
  if (el.hasAttribute('data-set')) { setSetting(el.getAttribute('data-set'), el.getAttribute('data-val')); return; }
  const a = el.getAttribute('data-act');
  if (el.closest('.game-root') && room) {
    const fn = GAMES[room.game].actionFor(el, app);
    if (fn) act(fn);
    return;
  }
  if (a === 'new') newRoom(el.getAttribute('data-game'));
  else if (a === 'rename') { renaming = true; render(); const i = document.getElementById('rn-name'); if (i) i.focus(); }
  else if (a === 'rename-cancel') { renaming = false; render(); }
  else if (a === 'sound') { lsSet('gn-sound', lsGet('gn-sound') === 'off' ? 'on' : 'off'); render(); }
  else if (roomActions[a]) roomActions[a]();
});
app.addEventListener('submit', async e => {
  e.preventDefault();
  unlockAudio();
  const f = e.target.getAttribute('data-form');
  if (f === 'onboard') doOnboard();
  else if (f === 'joincode') {
    const code = cleanCode(document.getElementById('jc-code').value);
    if (code.length === 4) { document.getElementById('jc-code').value = ''; location.hash = '#/room/' + code; }
    else toast('Table codes are 4 letters.');
  } else if (f === 'rename') {
    const name = cleanName(document.getElementById('rn-name').value);
    if (!name) return;
    try { await backend.rename(name); member.name = name; lsSet('gn-name', name); renaming = false; render(); }
    catch (err) { toast('Could not save your name.'); }
  } else if (f === 'guess' && room) {
    const fn = GAMES[room.game].actionFor({ getAttribute: k => (k === 'data-act' ? 'guess' : null) }, app);
    if (fn) act(fn);
  }
});
window.addEventListener('hashchange', onRoute);
setInterval(() => { if (route.name === 'room' && room && room.status === 'playing' && !busy && !document.querySelector('#guess:focus')) render(); }, 15000);

/* ---------- start ---------- */
(async function boot() {
  render();
  try {
    backend = await createBackend();
    if (!backend) { fatal = 'This copy of Game Night has not been connected to its database yet.'; render(); return; }
    uid = await backend.init();
    member = await backend.getMember();
  } catch (e) {
    fatal = 'Could not connect. Check your internet connection and reload.';
    render(); return;
  }
  onRoute();
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
