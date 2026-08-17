(() => {
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
  const ctx = canvas.getContext('2d');
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

  const fx = {
    shake: 0,
    flash: 0,
    hitstop: 0,
    particles: [],
    trails: [],
    sparks: [],
    t: 0,
  };

  const audio = createAudio();

  function show(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.hidden = k !== name;
    });
  }

  function err(msg) {
    homeError.hidden = !msg;
    homeError.textContent = msg || '';
    if (msg) setTimeout(() => {
      if (homeError.textContent === msg) homeError.hidden = true;
    }, 3200);
  }

  function myName() {
    const n = (nameInput.value || nameInput.placeholder || 'Player').trim();
    localStorage.setItem('fuse-name', nameInput.value.trim());
    return n;
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
  $('btn-leave').onclick = () => location.href = location.pathname;

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
    resize();
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
    for (const e of events) {
      if (e.type === 'pass') {
        burst(e.x, e.y, '#ffd166', 18);
        audio.play('pass');
        fx.shake = 5;
        fx.flash = 0.12;
      } else if (e.type === 'throw') {
        burst(e.x, e.y, '#ff5a36', 10);
        audio.play('throw');
      } else if (e.type === 'pickup') {
        burst(e.x, e.y, '#fff', 8);
        audio.play('pickup');
      } else if (e.type === 'dash') {
        audio.play('dash');
      } else if (e.type === 'explode') {
        boom(e.x, e.y);
        audio.play('boom');
        fx.shake = 18;
        fx.flash = 0.55;
        fx.hitstop = 0.08;
      } else if (e.type === 'round' || e.type === 'rearm') {
        audio.play('tick');
      } else if (e.type === 'match') {
        audio.play('win');
      } else if (e.type === 'bounce') {
        audio.play('bounce');
      }
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

  const stick = { active: false, x: 0, y: 0, id: null };
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
    stick.id = e.pointerId;
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

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 220;
      fx.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.45,
        max: 0.8,
        r: 2 + Math.random() * 3.5,
        color,
      });
    }
  }

  function boom(x, y) {
    burst(x, y, '#ff5a36', 36);
    burst(x, y, '#ffd166', 22);
    burst(x, y, '#fff6ea', 12);
    fx.sparks.push({ x, y, r: 10, max: 160, life: 0.45 });
  }

  let view = { x: 0, y: 0, s: 1, ox: 0, oy: 0 };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

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
      return {
        ...p,
        x: lerp(q.x, p.x, t),
        y: lerp(q.y, p.y, t),
      };
    });
  }

  function interpBomb() {
    const b = state.bomb;
    if (!prevState || !prevState.bomb) return b;
    const span = Math.max(1, stateAt - prevAt);
    const t = Math.min(1, (performance.now() - stateAt + span) / (span + 40));
    return {
      ...b,
      x: lerp(prevState.bomb.x, b.x, t),
      y: lerp(prevState.bomb.y, b.y, t),
    };
  }

  function worldToScreen() {
    if (!state) return;
    const aw = state.arena.w;
    const ah = state.arena.h;
    const pad = 28;
    const s = Math.min((innerWidth - pad * 2) / aw, (innerHeight - pad * 2) / ah);
    view.s = s;
    view.x = (innerWidth - aw * s) / 2;
    view.y = (innerHeight - ah * s) / 2;
  }

  function shakeOffset() {
    if (fx.shake <= 0) return { x: 0, y: 0 };
    const m = fx.shake;
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }

  function draw() {
    requestAnimationFrame(draw);
    const dt = 1 / 60;
    fx.t += dt;
    if (fx.hitstop > 0) {
      fx.hitstop -= dt;
    }
    fx.shake = Math.max(0, fx.shake - dt * 28);
    fx.flash = Math.max(0, fx.flash - dt * 1.6);

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const g = ctx.createRadialGradient(innerWidth * 0.5, innerHeight * 0.4, 40, innerWidth * 0.5, innerHeight * 0.5, innerWidth * 0.7);
    g.addColorStop(0, '#2a1610');
    g.addColorStop(1, '#0c0706');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    if (!state || screens.game.hidden) return;
    worldToScreen();
    const sh = shakeOffset();
    ctx.save();
    ctx.translate(view.x + sh.x, view.y + sh.y);
    ctx.scale(view.s, view.s);

    drawArena();
    const players = interpPlayers();
    const bomb = interpBomb();

    for (const p of players) {
      if (p.dashT > 0) {
        fx.trails.push({ x: p.x, y: p.y, color: p.color, life: 0.22, r: p.r });
      }
    }

    drawTrails();
    drawObstacles();
    if (!bomb.heldBy && state.phase === 'playing') drawBlastHint(bomb);
    for (const p of players) if (!p.alive) drawPlayer(p, bomb, true);
    for (const p of players) if (p.alive) drawPlayer(p, bomb, false);
    drawBomb(bomb);
    drawParticles();

    ctx.restore();

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255, 214, 160, ${fx.flash * 0.35})`;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
    }

    audio.tick(state);
  }

  function drawArena() {
    const { w, h, pad } = state.arena;
    roundRect(ctx, 0, 0, w, h, 28);
    ctx.fillStyle = '#1a0f0c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 160, 0.16)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 18);
    ctx.clip();
    ctx.fillStyle = '#221410';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 214, 160, 0.05)';
    ctx.lineWidth = 1;
    for (let x = pad; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = pad; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of state.obstacles) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = '#2c1a14';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 214, 160, 0.18)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x - o.r * 0.2, o.y - o.r * 0.22, o.r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 160, 0.04)';
      ctx.fill();
    }
  }

  function drawBlastHint(bomb) {
    const pulse = 0.5 + Math.sin(fx.t * 8) * 0.5;
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, state.blastR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 90, 54, ${0.18 + pulse * 0.18})`;
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPlayer(p, bomb, ghost) {
    ctx.save();
    ctx.globalAlpha = ghost ? 0.28 : 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.r + 2, p.r * 0.85, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    const walk = Math.hypot(p.vx, p.vy) > 20 ? Math.sin(fx.t * 16 + p.x) : 0;
    ctx.fillStyle = shade(p.color, -30);
    ctx.beginPath();
    ctx.ellipse(p.x - 8, p.y + p.r - 4, 6, 5 + walk, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + 8, p.y + p.r - 4, 6, 5 - walk, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = bomb.heldBy === p.id ? 24 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const holding = bomb.heldBy === p.id;
    const bx = bomb.x;
    const by = bomb.y;
    const lookX = holding ? -p.facingX : bx - p.x;
    const lookY = holding ? -p.facingY : by - p.y;
    const lm = Math.hypot(lookX, lookY) || 1;
    const scared = holding || (!bomb.heldBy && Math.hypot(p.x - bx, p.y - by) < 140);
    const eyeW = scared ? 6.2 : 5.2;
    const eyeH = scared ? 7.4 : 5.8;
    drawEye(p.x - 7, p.y - 3, eyeW, eyeH, lookX / lm, lookY / lm, scared);
    drawEye(p.x + 7, p.y - 3, eyeW, eyeH, lookX / lm, lookY / lm, scared);

    if (holding && state.fuse < 4) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(p.x + 14, p.y - 8 + Math.sin(fx.t * 20) * 2, 2.2, 3.2, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.immune > 0 && p.alive) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.font = '700 12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ghost ? 'rgba(246,239,230,0.5)' : '#f6efe6';
    ctx.fillText(p.name, p.x, p.y - p.r - 10);
    if (p.id === myId) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 9px Outfit, sans-serif';
      ctx.fillText('YOU', p.x, p.y - p.r - 22);
    }
    ctx.restore();
  }

  function drawEye(x, y, w, h, lx, ly, scared) {
    ctx.fillStyle = '#fff6ea';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0b08';
    ctx.beginPath();
    ctx.arc(x + lx * 2.1, y + ly * 2.1, scared ? 2.6 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBomb(bomb) {
    const t = state.fuse;
    const pulse = 1 + Math.sin(fx.t * (t < 3 ? 16 : 7)) * 0.08;
    const r = 13 * pulse;
    ctx.save();
    ctx.shadowColor = '#ff5a36';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1c0d0a';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff5a36';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(bomb.x - 3, bomb.y - 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,214,160,0.25)';
    ctx.fill();

    const wickX = bomb.x + 8;
    const wickY = bomb.y - 12;
    ctx.strokeStyle = '#c7b3a3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bomb.x + 4, bomb.y - 10);
    ctx.quadraticCurveTo(wickX, wickY, wickX + 6, wickY - 4);
    ctx.stroke();

    ctx.fillStyle = t < 3 ? '#ffd166' : '#ff5a36';
    ctx.beginPath();
    ctx.arc(wickX + 6, wickY - 4, 3.2 + Math.sin(fx.t * 20) * 0.8, 0, Math.PI * 2);
    ctx.fill();

    if (!bomb.heldBy) {
      ctx.font = '800 11px Outfit, sans-serif';
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'center';
      ctx.fillText('LIVE', bomb.x, bomb.y + 26);
    }
    ctx.restore();
  }

  function drawTrails() {
    fx.trails = fx.trails.filter((tr) => {
      tr.life -= 1 / 60;
      if (tr.life <= 0) return false;
      ctx.globalAlpha = tr.life * 2;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = tr.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      return true;
    });
  }

  function drawParticles() {
    fx.sparks = fx.sparks.filter((s) => {
      s.life -= 1 / 60;
      if (s.life <= 0) return false;
      const k = 1 - s.life / 0.45;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.max * k, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 90, 54, ${1 - k})`;
      ctx.lineWidth = 8 * (1 - k);
      ctx.stroke();
      return true;
    });
    fx.particles = fx.particles.filter((p) => {
      p.life -= 1 / 60;
      if (p.life <= 0) return false;
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      p.vy += 80 / 60;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return true;
    });
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function shade(hex, amt) {
    const n = hex.replace('#', '');
    const num = parseInt(n, 16);
    const r = clamp(((num >> 16) & 255) + amt, 0, 255);
    const g = clamp(((num >> 8) & 255) + amt, 0, 255);
    const b = clamp((num & 255) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

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

  draw();
})();
