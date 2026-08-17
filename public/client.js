import { createWorld } from '/render3d.js';

const $ = (id) => document.getElementById(id);

const screens = {
  home: $('screen-home'),
  lobby: $('screen-lobby'),
  game: $('screen-game'),
};

const nameInput = $('name-input');
const codeInput = $('code-input');
const homeError = $('home-error');
const lobbyCode = $('lobby-code');
const lobbyCount = $('lobby-count');
const lobbyPlayers = $('lobby-players');
const hostTools = $('host-tools');
const guestWait = $('guest-wait');
const canvas = $('game');
const hudRound = $('hud-round');
const hudTimer = $('hud-timer');
const hudScores = $('hud-scores');
const hudBanner = $('hud-banner');
const hudCode = $('hud-code');
const dashBar = $('dash-bar');
const overlay = $('overlay');
const overlayKicker = $('overlay-kicker');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const overlayActions = $('overlay-actions');
const touchLayer = $('touch');

const NAMES = ['Blaze', 'Ember', 'Wick', 'Ash', 'Flint', 'Pico', 'Nova', 'Kindle', 'Cinder', 'Spark'];
nameInput.placeholder = NAMES[(Math.random() * NAMES.length) | 0];
nameInput.value = localStorage.getItem('fuse-name') || '';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) touchLayer.hidden = false;

const socket = io({
  transports: ['websocket', 'polling'],
  upgrade: true,
});

const world = createWorld(canvas);
const input = { x: 0, y: 0, dash: false, throw: false };
const keys = new Set();
let myId = null;
let amHost = false;
let roomCode = '';
let state = null;
let prevState = null;
let stateAt = 0;
let prevAt = 0;
let practice = false;
let lastFrame = performance.now();

const audio = createAudio();

function show(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.hidden = k !== name;
  });
}

function err(msg) {
  homeError.hidden = !msg;
  homeError.textContent = msg || '';
  if (msg) {
    setTimeout(() => {
      if (homeError.textContent === msg) homeError.hidden = true;
    }, 3200);
  }
}

function myName() {
  localStorage.setItem('fuse-name', nameInput.value.trim());
  return (nameInput.value || nameInput.placeholder || 'Player').trim();
}

function shareUrl() {
  const u = new URL(location.href);
  u.searchParams.set('room', roomCode);
  return u.toString();
}

async function copy(text, btn, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = label || 'Copied';
    setTimeout(() => {
      btn.textContent = old;
    }, 1200);
  }
}

$('btn-create').onclick = () => {
  practice = false;
  audio.unlock();
  socket.emit('create', { name: myName() });
};
$('btn-bots').onclick = () => {
  practice = true;
  audio.unlock();
  socket.emit('create', { name: myName() });
};
$('btn-join').onclick = joinFromForm;
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinFromForm();
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-create').click();
});

function joinFromForm() {
  const code = codeInput.value.trim();
  if (!code) return err('Enter a room code.');
  practice = false;
  audio.unlock();
  socket.emit('join', { code, name: myName() });
}

$('btn-copy').onclick = (e) => copy(shareUrl(), e.currentTarget, 'Link copied');
$('btn-copy-code').onclick = (e) => copy(roomCode, e.currentTarget, 'Copied');
$('btn-add-bot').onclick = () => socket.emit('addBot');
$('btn-remove-bot').onclick = () => socket.emit('removeBot');
$('btn-start').onclick = () => socket.emit('start');
$('btn-leave').onclick = () => {
  location.href = location.pathname;
};

socket.on('errorMsg', err);

socket.on('joined', (info) => {
  myId = info.id;
  roomCode = info.code;
  amHost = info.host;
  const u = new URL(location.href);
  u.searchParams.set('room', roomCode);
  history.replaceState({}, '', u);
  lobbyCode.textContent = roomCode;
  hudCode.textContent = roomCode;
  show('lobby');
  if (practice && amHost) {
    socket.emit('addBot');
    socket.emit('addBot');
    socket.emit('addBot');
    setTimeout(() => socket.emit('start'), 280);
  }
});

socket.on('lobby', (room) => {
  state = room;
  renderLobby(room);
  if (room.phase !== 'lobby') show('game');
});

socket.on('started', () => {
  overlay.hidden = true;
  show('game');
  audio.startAmbience();
  audio.play('start');
  world.resize();
});

