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
function shot(runtime, target) {
  runtime.penaltyAimY = target
  runtime.update(1 / 120, input([], [runtime.penaltyShooter === 0 ? 'Space' : 'Enter']))
  advance(runtime, 0.8)
}

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
  runtime.update(0.25, input(['KeyW']))
  assert.equal(runtime.penaltyAimY, 270)
  runtime.update(0.02, input([], ['Enter']))
  assert.equal(runtime.penaltyState, 'aiming')
  runtime.update(0.02, input([], ['Space']))
  assert.equal(runtime.penaltyState, 'flying')
  assert.ok(runtime.puck.vx > 0)
  advance(runtime, 2.5)
  assert.equal(runtime.penaltyShooter, 1)
  runtime.update(0.25, input(['ArrowDown']))
  assert.equal(runtime.penaltyAimY, 330)
  runtime.update(0.02, input([], ['Space']))
  assert.equal(runtime.penaltyState, 'aiming')
  runtime.update(0.02, input([], ['Enter']))
  assert.equal(runtime.penaltyState, 'flying')
  assert.ok(runtime.puck.vx < 0)
})

test('robot keeper saves central shots; corner goals and wide shots resolve in both directions', () => {
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

test('failing to shoot within ten seconds counts as one miss and passes the turn', () => {
  const runtime = shootout()
  advance(runtime, 10.01)
  assert.equal(runtime.penaltyMessage, 'TIME UP')
  assert.deepEqual(runtime.penaltyAttempts, [[false], []])
  advance(runtime, 1.61)
  assert.equal(runtime.penaltyShooter, 1)
})

test('AI takes an actual shot against the human team’s robot keeper', () => {
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
