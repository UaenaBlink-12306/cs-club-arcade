import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-tests',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
})
after(() => server.close())
const { AirHockeyGame } = await server.ssrLoadModule('/src/games/airHockey.ts')
const { games } = await server.ssrLoadModule('/src/games/index.ts')
const meta = games.find((game) => game.id === 'air-hockey')
const input = (down = [], pressed = []) => ({
  down: new Set(down), pressed: new Set(pressed), released: new Set(),
  pointer: { x: 0, y: 0, down: false, pressed: false, released: false },
  isDown: (...codes) => codes.some((code) => down.includes(code)),
  wasPressed: (...codes) => codes.some((code) => pressed.includes(code)),
})
function game(opponent = 'human') {
  const runtime = new AirHockeyGame(meta)
  runtime.setOpponent(opponent)
  return runtime
}
function shootout(opponent = 'human') {
  const runtime = game(opponent)
  runtime.matchPhase = 'extra'
  runtime.phaseElapsed = 61.99
  runtime.addedMinutes = 1
  runtime.scores = [2, 2]
  runtime.update(0.02, input())
  assert.equal(runtime.matchPhase, 'shootout')
  return runtime
}
function advance(runtime, seconds, frame = input()) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) runtime.update(1 / 120, frame)
}
function attempt(runtime, scored) {
  runtime.resolvePenalty(scored, scored ? 'GOAL!' : 'SAVED!')
  advance(runtime, 1.61)
}
function withRandom(value, callback) {
  const original = Math.random
  Math.random = () => value
  try { return callback() } finally { Math.random = original }
}
function shot(runtime, target, guessRoll = 0.5) {
  if (runtime.penaltyState === 'aiming' && runtime.penaltyTimer < 0.76) advance(runtime, 0.76 - runtime.penaltyTimer)
  runtime.penaltyAimY = target
  withRandom(guessRoll, () => runtime.update(1 / 120, input([], [runtime.penaltyShooter === 0 ? 'Space' : 'Enter'])))
  advance(runtime, 0.8)
}

test('shootout-only starts immediately for either opponent and replay stays in shootout mode', () => {
  for (const opponent of ['ai', 'human']) {
    const runtime = game()
    runtime.setMatchFormat('shootout-only')
    runtime.setOpponent(opponent)
    for (let replay = 0; replay < 2; replay++) {
      assert.equal(runtime.matchPhase, 'shootout')
      assert.equal(runtime.phaseElapsed, 0)
      assert.equal(runtime.serveDelay, 0)
      assert.equal(runtime.penaltyState, 'aiming')
      assert.equal(runtime.penaltyShooter, 0)
      assert.equal(runtime.getHud()[1].value, 'P1 · SHOT 1/5')
      assert.equal(runtime.getHud()[2].label, `${opponent === 'ai' ? 'AI' : 'PLAYER 2'} · PENALTIES`)
      assert.deepEqual(runtime.scores, [0, 0])
      assert.deepEqual(runtime.penaltyAttempts, [[], []])
      assert.equal(runtime.result, null)
      for (let round = 0; round < 3; round++) { attempt(runtime, true); attempt(runtime, false) }
      assert.equal(runtime.result.winnerName, 'PLAYER 1')
      assert.equal(runtime.result.detail, 'PENALTY SHOOTOUT · PENALTIES 3–0')
      runtime.reset()
    }
  }
})

test('full-match formats restore regulation after selecting shootout-only', () => {
  for (const format of ['extra-time', 'penalties']) {
    const runtime = game()
    runtime.setMatchFormat('shootout-only')
    runtime.setMatchFormat(format)
    runtime.setOpponent('human')
    assert.equal(runtime.matchPhase, 'regulation')
    assert.equal(runtime.getHud()[1].label, 'MATCH TIME · 90 MIN')
    runtime.phaseElapsed = 181.99; runtime.addedMinutes = 1
    runtime.update(0.02, input())
    assert.equal(runtime.matchPhase, format === 'extra-time' ? 'extra' : 'shootout')
  }
  const legacy = new AirHockeyGame(meta, 'football')
  legacy.setMatchFormat('shootout-only')
  assert.equal(legacy.matchPhase, 'regulation')
  assert.equal(legacy.getHud()[1].label, 'FIRST TO 5')
})

