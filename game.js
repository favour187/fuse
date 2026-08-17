'use strict';

const COLORS = ['#FF5A36', '#FFD166', '#06D6A0', '#4CC9F0', '#F72585', '#9B5DE5'];
const BOT_NAMES = ['Chip', 'Echo', 'Volt', 'Mag', 'Pip', 'Nix'];

const ARENA = { w: 1100, h: 640, pad: 36 };
const OBSTACLES = [
  { x: 550, y: 320, r: 46 },
  { x: 260, y: 170, r: 30 },
  { x: 840, y: 170, r: 30 },
  { x: 260, y: 470, r: 30 },
  { x: 840, y: 470, r: 30 },
];

const PLAYER_R = 22;
const SPEED = 255;
const ACCEL = 2100;
const FRICTION = 10;
const DASH_SPEED = 680;
const DASH_TIME = 0.15;
const DASH_CD = 1.55;
const THROW_SPEED = 560;
const THROW_CD = 0.25;
const PICKUP_LOCK = 0.4;
const IMMUNE_TIME = 0.5;
const PASS_LOCK = 0.32;
const BOMB_R = 13;
const BLAST_R = 118;
const FUSE_START = 11;
const FUSE_MIN = 6.2;
const WINS_NEEDED = 3;
const MAX_PLAYERS = 6;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

function sanitizeName(name) {
  const cleaned = String(name || '')
    .replace(/[^\w\s\-.\u00C0-\u024F]/g, '')
    .trim()
    .slice(0, 14);
  return cleaned || 'Player';
}

