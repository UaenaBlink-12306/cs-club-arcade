import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-tests-football', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
after(() => server.close())
const { FootballGame } = await server.ssrLoadModule('/src/games/football.ts')
const { games } = await server.ssrLoadModule('/src/games/index.ts')
const meta = games.find(game => game.id === 'air-hockey-football')
const input = { down: new Set(), released: new Set(), isDown: () => false, wasPressed: () => false }
function game() {
  const runtime = new FootballGame(meta)
  runtime.matchStarted = true
  runtime.restartDelay = 0
  return runtime
}

test('every AI outfielder releases possession toward the opposing goal on the next frame', () => {
  for (const team of [0, 1]) for (const role of [1, 2, 3, 4, 5]) {
    const runtime = game(), index = team * 6 + role
    if (runtime.isHuman(index)) continue
    runtime.holder = index
    runtime.update(1 / 120, input)
    assert.equal(runtime.holder, -1, `AI player ${index} must not carry`)
    assert.ok(runtime.ball.vx * (team === 0 ? 1 : -1) > 0)
  }
})

test('AI receivers immediately hit a loose ball instead of stopping to dribble', () => {
  const runtime = game()
  runtime.holder = -1
  Object.assign(runtime.ball, { x: 800, y: 300, vx: 0, vy: 0 })
  Object.assign(runtime.players[11], { x: 800, y: 300 })
  runtime.update(1 / 120, input)
  assert.equal(runtime.holder, -1)
  assert.ok(runtime.ball.vx < 0)
  assert.ok(Math.hypot(runtime.ball.vx, runtime.ball.vy) > 280)
})

test('an AI tackle sends the ball forward immediately', () => {
  const runtime = game()
  Object.assign(runtime.players[5], { x: 700, y: 300 })
  Object.assign(runtime.players[11], { x: 730, y: 300 })
  runtime.holder = 5
  runtime.tackle(11)
  assert.equal(runtime.holder, -1)
  assert.ok(runtime.ball.vx < 0)
})

test('both human players can still keep possession and dribble', () => {
  for (const index of [5, 11]) {
    const runtime = game()
    runtime.opponent = 'human'
    runtime.holder = index
    runtime.update(1 / 120, input)
    assert.equal(runtime.holder, index)
  }
})

test('calling for a pass still returns the ball to the human', () => {
  const runtime = game()
  runtime.holder = 4
  runtime.calls[0] = 2
  runtime.update(1 / 120, input)
  assert.equal(runtime.holder, -1)
  assert.equal(runtime.passTarget, 5)
  assert.equal(runtime.passes[0], 1)
})

test('a shot beyond the smaller keeper reach can score in either direction', () => {
  for (const team of [0, 1]) {
    const runtime = game()
    runtime.players.forEach((p, i) => { if (i % 6 !== 0) { p.x = 600; p.y = 100 + i * 25 } })
    runtime.holder = -1
    Object.assign(runtime.ball, { x: team === 0 ? 1060 : 140, y: 318, vx: team === 0 ? 700 : -700, vy: 0 })
    for (let i = 0; i < 30 && runtime.scores[team] === 0; i++) runtime.update(1 / 120, input)
    assert.equal(runtime.scores[team], 1)
  }
})
