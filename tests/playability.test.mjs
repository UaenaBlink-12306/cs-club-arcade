import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-playability-tests', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
after(() => server.close())
const { MiniGolfGame } = await server.ssrLoadModule('/src/games/miniGolf.ts')
const { SlingshotGame } = await server.ssrLoadModule('/src/games/slingshot.ts')
const { games } = await server.ssrLoadModule('/src/games/index.ts')
const frame = (pointer = {}) => ({ down: new Set(), pressed: new Set(), released: new Set(), pointer: { x: 0, y: 0, down: false, pressed: false, released: false, ...pointer }, isDown: () => false, wasPressed: () => false })

test('an interrupted golf drag is cancelled and cannot launch a later accidental shot', () => {
  const runtime = new MiniGolfGame(games.find(game => game.id === 'mini-golf'))
  runtime.update(1 / 120, frame({ x: 190, y: 300, down: true, pressed: true }))
  runtime.update(1 / 120, frame({ x: 90, y: 300, down: true }))
  // Input is cleared when the window loses focus or the browser cancels a touch.
  runtime.update(1 / 120, frame())
  runtime.update(1 / 120, frame({ x: 90, y: 300, released: true }))
  assert.equal(runtime.strokes, 0)
  assert.equal(runtime.ball.vx, 0)
})

test('an interrupted slingshot drag cannot launch or consume the player’s turn', () => {
  const runtime = new SlingshotGame(games.find(game => game.id === 'slingshot'))
  runtime.update(1 / 120, frame({ x: 255, y: 300, down: true, pressed: true }))
  runtime.update(1 / 120, frame({ x: 155, y: 300, down: true }))
  runtime.update(1 / 120, frame())
  runtime.update(1 / 120, frame({ x: 155, y: 300, released: true }))
  assert.equal(runtime.shotInProgress, false)
  assert.equal(runtime.current, 0)
  assert.equal(runtime.players[0].vx, 0)
})

const { FixedStepClock } = await server.ssrLoadModule('/src/core/FixedStepClock.ts')
test('simulation advances at the same rate on slow and fast displays', () => {
  for (const fps of [15, 30, 60, 144]) {
    const clock = new FixedStepClock()
    let simulated = 0
    for (let i = 0; i < fps * 2; i++) clock.advance(1 / fps, dt => { simulated += dt })
    assert.ok(Math.abs(simulated - 2) < 0.000001, `${fps} fps: simulated ${simulated} seconds`)
  }
})
test('resetting the simulation clock drops partial time and limits long stalls', () => {
  const clock = new FixedStepClock()
  let steps = 0
  clock.advance(1 / 240, () => steps++)
  clock.reset()
  clock.advance(1 / 240, () => steps++)
  assert.equal(steps, 0)
  clock.advance(30, () => steps++)
  assert.ok(steps <= 30, 'a suspended tab must not fast-forward through the round')
})

for (const [id, modulePath, className, speed, dashSpeed] of [
  ['dodge-hell', '/src/games/dodgeHell.ts', 'DodgeHellGame', 290, 870],
  ['boss-rush', '/src/games/bossRush.ts', 'BossRushGame', 285, 850],
]) {
  const module = await server.ssrLoadModule(modulePath)
  test(`${id} dash lasts 160ms and travels the same distance at every update rate`, () => {
    for (const fps of [30, 60, 120, 144]) {
      const runtime = new module[className](games.find(game => game.id === id))
      const start = runtime.player.x
      for (let i = 0; i < fps / 2; i++) {
        runtime.update(1 / fps, { ...frame(), down: new Set(['KeyD']), wasPressed: code => i === 0 && code === 'Space' })
      }
      assert.ok(Math.abs(runtime.player.x - start - (speed * 0.5 + (dashSpeed - speed) * 0.16)) < 0.01, `${fps} fps: a dash must be a timed burst`)
      const after = runtime.player.x
      runtime.update(1 / fps, { ...frame(), down: new Set(['KeyD']), wasPressed: () => true })
      assert.ok(Math.abs(runtime.player.x - after - speed / fps) < 0.01, 'cooldown prevents another dash')
      runtime.reset()
      assert.equal(runtime.dashRemaining, 0)
    }
  })
}
