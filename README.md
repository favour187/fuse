# FUSE

**Don't be holding it.**

A real-time multiplayer bomb-tag arena for the browser. Create a room, send the link, play together. Built for the [BTT Web Game Jam — Summer 2026](https://btt-web-game-jam.devpost.com/).

![FUSE](https://img.shields.io/badge/players-2--6-ff5a36) ![stack](https://img.shields.io/badge/stack-Node%20%2B%20Socket.io-ffd166)

## The pitch

Judges shouldn't watch a video of a multiplayer game. They should **open a link and play with you**.

FUSE is built around that moment:

1. Host creates a room — a 4-letter code and a shareable URL.
2. Everyone else joins in one tap. No accounts, no downloads.
3. One live bomb. Pass it by bumping. Dump it with a throw.
4. When the timer hits zero, someone is gone.
5. First to 3 rounds wins.

It works with 2 players as a tense duel and with 4–6 as loud, messy chaos. Practice vs bots is built in for the demo video and for anyone opening the game alone.

## How to play

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Left stick |
| Dash | Space | DASH |
| Throw the bomb | E / click | THROW |

**Rules**

- Someone is always holding the fuse — or it is live on the floor.
- Bump the carrier to make it their problem.
- Throw it if you must. A grounded bomb still ticks, and the blast kills anyone in the ring.
- Holding it makes you a little faster. You are also the brightest target in the room.
- Last player standing takes the round. First to 3 rounds takes the match.

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Share `http://YOUR_LAN_IP:3000/?room=CODE` with people on the same network, or deploy it (below) so judges can join from anywhere.

## Deploy

Any Node host works. The server listens on `0.0.0.0:$PORT`.

**Render / Railway / Fly**

- Start command: `npm start`
- Environment: `PORT` is set for you

**VPS**

```bash
PORT=3000 npm start
```

Put Caddy or nginx in front if you want HTTPS. WebSockets should be proxied through.

## Tech

- **Server-authoritative** simulation at 30 Hz (`game.js`)
- **Socket.io** rooms, host migration, bot players
- **Canvas** renderer with interpolation, squash-and-stretch characters, particles, screen shake
- **Web Audio** procedural SFX — no asset pack, no licenses
- Zero build step. One `npm start`.

```
fuse/
  server.js      HTTP + sockets
  game.js        physics, fuse, bots, rounds
  public/
    index.html   menus + HUD
    styles.css
    client.js    net, input, render, audio
```

## Jam notes

- Built during the BTT Web Game Jam window (Aug 7–21, 2026).
- Original game. Open-source libraries (Express, Socket.io) and AI assistance used as allowed by the rules.
- Team size: 1–4.

## License

MIT