test('tied regulation includes stoppage before extra time; tied extra time includes stoppage before penalties', () => {
  const runtime = game()
  runtime.phaseElapsed = 179.99; runtime.addedMinutes = 2
  runtime.update(0.02, input())
  assert.equal(runtime.matchPhase, 'regulation')
  runtime.phaseElapsed = 183.99; runtime.update(0.02, input())
  assert.equal(runtime.matchPhase, 'extra')
  runtime.phaseElapsed = 59.99; runtime.addedMinutes = 2
  runtime.update(0.02, input())
  assert.equal(runtime.matchPhase, 'extra')
  runtime.phaseElapsed = 63.99; runtime.update(0.02, input())
  assert.equal(runtime.matchPhase, 'shootout')
  assert.deepEqual(runtime.scores, [0, 0])
})

test('a non-tied regulation or extra-time match ends without penalties', () => {
  for (const phase of ['regulation', 'extra']) {
    const runtime = game()
    runtime.matchPhase = phase; runtime.scores = [3, 2]
    runtime.phaseElapsed = phase === 'regulation' ? 181.99 : 61.99; runtime.addedMinutes = 1
    runtime.update(0.02, input())
    assert.equal(runtime.result.winnerName, 'PLAYER 1')
    assert.deepEqual(runtime.penaltyAttempts, [[], []])
  }
})

test('human controls aim and shoot only on the active player’s turn', () => {
  const runtime = shootout()
  advance(runtime, 0.76)
  runtime.update(0.25, input(['KeyW']))
  assert.equal(runtime.penaltyAimY, 270)
  runtime.update(0.02, input([], ['Enter']))
  assert.equal(runtime.penaltyState, 'aiming')
  runtime.update(0.02, input([], ['Space']))
  assert.equal(runtime.penaltyState, 'flying')
  assert.ok(runtime.puck.vx > 0)
  advance(runtime, 2.5)
  assert.equal(runtime.penaltyShooter, 1)
  advance(runtime, 0.76)
  runtime.update(0.25, input(['ArrowDown']))
  assert.equal(runtime.penaltyAimY, 330)
  runtime.update(0.02, input([], ['Space']))
  assert.equal(runtime.penaltyState, 'aiming')
  runtime.update(0.02, input([], ['Enter']))
  assert.equal(runtime.penaltyState, 'flying')
  assert.ok(runtime.puck.vx < 0)
})

test('a stationary human keeper saves central shots; corners and wide shots resolve in both directions', () => {
  for (const player of [0, 1]) {
    for (const [target, result] of [[300, 'SAVED!'], [242, 'GOAL!'], [400, 'WIDE!']]) {
      const runtime = shootout()
      runtime.penaltyShooter = player; runtime.preparePenalty()
      shot(runtime, target)
      assert.equal(runtime.penaltyMessage, result, `player ${player}, target ${target}`)
      assert.deepEqual(runtime.penaltyAttempts[player], [result === 'GOAL!'])
      assert.deepEqual(runtime.scores, [2, 2])
    }
  }
})

test('a save cannot be counted twice and ends the shot without a rebound', () => {
  const runtime = shootout()
  shot(runtime, 300)
  runtime.resolvePenalty(true, 'GOAL!')
  assert.deepEqual(runtime.penaltyAttempts, [[false], []])
  assert.equal(runtime.puck.vx, 0)
})

test('human penalty attempts have no time limit and can still be aimed and fired after waiting', () => {
  for (const player of [0, 1]) {
    const runtime = shootout()
    runtime.penaltyShooter = player; runtime.preparePenalty()
    advance(runtime, 30)
    assert.equal(runtime.penaltyState, 'aiming')
    assert.equal(runtime.penaltyShooter, player)
    assert.deepEqual(runtime.penaltyAttempts, [[], []])
    assert.equal(runtime.penaltyMessage, '')
    runtime.update(0.1, input([player === 0 ? 'KeyW' : 'ArrowUp']))
    assert.ok(runtime.penaltyAimY < 300)
    runtime.update(1 / 120, input([], [player === 0 ? 'Space' : 'Enter']))
    assert.equal(runtime.penaltyState, 'flying')
    advance(runtime, 0.3)
    assert.equal(runtime.penaltyAttempts[player].length, 1)
    advance(runtime, 1.61)
    assert.equal(runtime.penaltyShooter, 1 - player)
  }
})

