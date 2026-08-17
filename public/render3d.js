import * as THREE from '/vendor/three.module.js';

const UP = new THREE.Vector3(0, 1, 0);
const SCALE = 0.1;

function hexToInt(hex) {
  return parseInt(String(hex).replace('#', ''), 16);
}

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1c1410';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(232, 201, 148, 0.09)';
  g.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  g.strokeStyle = 'rgba(232, 201, 148, 0.04)';
  for (let i = 32; i < 512; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelSprite(text, accent) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 80;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 320, 80);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.75)';
  g.shadowBlur = 8;
  if (accent) {
    g.font = '800 13px Outfit, Segoe UI, sans-serif';
    g.fillStyle = '#e8c994';
    g.fillText(accent, 160, 16);
  }
  g.font = '600 28px Outfit, Segoe UI, sans-serif';
  g.fillStyle = '#f4efe6';
  g.fillText(text, 160, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(2.6, 0.65, 1);
  s.center.set(0.5, 0);
  return s;
}

function limb(mat, r, len) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 8), mat);
  m.castShadow = true;
  return m;
}

function makePlayerRig(color) {
  const group = new THREE.Group();
  const col = hexToInt(color);
  const ink = 0x14110f;

  const inkMat = new THREE.MeshStandardMaterial({
    color: ink,
    roughness: 0.38,
    metalness: 0.18,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: col,
    roughness: 0.28,
    metalness: 0.12,
    emissive: col,
    emissiveIntensity: 0.22,
  });

  const root = new THREE.Group();
  root.position.y = 0;
  group.add(root);

  const hips = new THREE.Group();
  hips.position.y = 1.05;
  root.add(hips);

  const torso = limb(inkMat, 0.09, 0.85);
  torso.position.y = 0.55;
  hips.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), accentMat);
  head.position.y = 1.28;
  head.castShadow = true;
  hips.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf7f1e8 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x120e0c });
  const eyes = new THREE.Group();
  eyes.position.set(0, 0.02, 0.26);
  [-0.11, 0.11].forEach((x) => {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeMat);
    white.position.set(x, 0, 0);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), pupilMat);
    pupil.position.set(0, 0, 0.05);
    white.add(pupil);
    eyes.add(white);
  });
  head.add(eyes);

  const shoulders = new THREE.Group();
  shoulders.position.y = 0.92;
  hips.add(shoulders);

  const arms = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0, 0);
    const arm = limb(inkMat, 0.055, 0.72);
    arm.position.y = -0.38;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), accentMat);
    hand.position.y = -0.78;
    pivot.add(arm, hand);
    shoulders.add(pivot);
    arms.push(pivot);
  });

  const legs = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0, 0);
    const leg = limb(inkMat, 0.065, 0.85);
    leg.position.y = -0.52;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), accentMat);
    foot.position.y = -1.02;
    pivot.add(leg, foot);
    hips.add(pivot);
    legs.push(pivot);
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  const label = makeLabelSprite('Player', '');
  label.position.y = 3.15;
  group.add(label);

  return {
    group,
    root,
    hips,
    head,
    headMat: accentMat,
    eyes,
    arms,
    legs,
    shadow,
    label,
    color,
  };
}