socket.on('state', (room) => {
  prevState = state;
  prevAt = stateAt;
  state = room;
  stateAt = performance.now();
  handleEvents(room.events || []);
  updateHud(room);
  if (room.phase === 'round_over' || room.phase === 'match_over') showOverlay(room);
  else if (room.phase === 'playing' || room.phase === 'rearm') overlay.hidden = true;
});

function renderLobby(room) {
  lobbyPlayers.innerHTML = '';
  room.players.forEach((p) => {
    const li = document.createElement('li');
    const host = p.id === room.hostId ? ' · host' : '';
    const bot = p.isBot ? ' · bot' : '';
    const you = p.id === myId ? ' · you' : '';
    li.innerHTML = `<i class="swatch" style="background:${p.color}"></i><span>${escapeHtml(p.name)}</span><span class="muted">${you}${host}${bot}</span>`;
    lobbyPlayers.appendChild(li);
  });
  lobbyCount.textContent = `${room.players.length} / 6`;
  const host = room.hostId === myId;
  hostTools.hidden = !host;
  guestWait.hidden = host;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function handleEvents(events) {
  world.handleEvents(events);
  for (const e of events) {
    if (e.type === 'pass') audio.play('pass');
    else if (e.type === 'throw') audio.play('throw');
    else if (e.type === 'pickup') audio.play('pickup');
    else if (e.type === 'dash') audio.play('dash');
    else if (e.type === 'explode') audio.play('boom');
    else if (e.type === 'round' || e.type === 'rearm') audio.play('tick');
    else if (e.type === 'match') audio.play('win');
    else if (e.type === 'bounce') audio.play('bounce');
  }
}

function updateHud(room) {
  hudRound.textContent = room.round || 1;
  const t = Math.max(0, room.fuse || 0);
  hudTimer.textContent = t.toFixed(1);
  hudTimer.classList.toggle('hot', t < 3.2 && room.phase === 'playing');
  hudTimer.classList.toggle('ground', !room.bomb.heldBy && room.phase === 'playing');
  if (room.announcement) {
    hudBanner.hidden = false;
    hudBanner.textContent = room.announcement;
  } else {
    hudBanner.hidden = true;
  }
  const me = room.players.find((p) => p.id === myId);
  if (me) dashBar.style.width = `${Math.round((1 - Math.min(1, me.dashCd / 1.55)) * 100)}%`;
  hudScores.innerHTML = room.players
    .slice()
    .sort((a, b) => b.wins - a.wins)
    .map((p) => {
      const pips = Array.from({ length: room.winsNeeded }, (_, i) => `<b class="${i < p.wins ? 'on' : ''}"></b>`).join('');
      return `<div class="score-row ${p.alive ? '' : 'dead'}"><i style="background:${p.color}"></i>${escapeHtml(p.name)}<span class="pips">${pips}</span></div>`;
    })
    .join('');
}

function showOverlay(room) {
  const winner = room.players.find((p) => p.wins >= room.winsNeeded) || room.players.slice().sort((a, b) => b.wins - a.wins)[0];
  const match = room.phase === 'match_over';
  overlay.hidden = false;
  overlayKicker.textContent = match ? 'Match over' : 'Round over';
  overlayTitle.textContent = winner ? `${winner.name} ${match ? 'takes the match' : 'takes the round'}` : 'Draw';
  overlaySub.textContent = match ? 'First to 3. Rematch whenever you\'re ready.' : 'New fuse dropping in a moment…';
  overlayActions.innerHTML = '';
  if (match && amHost) {
    const a = document.createElement('button');
    a.className = 'btn primary';
    a.textContent = 'Rematch';
    a.onclick = () => socket.emit('rematch');
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = 'Back to lobby';
    b.onclick = () => {
      socket.emit('toLobby');
      show('lobby');
      overlay.hidden = true;
    };
    overlayActions.append(a, b);
  } else if (match) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Waiting for host…';
    overlayActions.append(p);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Space') input.dash = true;
  if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'ShiftLeft') input.throw = true;
  audio.unlock();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('mousedown', (e) => {
  if (screens.game.hidden) return;
  if (e.button === 0 && e.target === canvas) input.throw = true;
});

function readKeys() {
  let x = 0;
  let y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (!stick.active) {
    input.x = x;
    input.y = y;
  } else {
    input.x = stick.x;
    input.y = stick.y;
  }
}

const stick = { active: false, x: 0, y: 0 };
const stickEl = $('stick');
const knobEl = $('knob');

function setStick(clientX, clientY) {
  const r = stickEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = r.width * 0.36;
  const m = Math.hypot(dx, dy);
  if (m > max) {
    dx = (dx / m) * max;
    dy = (dy / m) * max;
  }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  stick.x = dx / max;
  stick.y = dy / max;
}

function endStick() {
  stick.active = false;
  stick.x = 0;
  stick.y = 0;
  knobEl.style.transform = '';
}

stickEl.addEventListener('pointerdown', (e) => {
  stick.active = true;
  stickEl.setPointerCapture(e.pointerId);
  setStick(e.clientX, e.clientY);
});
stickEl.addEventListener('pointermove', (e) => {
  if (stick.active) setStick(e.clientX, e.clientY);
});
stickEl.addEventListener('pointerup', endStick);
stickEl.addEventListener('pointercancel', endStick);
$('btn-dash').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.dash = true;
});
$('btn-throw').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.throw = true;
});