test('AI takes an actual shot against the human-controlled keeper', () => {
  const runtime = shootout('ai')
  attempt(runtime, false)
  assert.equal(runtime.penaltyShooter, 1)
  assert.equal(runtime.penaltyState, 'aiming')
  advance(runtime, 1.21)
  assert.equal(runtime.penaltyState, 'flying')
  assert.ok(runtime.puck.vx < 0)
  advance(runtime, 0.8)
  assert.equal(runtime.penaltyAttempts[1].length, 1)
})

test('early clinching works for either team after a 3–0 lead with two shots left', () => {
  for (const winner of [0, 1]) {
    const runtime = shootout()
    for (let round = 0; round < 3; round++) {
      attempt(runtime, winner === 0); attempt(runtime, winner === 1)
    }
    assert.equal(runtime.result.winnerName, `PLAYER ${winner + 1}`)
    assert.deepEqual(runtime.penaltyAttempts.map((attempts) => attempts.length), [3, 3])
    assert.match(runtime.result.detail, /AFTER PENALTIES · 2–2 · PENALTIES/)
  }
})

test('a fifth-shot advantage still allows the opponent’s equalizing shot', () => {
  const runtime = shootout()
  for (let i = 0; i < 8; i++) attempt(runtime, true)
  attempt(runtime, true)
  assert.equal(runtime.result, null)
  assert.equal(runtime.penaltyShooter, 1)
  attempt(runtime, true)
  assert.equal(runtime.result, null)
  assert.equal(runtime.getHud()[1].label, 'SUDDEN DEATH')
})

test('sudden death waits for equal turns, repeats tied pairs, then decides a winner', () => {
  const runtime = shootout('ai')
  // Supply outcomes directly to isolate the competition rules from AI shot accuracy.
  for (let i = 0; i < 12; i++) attempt(runtime, true)
  assert.equal(runtime.result, null)
  assert.deepEqual(runtime.penaltyAttempts.map((attempts) => attempts.length), [6, 6])
  attempt(runtime, false)
  assert.equal(runtime.result, null)
  attempt(runtime, true)
  assert.equal(runtime.result.winnerName, 'AI')
  assert.match(runtime.result.detail, /PENALTIES 6–7/)
})

test('replay resets every shootout field and restores regulation scores and HUD', () => {
  const runtime = shootout()
  attempt(runtime, true)
  runtime.reset()
  assert.equal(runtime.matchPhase, 'regulation')
  assert.deepEqual(runtime.penaltyAttempts, [[], []])
  assert.deepEqual(runtime.scores, [0, 0])
  assert.equal(runtime.penaltyShooter, 0)
  assert.equal(runtime.penaltyTimer, 0)
  assert.equal(runtime.result, null)
  assert.equal(runtime.getHud()[1].label, 'MATCH TIME · 90 MIN')
})

test('legacy football variant remains a first-to-five game', () => {
  const runtime = new AirHockeyGame(meta, 'football')
  runtime.scores = [4, 0]
  runtime.scoreGoal(0)
  assert.match(runtime.result.detail, /FIRST TO FIVE · 5–0/)
})

test('AI strikes a loose ball without taking possession in either hockey variant', () => {
  for (const variant of ['classic', 'football']) {
    const runtime = new AirHockeyGame(meta, variant)
    runtime.serveDelay = 0
    Object.assign(runtime.puck, { x: 800, y: 300, vx: 0, vy: 0 })
    Object.assign(runtime.strikers[1], { x: 850, y: 300, vx: -200, vy: 0 })
    runtime.update(1 / 120, input())
    assert.equal(runtime.holder, -1)
    assert.ok(runtime.puck.vx < 0)
  }
})

test('keepers react more slowly, cover less ground and have a smaller reach', () => {
  const runtime = game()
  Object.assign(runtime.puck, { x: 600, y: 350, vx: 500, vy: 0 })
  runtime.moveGoalies(0.4)
  assert.equal(runtime.goalies[1].y, 300)
  runtime.moveGoalies(0.1)
  assert.ok(runtime.goalies[1].y <= 306.5)
  assert.equal(runtime.goalies[1].r, 12)
})

