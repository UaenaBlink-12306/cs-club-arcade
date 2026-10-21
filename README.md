# CS Club Arcade

A full-screen browser arcade with eleven quick, replayable mini-games, designed for a high-school CS club fair. Everything runs locally in the browser: no accounts, backend, ads, or copyrighted game assets.

## The games

- Air Hockey Classic
- Six-a-Side Football
- Tank Duel
- Dodge Hell
- Platform Panic
- Mini Golf Chaos
- Gravity Flip
- Slingshot Knockout
- Mini Racing
- Boss Rush
- Tower Stack

Each game has a ready screen, keyboard or pointer controls, pause and sound controls, replay, and a route back to the launcher. Games pause automatically when the window loses focus or the tab is hidden. The simulation runs at 120 steps per second, independently of the display refresh rate. Dodge Hell and Boss Rush use a 160 ms dash with a two-second cooldown. The sound preference and one device-best result per single-player game persist in versioned browser storage; two-player results stay within the current session.

## Run locally

```sh
npm install
npm run dev
```

## Quality checks

```sh
npm test
npm run lint
npm run build
```

Built with React, TypeScript, Vite, and Canvas 2D. The launcher is responsive from phone-sized screens to large desktop displays.

Hockey AI predicts puck paths, checks which interceptions it can reach, and chooses shooting lanes around the defender and goalkeeper. It shares the human player’s acceleration, drag, speed limit, and contact physics.

The tests cover hockey matches and penalties, AI attack and defense scenarios, fast collisions, cancelled drags, fixed simulation timing, and dash timing.