function makeBomb() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 22, 16),
    new THREE.MeshStandardMaterial({
      color: 0x14110f,
      roughness: 0.22,
      metalness: 0.42,
      emissive: 0xc2410c,
      emissiveIntensity: 0.28,
    }),
  );
  shell.castShadow = true;
  group.add(shell);

  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.43, 0.035, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8c994, roughness: 0.3, metalness: 0.55 }),
  );
  band.rotation.x = Math.PI / 2;
  group.add(band);

  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xe8c994 }),
  );
  spark.position.set(0.08, 0.58, 0);
  group.add(spark);

  const light = new THREE.PointLight(0xff6a2a, 10, 28, 1.7);
  light.position.y = 0.4;
  group.add(light);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.22, 48),
    new THREE.MeshBasicMaterial({
      color: 0xe8c994,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.35;
  group.add(ring);

  return { group, shell, spark, light, ring };
}

export function createWorld(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0908);
  scene.fog = new THREE.Fog(0x0c0908, 55, 160);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.4, 400);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene.add(new THREE.AmbientLight(0xd9cbb8, 0.22));
  scene.add(new THREE.HemisphereLight(0xf0d8b8, 0x1a120e, 0.48));

  const sun = new THREE.DirectionalLight(0xffe8cc, 1.15);
  sun.position.set(-18, 42, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.0007;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0xe8c994, 0.28);
  rim.position.set(30, 12, -24);
  scene.add(rim);

  const arena = new THREE.Group();
  scene.add(arena);

  const players = new Map();
  const bomb = makeBomb();
  scene.add(bomb.group);

  const particles = [];
  const embers = makeEmbers();
  scene.add(embers.points);

  let shake = 0;
  let flash = 0;
  let t = 0;
  let arenaW = 1100;
  let arenaH = 640;
  let blastR = 118;

  const flashMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 90),
    new THREE.MeshBasicMaterial({ color: 0xf3d7a6, transparent: true, opacity: 0, depthWrite: false }),
  );
  flashMesh.rotation.x = -Math.PI / 2;
  flashMesh.position.y = 0.12;
  scene.add(flashMesh);

  function to3(x, y, height = 0) {
    return new THREE.Vector3((x - arenaW / 2) * SCALE, height, (y - arenaH / 2) * SCALE);
  }

  function buildArena(state) {
    arena.clear();
    arenaW = state.arena.w;
    arenaH = state.arena.h;
    blastR = state.blastR;
    const aw = arenaW * SCALE;
    const ah = arenaH * SCALE;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(aw + 2, 1.1, ah + 2),
      new THREE.MeshStandardMaterial({
        map: makeFloorTexture(),
        roughness: 0.88,
        metalness: 0.04,
      }),
    );
    floor.position.y = -0.55;
    floor.receiveShadow = true;
    arena.add(floor);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(aw + 3.6, 2.2, ah + 3.6),
      new THREE.MeshStandardMaterial({ color: 0x16110e, roughness: 0.72 }),
    );
    lip.position.y = -1.75;
    lip.receiveShadow = true;
    arena.add(lip);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.58, metalness: 0.08 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc4a46a, roughness: 0.35, metalness: 0.4 });
    const walls = [
      { w: aw + 1.2, d: 0.7, x: 0, z: -ah / 2 - 0.15 },
      { w: aw + 1.2, d: 0.7, x: 0, z: ah / 2 + 0.15 },
      { w: 0.7, d: ah + 1.2, x: -aw / 2 - 0.15, z: 0 },
      { w: 0.7, d: ah + 1.2, x: aw / 2 + 0.15, z: 0 },
    ];
    for (const w of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, 2.4, w.d), wallMat);
      m.position.set(w.x, 0.85, w.z);
      m.castShadow = true;
      m.receiveShadow = true;
      arena.add(m);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.08, w.d + 0.04), goldMat);
      trim.position.set(w.x, 2.08, w.z);
      arena.add(trim);
    }

    const colMat = new THREE.MeshStandardMaterial({ color: 0x241c17, roughness: 0.62 });
    for (const o of state.obstacles) {
      const r = o.r * SCALE;
      const h = 3.2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 18), colMat);
      const p = to3(o.x, o.y, h / 2);
      col.position.copy(p);
      col.castShadow = true;
      col.receiveShadow = true;
      arena.add(col);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.9, 0.22, 18), goldMat);
      cap.position.set(p.x, h + 0.02, p.z);
      arena.add(cap);
    }
  }

  function ensurePlayer(p) {
    let rig = players.get(p.id);
    if (!rig) {
      rig = makePlayerRig(p.color);
      scene.add(rig.group);
      players.set(p.id, rig);
    }
    return rig;
  }

  function prunePlayers(list) {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, rig] of players) {
      if (!ids.has(id)) {
        scene.remove(rig.group);
        players.delete(id);
      }
    }
  }

  function lookEyes(rig, target, scared) {
    rig.eyes.children.forEach((eye) => {
      const pupil = eye.children[0];
      if (!pupil) return;
      const world = new THREE.Vector3();
      eye.getWorldPosition(world);
      const dir = target.clone().sub(world);
      dir.y *= 0.35;
      dir.normalize();
      pupil.position.set(dir.x * 0.028, dir.y * 0.02, 0.05);
    });
    rig.eyes.scale.setScalar(scared ? 1.18 : 1);
  }

  function burst(x, y, color, n, speed = 70) {
    const origin = to3(x, y, 2.2);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: hexToInt(color) }),
      );
      mesh.position.copy(origin);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * speed * 0.16,
        3 + Math.random() * 7,
        (Math.random() - 0.5) * speed * 0.16,
      );
      particles.push({ mesh, vel, life: 0.4 + Math.random() * 0.35 });
      scene.add(mesh);
    }
  }

  function boom(x, y) {
    burst(x, y, '#c2410c', 24, 90);
    burst(x, y, '#e8c994', 14, 70);
    burst(x, y, '#f4efe6', 8, 45);
    shake = 1;
    flash = 1;
  }

  function handleEvents(events) {
    for (const e of events || []) {
      if (e.type === 'pass') burst(e.x, e.y, '#e8c994', 12, 48);
      else if (e.type === 'throw') burst(e.x, e.y, '#c2410c', 8, 40);
      else if (e.type === 'explode') boom(e.x, e.y);
      else if (e.type === 'dash') burst(e.x, e.y, '#f4efe6', 4, 22);
    }
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  }

  function update(state, displayPlayers, displayBomb, dt, myId) {
    t += dt;
    shake = Math.max(0, shake - dt * 2.4);
    flash = Math.max(0, flash - dt * 2.2);
    flashMesh.material.opacity = flash * 0.18;

    if (!state) return;
    if (arena.children.length === 0) buildArena(state);
    prunePlayers(displayPlayers);

    const bombPos = to3(displayBomb.x, displayBomb.y, displayBomb.heldBy ? 3.05 : 0.7);
    bomb.group.position.lerp(bombPos, 0.35);
    const pulse = 1 + Math.sin(t * (state.fuse < 3 ? 18 : 8)) * 0.07;
    bomb.group.scale.setScalar(pulse);
    bomb.spark.material.color.set(state.fuse < 3 ? 0xffd166 : 0xe8c994);
    bomb.light.intensity = 8 + Math.sin(t * 10) * 3 + (state.fuse < 3 ? 6 : 0);
    bomb.ring.visible = !displayBomb.heldBy && state.phase === 'playing';
    bomb.ring.scale.setScalar(((state.blastR || blastR) * SCALE) / 1.2);
    bomb.ring.material.opacity = 0.14 + Math.sin(t * 8) * 0.06;

    for (const p of displayPlayers) {
      const rig = ensurePlayer(p);
      const pos = to3(p.x, p.y, 0);
      const spd = Math.hypot(p.vx || 0, p.vy || 0);
      const walk = p.alive && spd > 16;
      pos.y = walk ? Math.abs(Math.sin(t * 13)) * 0.12 : 0;
      rig.group.position.lerp(pos, 0.42);
      const face = Math.atan2(p.facingX || 1, p.facingY || 0);
      rig.group.rotation.y = THREE.MathUtils.lerp(rig.group.rotation.y, face, 0.22);
      rig.group.scale.setScalar(1.15);
      rig.headMat.emissiveIntensity = displayBomb.heldBy === p.id ? 0.55 : 0.18;
      rig.root.rotation.x = THREE.MathUtils.lerp(rig.root.rotation.x, p.dashT > 0 ? 0.35 : 0, 0.2);

      const fade = p.alive ? 1 : 0.28;
      rig.group.traverse((o) => {
        if (o.material && 'opacity' in o.material && o !== rig.shadow) {
          o.material.transparent = fade < 1;
          if (o.material !== rig.headMat) o.material.opacity = fade;
        }
      });
      rig.head.material.transparent = fade < 1;
      rig.head.material.opacity = fade;

      const scared =
        displayBomb.heldBy === p.id ||
        (!displayBomb.heldBy && Math.hypot(p.x - displayBomb.x, p.y - displayBomb.y) < 140);
      lookEyes(rig, bomb.group.position, scared);

      const swing = walk ? Math.sin(t * 13) : 0;
      rig.legs[0].rotation.x = swing * 0.85;
      rig.legs[1].rotation.x = -swing * 0.85;
      rig.arms[0].rotation.x = -swing * 0.7;
      rig.arms[1].rotation.x = swing * 0.7;
      if (scared) {
        rig.arms[0].rotation.z = 0.9;
        rig.arms[1].rotation.z = -0.9;
      } else {
        rig.arms[0].rotation.z = 0.12;
        rig.arms[1].rotation.z = -0.12;
      }

      const labelNeed = p.id === myId ? 'YOU' : '';
      if (rig._name !== p.name || rig._accent !== labelNeed) {
        rig.group.remove(rig.label);
        rig.label.material.map.dispose();
        rig.label.material.dispose();
        rig.label = makeLabelSprite(p.name, labelNeed);
        rig.label.position.y = 3.15;
        rig.group.add(rig.label);
        rig._name = p.name;
        rig._accent = labelNeed;
      }
    }

    const mid = to3(arenaW / 2, arenaH / 2, 0);
    const camTarget = new THREE.Vector3(mid.x, 1.6, mid.z);
    const me = displayPlayers.find((p) => p.id === myId) || displayPlayers.find((p) => p.id === displayBomb.heldBy);
    if (me) {
      const hp = to3(me.x, me.y, 1.6);
      camTarget.lerp(hp, 0.35);
    }
    const dist = Math.max(arenaW, arenaH) * SCALE * 0.62;
    const camPos = new THREE.Vector3(camTarget.x, 18 + dist * 0.18, camTarget.z + dist * 0.82);
    if (shake > 0) {
      camPos.x += (Math.random() - 0.5) * shake * 1.6;
      camPos.y += (Math.random() - 0.5) * shake * 0.8;
    }
    camera.position.lerp(camPos, 0.07);
    camera.up.copy(UP);
    camera.lookAt(camTarget.x, 2.2, camTarget.z);

    embers.tick(dt);
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life -= dt;
      q.vel.y -= 14 * dt;
      q.mesh.position.addScaledVector(q.vel, dt);
      q.mesh.scale.multiplyScalar(0.96);
      if (q.life <= 0) {
        scene.remove(q.mesh);
        particles.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener('resize', resize);
  return { update, handleEvents, resize, boom, burst };
}

function makeEmbers() {
  const n = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 120;
    pos[i * 3 + 1] = Math.random() * 28;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    vel.push(0.8 + Math.random() * 2.2);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xc4a46a,
      size: 0.28,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  return {
    points,
    tick(dt) {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        a[i * 3 + 1] += vel[i] * dt * 3;
        if (a[i * 3 + 1] > 30) {
          a[i * 3 + 1] = 0;
          a[i * 3] = (Math.random() - 0.5) * 120;
          a[i * 3 + 2] = (Math.random() - 0.5) * 80;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