test('straight-to-penalties skips extra time only after regulation stoppage, in either opponent mode', () => {
  for (const opponent of ['ai', 'human']) {
    const runtime = game(opponent)
    runtime.setDrawRule('penalties')
    runtime.scores = [2, 2]
    runtime.phaseElapsed = 179.99; runtime.addedMinutes = 2
    runtime.update(0.02, input())
    assert.equal(runtime.matchPhase, 'regulation')
    runtime.phaseElapsed = 183.99
    runtime.update(0.02, input())
    assert.equal(runtime.matchPhase, 'shootout')
    assert.deepEqual(runtime.scores, [2, 2])
    assert.deepEqual(runtime.penaltyAttempts, [[], []])
    assert.equal(runtime.penaltyShooter, 0)
    assert.equal(runtime.getHud()[1].label, 'PENALTY SHOOTOUT')
    assert.equal(runtime.result, null)
  }
})

test('straight-to-penalties still ends a non-tied match at full time', () => {
  const runtime = game()
  runtime.setDrawRule('penalties')
  runtime.scores = [1, 2]; runtime.phaseElapsed = 181.99; runtime.addedMinutes = 1
  runtime.update(0.02, input())
  assert.equal(runtime.result.winnerName, 'PLAYER 2')
  assert.match(runtime.result.detail, /FULL TIME · 1–2/)
  assert.deepEqual(runtime.penaltyAttempts, [[], []])
})

test('the chosen draw rule survives opponent selection and replay, and can be changed for a new match', () => {
  const runtime = game()
  runtime.setDrawRule('penalties')
  runtime.setOpponent('ai')
  for (let round = 0; round < 2; round++) {
    runtime.phaseElapsed = 181.99; runtime.addedMinutes = 1
    runtime.update(0.02, input())
    assert.equal(runtime.matchPhase, 'shootout')
    runtime.reset()
    assert.equal(runtime.matchPhase, 'regulation')
    assert.deepEqual(runtime.penaltyAttempts, [[], []])
  }
  runtime.setDrawRule('extra-time')
  runtime.phaseElapsed = 181.99; runtime.addedMinutes = 1
  runtime.update(0.02, input())
  assert.equal(runtime.matchPhase, 'extra')
})

test('keepers track slow incoming balls below the old speed cutoff on both sides', () => {
  for (const side of [0, 1]) {
    const runtime = game()
    const keeper = runtime.goalies[side]
    Object.assign(runtime.puck, { x: keeper.x + (side === 0 ? 60 : -60), y: 340, vx: side === 0 ? -25 : 25, vy: 0 })
    keeper.reaction = 0
    runtime.moveGoalies(0.1)
    assert.equal(keeper.targetY, 340)
    assert.ok(keeper.y > 300)
  }
})

test('goalkeepers predict top, bottom and repeated banks using actual wall physics', () => {
  for (const side of [0, 1]) for (const vy of [-300, 300, 1300, -1300]) {
    const runtime = game()
    const keeper = runtime.goalies[side]
    Object.assign(runtime.puck, { x: 600, y: 300, vx: side === 0 ? -400 : 400, vy })
    keeper.reaction = 0; runtime.moveGoalies(0)
    // Independently integrate the free ball until it crosses the keeper line.
    const ball = { ...runtime.puck }
    const dt = 1 / 2000
    while (side === 0 ? ball.x > keeper.x : ball.x < keeper.x) {
      ball.x += ball.vx * dt; ball.y += ball.vy * dt
      const damping = Math.pow(0.997, dt * 60)
      ball.vx *= damping; ball.vy *= damping
      if (ball.y < 84) { ball.y = 84; ball.vy = Math.abs(ball.vy) * 0.98 }
      if (ball.y > 516) { ball.y = 516; ball.vy = -Math.abs(ball.vy) * 0.98 }
    }
    const target = Math.max(248, Math.min(352, ball.y))
    assert.ok(Math.abs(keeper.targetY - target) < 2, `side ${side}, vy ${vy}: ${keeper.targetY} vs ${target}`)
  }
})

