# CS Club Arcade

A full-screen browser arcade with ten quick, replayable mini-games, designed for a high-school CS club fair. Everything runs locally in the browser: no accounts, backend, ads, or copyrighted game assets.

## The games

- Sumo Circles
- Tank Duel
- Dodge Hell
- Platform Panic
- Mini Golf Chaos
- Gravity Flip
- Slingshot Knockout
- Mini Racing
- Boss Rush
- Tower Stack

Each game has a short ready screen, keyboard or pointer controls, pause and sound controls, instant replay, and a route back to the launcher. The player name, sound preference, and local scoreboards persist in versioned browser storage.

## Run locally

```sh
npm install
npm run dev
```

## Quality checks

```sh
npm run lint
npm run build
```

Built with React, TypeScript, Vite, and Canvas 2D. The launcher is responsive from phone-sized screens to large desktop displays.
