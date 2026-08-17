# Devpost copy — FUSE

Paste / adapt this on the BTT Web Game Jam submission.

## Project name

FUSE

## Tagline

Don't be holding it. Create a room, send the link, play with the judges.

## Built with

JavaScript, Node.js, Express, Socket.io, HTML5 Canvas, Web Audio API

## Description

FUSE is a real-time multiplayer bomb-tag arena that runs in the browser. No accounts, no installs.

The whole game is designed around one judging moment: **you send the judges a link, they join your room, and you play together.**

Someone is holding a live fuse. Bump them to pass it. Throw it if you have to — a bomb on the floor still ticks, and the blast doesn't care who threw it. Holding it makes you slightly faster. It also paints a target on you. Last one standing takes the round. First to 3 takes the match.

2 players is a duel. 4–6 is chaos. Practice vs bots is built in if you open it alone.

### Controls

- **WASD / stick** — move
- **Space / DASH** — dash
- **E / click / THROW** — throw the bomb

### How to play with us (judges)

1. Open the playable link.
2. Type a name and join the room code we send you — or just open the invite URL.
3. We start the match. That's it.

## What's original

Most jam multiplayer games are "watch the video, maybe click a solo demo." FUSE treats the judges as players. The technical work is a server-authoritative 30 Hz sim, interpolation, host migration, and bots — but the creative bet is the social loop: panic, betrayal, a grounded live bomb nobody wants to touch.