test('AI collects stationary and slowly retreating balls in its half', () => {
  for (const vx of [0, -20, 20]) {
    const runtime = game('ai')
    runtime.serveDelay = 0
    Object.assign(runtime.puck, { x: 660, y: 340, vx, vy: 0 })
    runtime.moveAi(1 / 120)
    assert.ok(runtime.aiTarget.x < 750)
    let struck = false
    for (let i = 0; i < 480; i++) {
      runtime.update(1 / 120, input())
      if (Math.hypot(runtime.puck.vx, runtime.puck.vy) > 100) { struck = true; break }
    }
    assert.ok(struck, `AI should reach and strike ball with vx ${vx}`)
  }
})

test('AI pursues bank shots and intercepts immediate threats beyond its guard line', () => {
  const runtime = game('ai')
  Object.assign(runtime.puck, { x: 600, y: 150, vx: 400, vy: -300 })
  runtime.moveAi(0)
  assert.ok(runtime.aiTarget.x < 950)
  assert.ok(runtime.aiTarget.y > 84 && runtime.aiTarget.y < 516)
  Object.assign(runtime.puck, { x: 990, y: 330, vx: 200, vy: 0 })
  runtime.aiDecisionDelay = 0; runtime.moveAi(0)
  assert.ok(runtime.aiTarget.x > 990)
  assert.equal(runtime.aiTarget.y, 330)
})

test('keepers ignore distant balls that stop short and keep finite targets for vertical motion', () => {
  const runtime = game()
  Object.assign(runtime.puck, { x: 600, y: 350, vx: 5, vy: 100 })
  runtime.goalies.forEach(keeper => { keeper.reaction = 0 })
  runtime.moveGoalies(0)
  assert.ok(runtime.goalies.every(keeper => keeper.targetY === 300))
  runtime.puck.vx = 0
  runtime.goalies.forEach(keeper => { keeper.reaction = 0 })
  runtime.moveGoalies(0)
  assert.ok(runtime.goalies.every(keeper => Number.isFinite(keeper.targetY)))
})


test('AI presses loose balls across midfield instead of retreating after its attack', () => {
  for (const vx of [0, -120, -300, 180]) {
    const runtime = game('ai')
    Object.assign(runtime.puck, { x: 400, y: 340, vx, vy: 0 })
    runtime.moveAi(0)
    assert.ok(runtime.aiTarget.x < 600, `AI should attack in opponent half with vx ${vx}`)
  }
})

test('AI challenges a carrier in the opponent half and attacks incoming balls that miss the goal', () => {
  const runtime = game('ai')
  runtime.holder = 0
  Object.assign(runtime.puck, { x: 350, y: 350, vx: 0, vy: 0 })
  runtime.moveAi(0)
  assert.equal(runtime.aiTarget.x, 375)
  runtime.holder = -1; runtime.aiDecisionDelay = 0
  Object.assign(runtime.puck, { x: 650, y: 120, vx: 250, vy: 0 })
  runtime.moveAi(0)
  assert.ok(runtime.aiTarget.x < 950)
})

test('AI reaches and strikes a stationary ball in the opponent half', () => {
  const runtime = game('ai')
  runtime.serveDelay = 0
  Object.assign(runtime.strikers[0], { x: 200, y: 150 })
  Object.assign(runtime.puck, { x: 400, y: 340, vx: 0, vy: 0 })
  let attacked = false
  for (let i = 0; i < 720; i++) {
    runtime.update(1 / 120, input())
    if (runtime.puck.vx < -80) { attacked = true; break }
  }
  assert.ok(attacked)
})

test('AI keeper commits to an independent guess without tracking aim or puck', () => {
  for (const [roll, expectedGuess] of [[0, -1], [0.5, 0], [0.999, 1]]) {
    const runtime = shootout('ai')
    const keeper = runtime.goalies[1]
    runtime.penaltyAimY = 245
    advance(runtime, 1)
    assert.equal(keeper.y, 300)
    assert.equal(runtime.penaltyKeeperGuess, null)
    withRandom(roll, () => runtime.shootPenalty())
    assert.equal(runtime.penaltyKeeperGuess, expectedGuess)
    const target = keeper.targetY
    runtime.penaltyAimY = 355
    advance(runtime, 0.2)
    assert.equal(keeper.targetY, target)
    assert.equal(runtime.penaltyKeeperGuess, expectedGuess)
  }
})