setInterval(() => {
  if (screens.game.hidden) return;
  readKeys();
  socket.emit('input', { x: input.x, y: input.y, dash: input.dash, throw: input.throw });
  input.dash = false;
  input.throw = false;
}, 1000 / 30);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpPlayers() {
  if (!state) return [];
  if (!prevState || !prevState.players) return state.players;
  const span = Math.max(1, stateAt - prevAt);
  const t = Math.min(1, (performance.now() - stateAt + span) / (span + 40));
  return state.players.map((p) => {
    const q = prevState.players.find((o) => o.id === p.id);
    if (!q) return p;
    return { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t) };
  });
}

function interpBomb() {
  const b = state.bomb;
  if (!prevState || !prevState.bomb) return b;
  const span = Math.max(1, stateAt - prevAt);
  const t = Math.min(1, (performance.now() - stateAt + span) / (span + 40));
  return { ...b, x: lerp(prevState.bomb.x, b.x, t), y: lerp(prevState.bomb.y, b.y, t) };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!state || screens.game.hidden) return;
  world.update(state, interpPlayers(), interpBomb(), dt, myId);
  audio.tick(state);
}
requestAnimationFrame(frame);

function createAudio() {
  let ctxA = null;
  let master = null;
  let drone = null;
  let lastTick = 0;
  const api = {
    unlock() {
      if (ctxA) {
        if (ctxA.state === 'suspended') ctxA.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctxA = new AC();
      master = ctxA.createGain();
      master.gain.value = 0.22;
      master.connect(ctxA.destination);
    },
    startAmbience() {
      if (!ctxA || drone) return;
      const osc = ctxA.createOscillator();
      const g = ctxA.createGain();
      osc.type = 'sine';
      osc.frequency.value = 52;
      g.gain.value = 0.08;
      osc.connect(g);
      g.connect(master);
      osc.start();
      drone = { osc, g };
    },
    play(type) {
      if (!ctxA) return;
      const now = ctxA.currentTime;
      if (type === 'pass') blip(now, 420, 180, 0.09, 'square');
      if (type === 'throw') blip(now, 220, 90, 0.08, 'sawtooth');
      if (type === 'pickup') blip(now, 520, 640, 0.06, 'triangle');
      if (type === 'dash') noise(now, 0.08, 0.1);
      if (type === 'boom') {
        noise(now, 0.28, 0.28);
        blip(now, 140, 40, 0.2, 'sine');
      }
      if (type === 'tick') blip(now, 880, 880, 0.04, 'square');
      if (type === 'bounce') blip(now, 200, 140, 0.05, 'triangle');
      if (type === 'start') blip(now, 300, 520, 0.12, 'triangle');
      if (type === 'win') {
        blip(now, 440, 660, 0.12, 'triangle');
        blip(now + 0.12, 660, 880, 0.16, 'triangle');
      }
    },
    tick(room) {
      if (!ctxA || !room || room.phase !== 'playing') return;
      const now = performance.now();
      const interval = room.fuse < 3 ? 180 : room.fuse < 6 ? 320 : 520;
      if (now - lastTick > interval) {
        lastTick = now;
        blip(ctxA.currentTime, room.fuse < 3 ? 980 : 720, 720, 0.03, 'square');
      }
    },
  };

  function blip(t, f0, f1, dur, type) {
    const o = ctxA.createOscillator();
    const g = ctxA.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(t, dur, gain) {
    const n = ctxA.createBuffer(1, ctxA.sampleRate * dur, ctxA.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctxA.createBufferSource();
    const g = ctxA.createGain();
    const f = ctxA.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    src.buffer = n;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  return api;
}

const params = new URLSearchParams(location.search);
const pre = params.get('room');
if (pre) {
  codeInput.value = pre.toUpperCase();
  codeInput.focus();
}