function spawnPoints(n) {
  const cx = ARENA.w / 2;
  const cy = ARENA.h / 2;
  const rx = 390;
  const ry = 210;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / n + 0.18;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

function createPlayer(id, name, isBot, colorIndex) {
  return {
    id,
    name: sanitizeName(name),
    color: COLORS[colorIndex % COLORS.length],
    colorIndex,
    isBot: !!isBot,
    x: ARENA.w / 2,
    y: ARENA.h / 2,
    vx: 0,
    vy: 0,
    facingX: 1,
    facingY: 0,
    r: PLAYER_R,
    alive: true,
    input: { x: 0, y: 0, dash: false, throw: false },
    dashT: 0,
    dashCd: 0,
    immune: 0,
    passLock: 0,
    pickupLock: 0,
    throwCd: 0,
    wins: 0,
    connected: true,
    wanderT: 0,
    wanderX: 0,
    wanderY: 0,
  };
}

function createRoom(code, hostId) {
  return {
    code,
    hostId,
    phase: 'lobby',
    players: new Map(),
    bomb: { x: ARENA.w / 2, y: ARENA.h / 2, vx: 0, vy: 0, heldBy: null, grounded: false },
    fuse: FUSE_START,
    fuseMax: FUSE_START,
    round: 0,
    winsNeeded: WINS_NEEDED,
    events: [],
    wait: 0,
    announcement: '',
    createdAt: Date.now(),
  };
}

function nextColorIndex(room) {
  const used = new Set([...room.players.values()].map((p) => p.colorIndex));
  for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
  return room.players.size % COLORS.length;
}

function addPlayer(room, id, name, isBot) {
  if (room.players.size >= MAX_PLAYERS) return null;
  if (room.phase !== 'lobby') return null;
  const p = createPlayer(id, name, isBot, nextColorIndex(room));
  room.players.set(id, p);
  return p;
}

function addBot(room) {
  if (room.players.size >= MAX_PLAYERS) return null;
  const used = new Set([...room.players.values()].map((p) => p.name));
  const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot${room.players.size}`;
  const id = 'bot_' + Math.random().toString(36).slice(2, 9);
  return addPlayer(room, id, name, true);
}

function removePlayer(room, id) {
  const p = room.players.get(id);
  if (!p) return;
  if (room.bomb.heldBy === id) {
    room.bomb.heldBy = null;
    room.bomb.grounded = true;
    room.bomb.x = p.x;
    room.bomb.y = p.y;
    room.bomb.vx = 0;
    room.bomb.vy = 0;
  }
  room.players.delete(id);
  if (room.hostId === id) {
    const next = [...room.players.values()].find((x) => !x.isBot);
    room.hostId = next ? next.id : [...room.players.keys()][0] || null;
  }
}

function living(room) {
  return [...room.players.values()].filter((p) => p.alive);
}

function startMatch(room) {
  if (room.players.size < 2) return false;
  for (const p of room.players.values()) p.wins = 0;
  room.round = 0;
  startRound(room);
  return true;
}

function startRound(room) {
  room.round += 1;
  room.phase = 'playing';
  room.wait = 0;
  room.announcement = '';
  room.events.push({ type: 'round', n: room.round });

  const list = [...room.players.values()];
  const spots = spawnPoints(list.length);
  list.forEach((p, i) => {
    p.alive = true;
    p.x = spots[i].x;
    p.y = spots[i].y;
    p.vx = 0;
    p.vy = 0;
    p.dashT = 0;
    p.dashCd = 0.4;
    p.immune = 0.8;
    p.passLock = 0;
    p.pickupLock = 0;
    p.throwCd = 0;
    p.input.dash = false;
    p.input.throw = false;
  });

  const fuseMax = clamp(FUSE_START - (room.round - 1) * 0.7, FUSE_MIN, FUSE_START);
  room.fuseMax = fuseMax;
  room.fuse = fuseMax;

  const holder = list[(Math.random() * list.length) | 0];
  room.bomb.heldBy = holder.id;
  room.bomb.grounded = false;
  room.bomb.x = holder.x;
  room.bomb.y = holder.y;
  room.bomb.vx = 0;
  room.bomb.vy = 0;
  holder.immune = 0.35;
  holder.passLock = 0.2;
}

function circleResolve(x, y, r) {
  const minX = ARENA.pad + r;
  const maxX = ARENA.w - ARENA.pad - r;
  const minY = ARENA.pad + r;
  const maxY = ARENA.h - ARENA.pad - r;
  let nx = clamp(x, minX, maxX);
  let ny = clamp(y, minY, maxY);
  let hit = nx !== x || ny !== y;

  for (const o of OBSTACLES) {
    const d = dist(nx, ny, o.x, o.y);
    const min = o.r + r;
    if (d < min && d > 0.0001) {
      const k = min / d;
      nx = o.x + (nx - o.x) * k;
      ny = o.y + (ny - o.y) * k;
      hit = true;
    } else if (d === 0) {
      nx += min;
      hit = true;
    }
  }
  nx = clamp(nx, minX, maxX);
  ny = clamp(ny, minY, maxY);
  return { x: nx, y: ny, hit };
}

function setInput(room, id, data) {
  const p = room.players.get(id);
  if (!p || p.isBot) return;
  const ix = clamp(Number(data.x) || 0, -1, 1);
  const iy = clamp(Number(data.y) || 0, -1, 1);
  p.input.x = ix;
  p.input.y = iy;
  if (data.dash) p.input.dash = true;
  if (data.throw) p.input.throw = true;
}

function updateBot(room, p, dt) {
  const bomb = room.bomb;
  const others = living(room).filter((o) => o.id !== p.id);
  let tx = 0;
  let ty = 0;
  p.wanderT -= dt;

  const holding = bomb.heldBy === p.id;
  if (holding) {
    let nearest = null;
    let nd = 1e9;
    for (const o of others) {
      const d = dist(p.x, p.y, o.x, o.y);
      if (d < nd) {
        nd = d;
        nearest = o;
      }
    }
    if (nearest) {
      tx = nearest.x - p.x;
      ty = nearest.y - p.y;
      if (nd < 86 && p.dashCd <= 0) p.input.dash = true;
      if (nd > 90 && nd < 240 && p.throwCd <= 0 && Math.random() < 0.035) p.input.throw = true;
    }
  } else {
    const bx = bomb.heldBy ? (room.players.get(bomb.heldBy)?.x ?? bomb.x) : bomb.x;
    const by = bomb.heldBy ? (room.players.get(bomb.heldBy)?.y ?? bomb.y) : bomb.y;
    const d = dist(p.x, p.y, bx, by);
    const panic = room.fuse < 3.2 || !bomb.heldBy;
    if (d < (panic ? 280 : 170)) {
      tx = p.x - bx;
      ty = p.y - by;
      if (d < 95 && p.dashCd <= 0) p.input.dash = true;
    } else {
      if (p.wanderT <= 0) {
        p.wanderT = rand(0.6, 1.6);
        const a = Math.random() * Math.PI * 2;
        p.wanderX = Math.cos(a);
        p.wanderY = Math.sin(a);
      }
      tx = p.wanderX;
      ty = p.wanderY;
    }
  }

  const m = Math.hypot(tx, ty) || 1;
  p.input.x = tx / m;
  p.input.y = ty / m;
}

function throwBomb(room, p) {
  if (room.bomb.heldBy !== p.id) return;
  if (p.throwCd > 0) return;
  const fx = p.facingX || 1;
  const fy = p.facingY || 0;
  const m = Math.hypot(fx, fy) || 1;
  room.bomb.heldBy = null;
  room.bomb.grounded = false;
  room.bomb.x = p.x + (fx / m) * (p.r + BOMB_R + 6);
  room.bomb.y = p.y + (fy / m) * (p.r + BOMB_R + 6);
  room.bomb.vx = (fx / m) * THROW_SPEED + p.vx * 0.35;
  room.bomb.vy = (fy / m) * THROW_SPEED + p.vy * 0.35;
  p.throwCd = THROW_CD;
  p.pickupLock = PICKUP_LOCK;
  p.passLock = PASS_LOCK;
  room.events.push({ type: 'throw', id: p.id, x: room.bomb.x, y: room.bomb.y });
}

function passBomb(room, from, to) {
  if (!to.alive || to.immune > 0) return;
  if (from.passLock > 0) return;
  room.bomb.heldBy = to.id;
  room.bomb.grounded = false;
  room.bomb.vx = 0;
  room.bomb.vy = 0;
  to.immune = IMMUNE_TIME;
  to.passLock = PASS_LOCK;
  from.passLock = PASS_LOCK;
  from.pickupLock = PICKUP_LOCK * 0.6;
  room.events.push({ type: 'pass', from: from.id, to: to.id, x: to.x, y: to.y });
}

function pickupBomb(room, p) {
  if (room.bomb.heldBy) return;
  if (!p.alive || p.pickupLock > 0 || p.immune > 0) return;
  room.bomb.heldBy = p.id;
  room.bomb.grounded = false;
  room.bomb.vx = 0;
  room.bomb.vy = 0;
  p.immune = IMMUNE_TIME * 0.7;
  p.passLock = PASS_LOCK;
  room.events.push({ type: 'pickup', id: p.id, x: p.x, y: p.y });
}

function explode(room) {
  const bomb = room.bomb;
  const hx = bomb.x;
  const hy = bomb.y;
  const killed = [];

  if (bomb.heldBy) {
    const holder = room.players.get(bomb.heldBy);
    if (holder && holder.alive) {
      holder.alive = false;
      holder.vx = 0;
      holder.vy = 0;
      killed.push(holder.id);
    }
  } else {
    for (const p of living(room)) {
      if (dist(p.x, p.y, hx, hy) <= BLAST_R) {
        p.alive = false;
        p.vx = 0;
        p.vy = 0;
        killed.push(p.id);
      }
    }
    if (killed.length === 0) {
      let nearest = null;
      let nd = 1e9;
      for (const p of living(room)) {
        const d = dist(p.x, p.y, hx, hy);
        if (d < nd) {
          nd = d;
          nearest = p;
        }
      }
      if (nearest) {
        nearest.alive = false;
        killed.push(nearest.id);
      }
    }
  }

  room.events.push({ type: 'explode', x: hx, y: hy, killed, grounded: !bomb.heldBy });
  bomb.heldBy = null;
  bomb.grounded = false;
  bomb.vx = 0;
  bomb.vy = 0;

  const left = living(room);
  if (left.length <= 1) {
    const winner = left[0] || null;
    if (winner) winner.wins += 1;
    room.phase = winner && winner.wins >= room.winsNeeded ? 'match_over' : 'round_over';
    room.wait = 3.1;
    room.announcement = winner ? `${winner.name} wins the round` : 'Nobody wins';
    room.events.push({
      type: room.phase === 'match_over' ? 'match' : 'round_over',
      winnerId: winner ? winner.id : null,
    });
    return;
  }

  room.wait = 1.15;
  room.phase = 'rearm';
  room.announcement = 'New fuse…';
}

function rearm(room) {
  const left = living(room);
  if (left.length <= 1) {
    explode(room);
    return;
  }
  const holder = left[(Math.random() * left.length) | 0];
  const fuseMax = clamp(room.fuseMax - 0.55, FUSE_MIN, FUSE_START);
  room.fuseMax = fuseMax;
  room.fuse = fuseMax;
  room.bomb.heldBy = holder.id;
  room.bomb.grounded = false;
  room.bomb.x = holder.x;
  room.bomb.y = holder.y;
  holder.immune = 0.45;
  room.phase = 'playing';
  room.wait = 0;
  room.announcement = '';
  room.events.push({ type: 'rearm', id: holder.id });
}

function tick(room, dt) {
  room.events = [];
  if (room.phase === 'lobby') return;

  if (room.phase === 'round_over' || room.phase === 'match_over') {
    room.wait -= dt;
    if (room.phase === 'round_over' && room.wait <= 0) startRound(room);
    return;
  }

  if (room.phase === 'rearm') {
    room.wait -= dt;
    if (room.wait <= 0) rearm(room);
    return;
  }

  if (room.phase !== 'playing') return;

  for (const p of room.players.values()) {
    if (p.isBot && p.alive) updateBot(room, p, dt);
    if (!p.alive) {
      p.vx *= Math.exp(-8 * dt);
      p.vy *= Math.exp(-8 * dt);
      continue;
    }

    p.dashCd = Math.max(0, p.dashCd - dt);
    p.immune = Math.max(0, p.immune - dt);
    p.passLock = Math.max(0, p.passLock - dt);
    p.pickupLock = Math.max(0, p.pickupLock - dt);
    p.throwCd = Math.max(0, p.throwCd - dt);

    const ix = p.input.x;
    const iy = p.input.y;
    const im = Math.hypot(ix, iy);
    const nx = im > 1 ? ix / im : ix;
    const ny = im > 1 ? iy / im : iy;
    if (im > 0.12) {
      p.facingX = nx;
      p.facingY = ny;
    }

    if (p.input.dash && p.dashCd <= 0) {
      const dx = im > 0.12 ? nx : p.facingX;
      const dy = im > 0.12 ? ny : p.facingY;
      const dm = Math.hypot(dx, dy) || 1;
      p.vx = (dx / dm) * DASH_SPEED;
      p.vy = (dy / dm) * DASH_SPEED;
      p.dashT = DASH_TIME;
      p.dashCd = DASH_CD;
      room.events.push({ type: 'dash', id: p.id, x: p.x, y: p.y });
    }
    p.input.dash = false;

    if (p.input.throw) {
      throwBomb(room, p);
      p.input.throw = false;
    } else {
      p.input.throw = false;
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
    } else {
      p.vx += nx * ACCEL * dt;
      p.vy += ny * ACCEL * dt;
      const damp = Math.exp(-FRICTION * dt);
      p.vx *= damp;
      p.vy *= damp;
      const spd = Math.hypot(p.vx, p.vy);
      const cap = room.bomb.heldBy === p.id ? SPEED * 1.08 : SPEED;
      if (spd > cap) {
        p.vx = (p.vx / spd) * cap;
        p.vy = (p.vy / spd) * cap;
      }
    }

    const next = circleResolve(p.x + p.vx * dt, p.y + p.vy * dt, p.r);
    if (next.hit) {
      p.vx *= 0.4;
      p.vy *= 0.4;
    }
    p.x = next.x;
    p.y = next.y;
  }

  const list = living(room);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const min = a.r + b.r;
      if (d < min && d > 0.0001) {
        const overlap = min - d;
        const ux = (a.x - b.x) / d;
        const uy = (a.y - b.y) / d;
        a.x += ux * overlap * 0.5;
        a.y += uy * overlap * 0.5;
        b.x -= ux * overlap * 0.5;
        b.y -= uy * overlap * 0.5;
        const impulse = 40 + overlap * 8;
        a.vx += ux * impulse;
        a.vy += uy * impulse;
        b.vx -= ux * impulse;
        b.vy -= uy * impulse;
        const resolvedA = circleResolve(a.x, a.y, a.r);
        const resolvedB = circleResolve(b.x, b.y, b.r);
        a.x = resolvedA.x;
        a.y = resolvedA.y;
        b.x = resolvedB.x;
        b.y = resolvedB.y;

        if (room.bomb.heldBy === a.id) passBomb(room, a, b);
        else if (room.bomb.heldBy === b.id) passBomb(room, b, a);
      }
    }
  }

  const bomb = room.bomb;
  if (bomb.heldBy) {
    const h = room.players.get(bomb.heldBy);
    if (h && h.alive) {
      bomb.x = h.x + h.facingX * 8;
      bomb.y = h.y - h.r - 6;
      bomb.vx = h.vx;
      bomb.vy = h.vy;
      bomb.grounded = false;
    } else {
      bomb.heldBy = null;
      bomb.grounded = true;
    }
  } else {
    bomb.vx *= Math.exp(-2.4 * dt);
    bomb.vy *= Math.exp(-2.4 * dt);
    const next = circleResolve(bomb.x + bomb.vx * dt, bomb.y + bomb.vy * dt, BOMB_R);
    if (next.hit) {
      const prevX = bomb.x;
      const prevY = bomb.y;
      if (Math.abs(next.x - (prevX + bomb.vx * dt)) > 0.01) bomb.vx *= -0.72;
      if (Math.abs(next.y - (prevY + bomb.vy * dt)) > 0.01) bomb.vy *= -0.72;
      room.events.push({ type: 'bounce', x: next.x, y: next.y });
    }
    bomb.x = next.x;
    bomb.y = next.y;
    bomb.grounded = Math.hypot(bomb.vx, bomb.vy) < 28;

    for (const p of living(room)) {
      if (dist(p.x, p.y, bomb.x, bomb.y) < p.r + BOMB_R + 2) {
        pickupBomb(room, p);
        break;
      }
    }
  }

  room.fuse -= dt;
  if (room.fuse <= 0) {
    room.fuse = 0;
    explode(room);
  }
}

function serialize(room, extra = {}) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    winsNeeded: room.winsNeeded,
    fuse: room.fuse,
    fuseMax: room.fuseMax,
    announcement: room.announcement,
    wait: room.wait,
    arena: { w: ARENA.w, h: ARENA.h, pad: ARENA.pad },
    obstacles: OBSTACLES,
    bomb: { ...room.bomb },
    blastR: BLAST_R,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      facingX: p.facingX,
      facingY: p.facingY,
      r: p.r,
      alive: p.alive,
      isBot: p.isBot,
      dashCd: p.dashCd,
      dashT: p.dashT,
      immune: p.immune,
      wins: p.wins,
    })),
    events: room.events,
    ...extra,
  };
}

module.exports = {
  COLORS,
  ARENA,
  OBSTACLES,
  MAX_PLAYERS,
  WINS_NEEDED,
  makeCode,
  sanitizeName,
  createRoom,
  addPlayer,
  addBot,
  removePlayer,
  startMatch,
  startRound,
  setInput,
  tick,
  serialize,
};