test('AI matching guesses save all three lanes; wrong guesses concede', () => {
  for (const lane of [-1, 0, 1]) {
    for (const guess of [-1, 0, 1]) {
      const runtime = shootout('ai')
      shot(runtime, 300 + lane * 54, (guess + 1.5) / 3)
      assert.equal(runtime.penaltyMessage, lane === guess ? 'SAVED!' : 'GOAL!', `lane ${lane}, guess ${guess}`)
    }
  }
})

test('AI aims accurate varied shots against independently positioned human keepers', () => {
  let goals = 0
  const targets = []
  for (const aimRoll of [0, 0.2, 0.424, 0.425, 0.6, 0.849, 0.85, 0.999]) {
    for (const keeperY of [246, 300, 354]) {
      const runtime = shootout('ai')
      runtime.penaltyShooter = 1
      withRandom(aimRoll, () => runtime.preparePenalty())
      targets.push(runtime.penaltyAimY)
      assert.ok(runtime.penaltyAimY - runtime.puck.r > runtime.goalTop)
      assert.ok(runtime.penaltyAimY + runtime.puck.r < runtime.goalBottom)
      runtime.goalies[0].y = keeperY
      runtime.shootPenalty()
      assert.equal(runtime.penaltyKeeperGuess, null)
      advance(runtime, 0.8)
      assert.notEqual(runtime.penaltyMessage, 'WIDE!')
      if (runtime.penaltyAttempts[1][0]) goals++
    }
  }
  assert.equal(goals, 16)
  assert.ok(targets.some(y => y < 260))
  assert.ok(targets.some(y => y > 340))
  assert.ok(targets.some(y => Math.abs(y - 300) < 4))
})

test('human keepers move continuously, stop on release, reverse, and stay inside the goal', () => {
  for (const player of [0, 1]) {
    const runtime = shootout()
    runtime.penaltyShooter = player; runtime.preparePenalty()
    const keeper = runtime.goalies[1 - player]
    const up = player === 0 ? 'ArrowUp' : 'KeyW'
    const down = player === 0 ? 'ArrowDown' : 'KeyS'
    runtime.update(0.05, input([up]))
    assert.equal(keeper.y, 289)
    runtime.update(0.05, input())
    assert.equal(keeper.y, 289)
    runtime.update(0.05, input([down]))
    assert.equal(keeper.y, 300)
    runtime.update(0.1, input([up, down]))
    assert.equal(keeper.y, 300)
    advance(runtime, 1, input([up]))
    assert.equal(keeper.y, runtime.goalTop + keeper.r)
    advance(runtime, 1, input([down]))
    assert.equal(keeper.y, runtime.goalBottom - keeper.r)
    const beforeShot = keeper.y
    runtime.shootPenalty()
    assert.equal(keeper.y, beforeShot)
    assert.equal(runtime.penaltyKeeperGuess, null)
    runtime.update(0.025, input([up]))
    assert.ok(keeper.y < beforeShot)
  }
})

test('attacker and keeper controls work simultaneously without swapping roles', () => {
  for (const player of [0, 1]) {
    const runtime = shootout()
    runtime.penaltyShooter = player; runtime.preparePenalty()
    const keeper = runtime.goalies[1 - player]
    const attackerUp = player === 0 ? 'KeyW' : 'ArrowUp'
    const keeperDown = player === 0 ? 'ArrowDown' : 'KeyS'
    runtime.update(0.1, input([attackerUp, keeperDown]))
    assert.equal(runtime.penaltyAimY, 288)
    assert.equal(keeper.y, 322)
    assert.equal(runtime.strikers[1 - player].y, 300)
    runtime.update(0.01, input([], [player === 0 ? 'Enter' : 'Space']))
    assert.equal(runtime.penaltyState, 'aiming')
  }
})

test('ready period lets the keeper position before either human can fire', () => {
  for (const player of [0, 1]) {
    const runtime = shootout()
    runtime.penaltyShooter = player; runtime.preparePenalty()
    const fire = player === 0 ? 'Space' : 'Enter'
    const keeperUp = player === 0 ? 'ArrowUp' : 'KeyW'
    runtime.update(0.01, input([keeperUp], [fire]))
    assert.equal(runtime.penaltyState, 'aiming')
    assert.ok(runtime.goalies[1 - player].y < 300)
    advance(runtime, 0.75)
    runtime.update(1 / 120, input([], [fire]))
    assert.equal(runtime.penaltyState, 'flying')
    assert.ok(Math.abs(Math.hypot(runtime.puck.vx, runtime.puck.vy) - 1700) < 0.001)
  }
})

test('anticipating saves either corner; reacting after 180ms or choosing the wrong side concedes', () => {
  for (const player of [0, 1]) {
    for (const lane of [-1, 1]) {
      for (const fps of [30, 60, 120]) {
        for (const strategy of ['anticipate', 'react', 'wrong']) {
          const runtime = shootout()
          runtime.penaltyShooter = player; runtime.preparePenalty()
          const up = player === 0 ? 'ArrowUp' : 'KeyW'
          const down = player === 0 ? 'ArrowDown' : 'KeyS'
          const move = lane === -1 ? up : down
          if (strategy !== 'react') advance(runtime, 54 / 220, input([strategy === 'anticipate' ? move : lane === -1 ? down : up]))
          runtime.penaltyAimY = 300 + lane * 54
          runtime.shootPenalty()
          for (let frame = 0; frame < fps / 2 && runtime.penaltyState === 'flying'; frame++) {
            runtime.update(1 / fps, input(strategy === 'react' && frame / fps >= 0.18 ? [move] : []))
          }
          assert.equal(runtime.penaltyMessage, strategy === 'anticipate' ? 'SAVED!' : 'GOAL!', `${player}/${lane}/${fps}/${strategy}`)
          assert.equal(runtime.penaltyAttempts[player].length, 1)
          assert.deepEqual(runtime.scores, [2, 2])
        }
      }
    }
  }
})

test('P1 can position their keeper during the AI windup', () => {
  const runtime = shootout('ai')
  runtime.penaltyShooter = 1
  withRandom(0, () => runtime.preparePenalty())
  advance(runtime, 54 / 220, input(['KeyW']))
  advance(runtime, 1)
  assert.equal(runtime.penaltyState, 'flying')
  advance(runtime, 0.3)
  assert.equal(runtime.penaltyMessage, 'SAVED!')
})

test('new attempts and replay reset keeper positions and guesses', () => {
  const runtime = shootout('ai')
  shot(runtime, 245, 0)
  advance(runtime, 1.61)
  assert.equal(runtime.penaltyKeeperGuess, null)
  assert.equal(runtime.goalies[0].y, 300)
  runtime.shootPenalty()
  runtime.reset()
  assert.equal(runtime.penaltyKeeperGuess, null)
  assert.equal(runtime.goalies[0].y, 300)
  assert.equal(runtime.goalies[1].y, 300)
})

test('AI and humans transfer identical momentum at identical contact speeds', () => {
  const speeds = []
  for (const vx of [0, -120, -300]) {
    const outcomes = []
    for (const opponent of ['human', 'ai']) {
      const runtime = game(opponent)
      runtime.serveDelay = 0
      Object.assign(runtime.strikers[0], { x: 250, y: 150 })
      Object.assign(runtime.strikers[1], { x: 750, y: 300, vx, vy: 0 })
      Object.assign(runtime.puck, { x: 700, y: 300, vx: 0, vy: 0 })
      runtime.update(0, input())
      outcomes.push({ vx: runtime.puck.vx, vy: runtime.puck.vy })
    }
    assert.deepEqual(outcomes[1], outcomes[0])
    speeds.push(Math.hypot(outcomes[1].vx, outcomes[1].vy))
  }
  assert.equal(speeds[0], 0, 'stationary contact cannot create energy')
  assert.ok(speeds[2] > speeds[1] && speeds[1] > speeds[0])
})

test('AI uses the same acceleration, drag and speed limit as human movement', () => {
  const runtime = game('ai')
  const human = game('human')
  for (const game of [runtime, human]) {
    game.serveDelay = 0
    Object.assign(game.strikers[1], { x: 850, y: 300, vx: 0, vy: 0 })
    Object.assign(game.puck, { x: 500, y: 300, vx: 0, vy: 0 })
  }
  runtime.aiDecisionDelay = 10
  runtime.aiTarget = { x: 100, y: 300 }
  for (let frame = 0; frame < 30; frame++) {
    runtime.moveAi(1 / 120)
    human.update(1 / 120, input(['ArrowLeft']))
    assert.equal(runtime.strikers[1].vx, human.strikers[1].vx)
    assert.equal(runtime.strikers[1].x, human.strikers[1].x)
  }
})

test('AI closes on a slowly retreating ball and launches it without hovering', () => {
  for (const y of [110, 300, 490]) {
    const runtime = game('ai')
    runtime.serveDelay = 0
    Object.assign(runtime.strikers[0], { x: 200, y: 200 })
    Object.assign(runtime.strikers[1], { x: 840, y, vx: -160, vy: 0 })
    Object.assign(runtime.puck, { x: 700, y, vx: -160, vy: 0 })
    let shot = false
    for (let frame = 0; frame < 180; frame++) {
      runtime.update(1 / 120, input())
      if (runtime.puck.vx < -500) { shot = true; break }
    }
    assert.ok(shot, `AI must strike within 1.5 seconds at y ${y}`)
  }
})

test('contact strikes do not affect human opponents or shoot a distant ball', () => {
  for (const [opponent, gap] of [['human', 55], ['ai', 100]]) {
    const runtime = game(opponent)
    runtime.serveDelay = 0
    Object.assign(runtime.strikers[1], { x: 700 + gap, y: 300, vx: 0, vy: 0 })
    Object.assign(runtime.puck, { x: 700, y: 300, vx: 0, vy: 0 })
    runtime.update(1 / 120, input())
    assert.equal(runtime.puck.vx, 0)
  }
})

test('AI advances through its own half with repeated light physical touches, then attacks in the human half', () => {
  for (const fps of [30, 60, 120]) {
    const runtime = game('ai')
    runtime.serveDelay = 0
    Object.assign(runtime.strikers[0], { x: 200, y: 100 })
    Object.assign(runtime.strikers[1], { x: 1020, y: 300, vx: 0, vy: 0 })
    Object.assign(runtime.puck, { x: 900, y: 300, vx: 0, vy: 0 })
    const ownHalfTouches = []
    let firstTouchAt = Infinity, attackingShot = false
    for (let frame = 0; frame < fps * 4; frame++) {
      const beforeX = runtime.puck.x, beforeVx = runtime.puck.vx
      runtime.update(1 / fps, input())
      const touched = runtime.puck.vx < beforeVx * Math.pow(0.997, 60 / fps) - 2
      if (touched) {
        firstTouchAt = Math.min(firstTouchAt, frame / fps)
        if (beforeX > 600) ownHalfTouches.push(Math.abs(runtime.puck.vx))
        else if (runtime.puck.vx < -400) { attackingShot = true; break }
      }
      assert.equal(runtime.holder, -1, 'control must come from touches, not attaching the ball')
    }
    assert.ok(firstTouchAt < 1.5, `${fps} fps: AI must make contact instead of shadowing`)
    assert.ok(ownHalfTouches.length >= 2, `${fps} fps: expected repeated controlled touches`)
    assert.ok(ownHalfTouches[0] < 250, `${fps} fps: first touch should be gentle`)
    assert.ok(ownHalfTouches.every(speed => speed < 400), `${fps} fps: own-half control must stay light`)
    assert.ok(attackingShot, `${fps} fps: favor a committed shot after crossing midfield`)
  }
})

test('AI favors a momentum-driven shot immediately when starting in the human half', () => {
  const runtime = game('ai')
  runtime.serveDelay = 0
  Object.assign(runtime.strikers[0], { x: 200, y: 100 })
  Object.assign(runtime.strikers[1], { x: 570, y: 300, vx: 0, vy: 0 })
  Object.assign(runtime.puck, { x: 450, y: 300, vx: 0, vy: 0 })
  let shot = false
  for (let frame = 0; frame < 120; frame++) {
    runtime.update(1 / 120, input())
    if (runtime.puck.vx < -400) { shot = true; break }
  }
  assert.ok(shot, 'AI should commit to attacking rather than slow dribbling in the human half')
})
