import { BaseGame } from '../core/BaseGame'
import { clamp, normalize, type Vec2 } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, axis, clearArena, drawPlayer, moveBody, resolveCircleCollision, type Body } from './common'

interface Striker extends Body { color: string; label: string }
interface Puck extends Body { color: string }
interface Goalie extends Body { color: string; anchorX: number; targetY: number; reaction: number; recovery: number }

const LEFT = 92
const RIGHT = 1108
const TOP = 66
const BOTTOM = 534
const CREASE_DEPTH = 105
const GOALIE_RADIUS = 16
const GOALIE_REACTION = 0.32
const GOALIE_SPEED = 95
const GOALIE_RECOVERY = 1.1
const WIN_SCORE = 5
const CLASSIC_MATCH_MINUTES = 90
const REAL_SECONDS_PER_GAME_MINUTE = 2
const EXTRA_TIME_MINUTES = 30
const CLASSIC_MATCH_SECONDS = CLASSIC_MATCH_MINUTES * REAL_SECONDS_PER_GAME_MINUTE
const EXTRA_TIME_SECONDS = EXTRA_TIME_MINUTES * REAL_SECONDS_PER_GAME_MINUTE
const AI_GUARD_X = 950
const CONTROL_REACH = 70
const BALL_OFFSET = 57
const KICK_SPEED = 650
const TACKLE_REACH = 108
const AI_TACKLE_REACH = 94
const TACKLE_BALL_SPEED = 130
const TACKLE_SLOW_TIME = 0.22
const AI_MOVE_SPEED = 320
const AI_CARRY_SPEED = 260
const AI_ACCELERATION = 650

export type HockeyOpponent = 'ai' | 'human'
export type HockeyDrawRule = 'extra-time' | 'penalties'
export type HockeyVariant = 'classic' | 'football'

const PUCK_DRAG = -60 * Math.log(0.997)

// Travel is time integrated over drag, so both axes slow together. Each bank
// loses another 2% of vertical velocity, just like the arena collision.
function projectPuck(puck: Body, travel: number) {
  const low = TOP + puck.r, high = BOTTOM - puck.r
  let y = clamp(puck.y, low, high), vy = puck.vy, remaining = Math.max(0, travel)
  while (Math.abs(vy) > 0.0001 && remaining > 0) {
    const wall = vy > 0 ? high : low
    const toWall = (wall - y) / vy
    if (toWall > remaining) break
    y = wall; remaining -= toWall; vy *= -0.98
  }
  return { x: puck.x + puck.vx * travel, y: y + vy * remaining }
}

function predictCrossing(puck: Body, x: number, drag = PUCK_DRAG) {
  if (Math.abs(puck.vx) < 0.0001) return null
  const travel = (x - puck.x) / puck.vx
  // Do not invent an interception beyond the ball's stopping distance.
  if (travel < 0 || (drag > 0 && travel >= 1 / drag)) return null
  return projectPuck(puck, travel)
}

export class AirHockeyGame extends BaseGame {
  private strikers: [Striker, Striker] = [] as unknown as [Striker, Striker]
  private goalies: Goalie[] = []
  private puck: Puck = { x: 600, y: 300, vx: 0, vy: 0, r: 18, mass: 0.35, color: COLORS.text }
  private scores: [number, number] = [0, 0]
  private matchPhase: 'regulation' | 'extra' | 'shootout' = 'regulation'
  private penaltyAttempts: [boolean[], boolean[]] = [[], []]
  private penaltyShooter: 0 | 1 = 0
  private penaltyState: 'aiming' | 'flying' | 'result' = 'aiming'
  private penaltyTimer = 0
  private penaltyAimY = 300
  private penaltyMessage = ''
  private penaltyKeeperGuess: -1 | 0 | 1 | null = null
  private phaseElapsed = 0
  private lostTime = 0
  private addedMinutes = 0
  private serveDelay = 0
  private serveDirection = 1
  private scorer = -1
  private opponent: HockeyOpponent = 'ai'
  private drawRule: HockeyDrawRule = 'extra-time'
  private aiTarget = { x: AI_GUARD_X, y: 300 }
  private aiDecisionDelay = 0
  private aiWantsControl = false
  private aiCarryTime = 0
  private holder: -1 | 0 | 1 = -1
  private controlCooldown = 0
  private tackleSlowTime = 0
  private tackleCooldown: [number, number] = [0, 0]
  private facing: [Vec2, Vec2] = [{ x: 1, y: 0 }, { x: -1, y: 0 }]

  constructor(meta: GameMeta, readonly variant: HockeyVariant = 'classic') { super(meta); this.reset() }

  private get goalTop() { return this.variant === 'football' ? 190 : 218 }
  private get goalBottom() { return this.variant === 'football' ? 410 : 382 }
  private get creaseTop() { return this.goalTop - 50 }
  private get creaseBottom() { return this.goalBottom + 50 }

  setOpponent(opponent: HockeyOpponent) {
    this.opponent = opponent
    this.reset()
  }

  setDrawRule(rule: HockeyDrawRule) {
    this.drawRule = rule
    this.reset()
  }

  reset() {
    this.penaltyAttempts = [[], []]; this.penaltyShooter = 0; this.penaltyState = 'aiming'; this.penaltyTimer = 0; this.penaltyAimY = 300; this.penaltyMessage = ''
    this.penaltyKeeperGuess = null
    this.matchPhase = 'regulation'; this.phaseElapsed = 0; this.lostTime = 0; this.addedMinutes = 0
    this.result = null; this.elapsed = 0; this.scores = [0, 0]; this.scorer = -1; this.serveDirection = Math.random() < 0.5 ? -1 : 1; this.particles.clear(); this.resetFaceoff(1.25)
  }

  private resetFaceoff(delay: number) {
    this.strikers = [
      { x: 335, y: 300, vx: 0, vy: 0, r: 34, mass: 3, color: COLORS.cyan, label: 'P1' },
      { x: 865, y: 300, vx: 0, vy: 0, r: 34, mass: 3, color: COLORS.coral, label: 'P2' },
    ]
    this.goalies = [
      { x: LEFT + 35, anchorX: LEFT + 35, y: 300, vx: 0, vy: 0, r: GOALIE_RADIUS, mass: 80, color: COLORS.cyan, targetY: 300, reaction: GOALIE_REACTION, recovery: 0 },
      { x: RIGHT - 35, anchorX: RIGHT - 35, y: 300, vx: 0, vy: 0, r: GOALIE_RADIUS, mass: 80, color: COLORS.coral, targetY: 300, reaction: GOALIE_REACTION, recovery: 0 },
    ]
    Object.assign(this.puck, { x: 600, y: 300, vx: 0, vy: 0 })
    this.serveDelay = delay
    this.aiTarget = { x: AI_GUARD_X, y: 300 }
    this.aiDecisionDelay = 0
    this.aiWantsControl = false
    this.aiCarryTime = 0
    this.holder = -1
    this.controlCooldown = 0
    this.tackleSlowTime = 0
    this.tackleCooldown = [0, 0]
    this.facing = [{ x: 1, y: 0 }, { x: -1, y: 0 }]
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    if (this.matchPhase === 'shootout') { this.updateShootout(dt, input); return }
    if (this.variant === 'classic' && this.updateMatchClock(dt)) return
    if (this.serveDelay > 0) {
      this.serveDelay -= dt
      if (this.serveDelay <= 0) {
        this.puck.vx = this.serveDirection * 360
        this.puck.vy = (Math.random() - 0.5) * 190
        this.scorer = -1
      }
      return
    }

    const p1X = axis(input.down, 'KeyA', 'KeyD')
    const p1Y = axis(input.down, 'KeyW', 'KeyS')
    this.updateFacing(0, p1X, p1Y)
    moveBody(this.strikers[0], p1X, p1Y, dt, 1050, this.holder === 0 ? 340 : 500, 0.82)
    if (this.opponent === 'ai') this.moveAi(dt)
    else {
      const p2X = axis(input.down, 'ArrowLeft', 'ArrowRight')
      const p2Y = axis(input.down, 'ArrowUp', 'ArrowDown')
      this.updateFacing(1, p2X, p2Y)
      moveBody(this.strikers[1], p2X, p2Y, dt, 1050, this.holder === 1 ? 340 : 500, 0.82)
    }
    resolveCircleCollision(this.strikers[0], this.strikers[1], 0.5)
    this.strikers.forEach((striker) => this.keepStrikerInArena(striker))
    this.moveGoalies(dt)

    this.controlCooldown = Math.max(0, this.controlCooldown - dt)
    this.tackleSlowTime = Math.max(0, this.tackleSlowTime - dt)
    this.tackleCooldown = this.tackleCooldown.map((time) => Math.max(0, time - dt)) as [number, number]
    const wantsControl: [boolean, boolean] = this.variant === 'football'
      ? [input.isDown('Space'), this.opponent === 'ai' ? this.aiWantsControl : input.isDown('Enter')]
      : [false, false]
    if (this.holder !== -1) {
      const defenderIndex = (1 - this.holder) as 0 | 1
      const defender = this.strikers[defenderIndex]
      const owner = this.strikers[this.holder]
      const tacklePressed = defenderIndex === 0 ? input.wasPressed('Space') : this.opponent === 'ai' ? this.aiWantsControl : input.wasPressed('Enter')
      const reach = defenderIndex === 1 && this.opponent === 'ai' ? AI_TACKLE_REACH : TACKLE_REACH
      if (tacklePressed && this.tackleCooldown[defenderIndex] === 0 && Math.hypot(owner.x - defender.x, owner.y - defender.y) < reach) {
        this.tackleBall(defenderIndex)
        return
      }
    }
    let releasedBy = -1
    if (this.holder !== -1 && !wantsControl[this.holder]) {
      releasedBy = this.holder
      this.kickBall(this.holder)
    }
    if (this.holder === -1 && releasedBy === -1 && this.controlCooldown === 0 && Math.hypot(this.puck.vx, this.puck.vy) < 560) {
      const catcher = this.strikers.findIndex((striker, index) => wantsControl[index] && Math.hypot(striker.x - this.puck.x, striker.y - this.puck.y) < CONTROL_REACH)
      if (catcher !== -1) {
        this.holder = catcher as 0 | 1
        this.aiCarryTime = 0
        this.tackleSlowTime = 0
        this.particles.burst(this.puck.x, this.puck.y, this.strikers[catcher].color, 7, 85)
      }
    }
    if (this.holder !== -1) {
      const owner = this.strikers[this.holder]
      const defender = this.strikers[1 - this.holder]
      const direction = this.facing[this.holder]
      this.puck.x = owner.x + direction.x * BALL_OFFSET
      this.puck.y = clamp(owner.y + direction.y * BALL_OFFSET, TOP + this.puck.r, BOTTOM - this.puck.r)
      this.puck.vx = owner.vx; this.puck.vy = owner.vy
      if (this.holder === 1) this.aiCarryTime += dt
      const inGoal = this.puck.y > this.goalTop && this.puck.y < this.goalBottom
      if (inGoal && this.puck.x - this.puck.r < LEFT) { this.scoreGoal(1); return }
      if (inGoal && this.puck.x + this.puck.r > RIGHT) { this.scoreGoal(0); return }
      this.puck.x = clamp(this.puck.x, LEFT + this.puck.r, RIGHT - this.puck.r)

      const dx = this.puck.x - defender.x
      const dy = this.puck.y - defender.y
      const distance = Math.hypot(dx, dy)
      if (distance < defender.r + this.puck.r) {
        this.tackleBall((1 - this.holder) as 0 | 1)
      }
      return
    }

    this.puck.x += this.puck.vx * dt
    this.puck.y += this.puck.vy * dt
    const damping = Math.pow(0.997, dt * 60)
    this.puck.vx *= damping; this.puck.vy *= damping

    if (this.puck.y - this.puck.r < TOP) { this.puck.y = TOP + this.puck.r; this.puck.vy = Math.abs(this.puck.vy) * 0.98; this.wallHit() }
    if (this.puck.y + this.puck.r > BOTTOM) { this.puck.y = BOTTOM - this.puck.r; this.puck.vy = -Math.abs(this.puck.vy) * 0.98; this.wallHit() }
    this.goalies.forEach((goalie, index) => {
      if (goalie.recovery > 0.45) return
      const incoming = index === 0 ? this.puck.vx < 0 : this.puck.vx > 0
      const impulse = resolveCircleCollision(goalie, this.puck, 0.92)
      goalie.x = goalie.anchorX
      goalie.vx = 0
      goalie.y = clamp(goalie.y, this.goalTop + 30, this.goalBottom - 30)
      if (impulse <= 0 || !incoming) return
      this.puck.vx = (index === 0 ? 1 : -1) * Math.max(170, Math.abs(this.puck.vx) * 0.72)
      goalie.recovery = GOALIE_RECOVERY
      this.particles.burst(this.puck.x, this.puck.y, goalie.color, 14, 190)
      this.impact(5)
    })
    const inGoal = this.puck.y > this.goalTop && this.puck.y < this.goalBottom
    if (this.puck.x - this.puck.r < LEFT) {
      if (inGoal) { this.scoreGoal(1); return }
      this.puck.x = LEFT + this.puck.r; this.puck.vx = Math.abs(this.puck.vx) * 0.98; this.wallHit()
    }
    if (this.puck.x + this.puck.r > RIGHT) {
      if (inGoal) { this.scoreGoal(0); return }
      this.puck.x = RIGHT - this.puck.r; this.puck.vx = -Math.abs(this.puck.vx) * 0.98; this.wallHit()
    }

    this.strikers.forEach((striker, index) => {
      if (index === releasedBy) return
      const impulse = resolveCircleCollision(striker, this.puck, 1.12)
      if (impulse <= 0) return
      this.puck.vx += striker.vx * 0.18; this.puck.vy += striker.vy * 0.18
      const speed = Math.hypot(this.puck.vx, this.puck.vy)
      if (speed > 820) { this.puck.vx = this.puck.vx / speed * 820; this.puck.vy = this.puck.vy / speed * 820 }
      this.particles.burst(this.puck.x, this.puck.y, striker.color, 12, Math.min(280, impulse)); this.impact(Math.min(7, impulse / 55))
    })
    if (this.tackleSlowTime > 0) {
      const speed = Math.hypot(this.puck.vx, this.puck.vy)
      if (speed > TACKLE_BALL_SPEED) {
        this.puck.vx = this.puck.vx / speed * TACKLE_BALL_SPEED
        this.puck.vy = this.puck.vy / speed * TACKLE_BALL_SPEED
      }
    }
  }

  private get periodSeconds() {
    return this.matchPhase === 'extra' ? EXTRA_TIME_SECONDS : CLASSIC_MATCH_SECONDS
  }

  private updateMatchClock(dt: number) {
    const remaining = Math.max(0, this.periodSeconds - this.phaseElapsed)
    // Recover face-off time lost during the timed period; freeze the allowance at stoppage time.
    this.lostTime += Math.min(dt, remaining, Math.max(0, this.serveDelay))
    this.phaseElapsed += dt
    if (this.phaseElapsed < this.periodSeconds) return false
    if (this.addedMinutes === 0) {
      this.addedMinutes = Math.max(1, Math.ceil(this.lostTime / REAL_SECONDS_PER_GAME_MINUTE))
    }
    const end = this.periodSeconds + this.addedMinutes * REAL_SECONDS_PER_GAME_MINUTE
    if (this.phaseElapsed < end) return false
    this.phaseElapsed = end
    if (this.scores[0] !== this.scores[1]) {
      this.finishClassic(this.scores[0] > this.scores[1] ? 0 : 1)
    } else {
      this.matchPhase = this.matchPhase === 'regulation' && this.drawRule === 'extra-time' ? 'extra' : 'shootout'
      this.phaseElapsed = 0; this.lostTime = 0; this.addedMinutes = 0; this.scorer = -1
      if (this.matchPhase === 'shootout') this.preparePenalty()
      else this.resetFaceoff(1.25)
    }
    return true
  }

  private finishClassic(player: number) {
    const winnerName = player === 1 && this.opponent === 'ai' ? 'AI' : `PLAYER ${player + 1}`
    const stage = this.matchPhase === 'shootout' ? 'AFTER PENALTIES'
      : this.matchPhase === 'extra' ? 'AFTER EXTRA TIME' : 'FULL TIME'
    const penalties = this.matchPhase === 'shootout' ? ` · PENALTIES ${this.penaltyGoals(0)}–${this.penaltyGoals(1)}` : ''
    this.finish({ headline: `${winnerName} WINS`, detail: `${stage} · ${this.scores[0]}–${this.scores[1]}${penalties}`, score: 1, winnerName })
  }

  private penaltyGoals(player: 0 | 1) {
    return this.penaltyAttempts[player].filter(Boolean).length
  }

  private preparePenalty() {
    this.resetFaceoff(0)
    this.penaltyState = 'aiming'
    this.penaltyTimer = 0
    this.penaltyMessage = ''
    this.penaltyAimY = 300
    this.penaltyKeeperGuess = null
    const direction = this.penaltyShooter === 0 ? 1 : -1
    this.puck.x = 600 + direction * 200
    const striker = this.strikers[this.penaltyShooter]
    striker.x = this.puck.x - direction * 60
    // The other striker and the shooter's own goalkeeper sit out this attempt.
    if (this.penaltyShooter === 1 && this.opponent === 'ai') {
      // Favor accurate corners, with occasional central shots to stay unpredictable.
      // Pick the shot before the keeper guesses, without reading its decision.
      const choice = Math.random()
      const corner = (this.goalBottom - this.goalTop) / 2 - this.puck.r - 10
      const lane = choice < 0.425 ? -1 : choice < 0.85 ? 1 : 0
      this.penaltyAimY = 300 + lane * corner + (Math.random() - 0.5) * 6
    }
  }

  private shootPenalty() {
    this.penaltyState = 'flying'
    this.penaltyTimer = 0
    // Commit once at the kick: no following the aim or tracking the flying puck.
    this.penaltyKeeperGuess = (Math.floor(Math.random() * 3) - 1) as -1 | 0 | 1
    const goalkeeper = this.goalies[1 - this.penaltyShooter]
    const reach = (this.goalBottom - this.goalTop) / 2 - this.puck.r - 16
    const perspective = this.penaltyShooter === 0 ? 1 : -1
    goalkeeper.targetY = 300 + this.penaltyKeeperGuess * reach * perspective
    const targetX = this.penaltyShooter === 0 ? RIGHT : LEFT
    const direction = normalize({ x: targetX - this.puck.x, y: this.penaltyAimY - this.puck.y })
    this.puck.vx = direction.x * KICK_SPEED
    this.puck.vy = direction.y * KICK_SPEED
    this.particles.burst(this.puck.x, this.puck.y, this.strikers[this.penaltyShooter].color, 12, 160)
    this.impact(3)
  }

  private resolvePenalty(scored: boolean, message: string) {
    if (this.penaltyState === 'result') return
    this.penaltyAttempts[this.penaltyShooter].push(scored)
    this.penaltyState = 'result'
    this.penaltyTimer = 0
    this.penaltyMessage = message
    this.puck.vx = 0; this.puck.vy = 0
    this.particles.burst(this.puck.x, this.puck.y, scored ? this.strikers[this.penaltyShooter].color : COLORS.text, scored ? 42 : 16, scored ? 390 : 180)
    this.impact(scored ? 10 : 4)
  }

  private updateShootout(dt: number, input: InputFrame) {
    this.penaltyTimer += dt
    if (this.penaltyState === 'result') {
      if (this.penaltyTimer < 1.6) return
      const [a, b] = this.penaltyAttempts.map((attempts) => attempts.length)
      const p1 = this.penaltyGoals(0), p2 = this.penaltyGoals(1)
      const decided = a >= 5 && b >= 5
        ? a === b && p1 !== p2
        : p1 > p2 + Math.max(0, 5 - b) || p2 > p1 + Math.max(0, 5 - a)
      if (decided) { this.finishClassic(p1 > p2 ? 0 : 1); return }
      this.penaltyShooter = this.penaltyShooter === 0 ? 1 : 0
      this.preparePenalty()
      return
    }
    if (this.penaltyState === 'aiming') {
      if (this.penaltyShooter === 1 && this.opponent === 'ai') {
        if (this.penaltyTimer >= 1.2) this.shootPenalty()
        return
      }
      const movement = this.penaltyShooter === 0 ? axis(input.down, 'KeyW', 'KeyS') : axis(input.down, 'ArrowUp', 'ArrowDown')
      this.penaltyAimY = clamp(this.penaltyAimY + movement * 120 * dt, this.goalTop - 60, this.goalBottom + 60)
      if (input.wasPressed(this.penaltyShooter === 0 ? 'Space' : 'Enter')) this.shootPenalty()
      else if (this.penaltyTimer >= 10) this.resolvePenalty(false, 'TIME UP')
      return
    }
    // Small physics steps prevent a fast shot from tunnelling through the robot goalkeeper.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const step = dt / steps
    const goalkeeper = this.goalies[1 - this.penaltyShooter]
    const direction = this.penaltyShooter === 0 ? 1 : -1
    for (let i = 0; i < steps; i++) {
      const previousY = goalkeeper.y
      goalkeeper.y += clamp(goalkeeper.targetY - goalkeeper.y, -220 * step, 220 * step)
      goalkeeper.vy = (goalkeeper.y - previousY) / step
      this.puck.x += this.puck.vx * step
      this.puck.y += this.puck.vy * step
      if (Math.hypot(this.puck.x - goalkeeper.x, this.puck.y - goalkeeper.y) <= this.puck.r + goalkeeper.r) {
        this.resolvePenalty(false, 'SAVED!'); return
      }
      if (direction > 0 ? this.puck.x + this.puck.r >= RIGHT : this.puck.x - this.puck.r <= LEFT) {
        const scored = this.puck.y - this.puck.r > this.goalTop && this.puck.y + this.puck.r < this.goalBottom
        this.resolvePenalty(scored, scored ? 'GOAL!' : 'WIDE!'); return
      }
      if (this.puck.y - this.puck.r <= TOP || this.puck.y + this.puck.r >= BOTTOM) {
        this.resolvePenalty(false, 'WIDE!'); return
      }
    }
    if (this.penaltyTimer >= 3) this.resolvePenalty(false, 'MISSED!')
  }

  private drawShootout(ctx: CanvasRenderingContext2D) {
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text
    ctx.font = '800 28px Arial Narrow'
    const shooter = this.penaltyShooter === 1 && this.opponent === 'ai' ? 'AI' : `PLAYER ${this.penaltyShooter + 1}`
    ctx.fillText(this.penaltyState === 'result' ? `${shooter} · ${this.penaltyMessage}` : `${shooter} vs ROBOT GOALKEEPER`, 600, 45)
    ctx.font = '700 20px Arial Narrow'
    ctx.fillStyle = COLORS.muted
    const guess = this.penaltyKeeperGuess === null ? 'KEEPER GUESSES LEFT, CENTER OR RIGHT' : `KEEPER GUESSED ${this.penaltyKeeperGuess === -1 ? 'LEFT' : this.penaltyKeeperGuess === 1 ? 'RIGHT' : 'CENTER'}`
    ctx.fillText(guess, 600, 178)
    ctx.fillStyle = COLORS.text
    const aiTurn = this.penaltyShooter === 1 && this.opponent === 'ai'
    const controls = this.penaltyShooter === 0 ? 'W / S AIM · SPACE SHOOT' : '↑ / ↓ AIM · ENTER SHOOT'
    ctx.fillText(this.penaltyState === 'aiming' ? aiTurn ? 'AI IS LINING UP A SHOT…' : `${controls} · ${Math.max(0, Math.ceil(10 - this.penaltyTimer))}s` : 'FIVE SHOTS EACH · THEN SUDDEN DEATH', 600, 574)
    if (this.penaltyState === 'aiming' && !aiTurn) {
      const targetX = this.penaltyShooter === 0 ? RIGHT : LEFT
      ctx.strokeStyle = this.strikers[this.penaltyShooter].color; ctx.lineWidth = 3; ctx.setLineDash([8, 10]); ctx.globalAlpha = 0.75
      ctx.beginPath(); ctx.moveTo(this.puck.x, this.puck.y); ctx.lineTo(targetX, this.penaltyAimY); ctx.stroke(); ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(targetX, this.penaltyAimY, 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1
    }
    this.penaltyAttempts.forEach((attempts, player) => {
      // Keep the current sudden-death pair visible without overflowing the rink.
      const currentAttempt = Math.max(this.penaltyAttempts[0].length, this.penaltyAttempts[1].length) - (this.penaltyState === 'result' ? 1 : 0)
      const start = Math.max(0, Math.floor(currentAttempt / 5) * 5)
      const x = player === 0 ? 300 : 780
      ctx.fillStyle = this.strikers[player].color; ctx.font = '700 18px Arial Narrow'
      ctx.fillText(`${player === 1 && this.opponent === 'ai' ? 'AI' : `P${player + 1}`} · ${this.scores[player]} AT ${this.drawRule === 'penalties' ? CLASSIC_MATCH_MINUTES : CLASSIC_MATCH_MINUTES + EXTRA_TIME_MINUTES} MIN`, x + 60, 115)
      for (let i = 0; i < 5; i++) {
        const result = attempts[start + i]
        ctx.beginPath(); ctx.arc(x + i * 30, 142, 9, 0, Math.PI * 2)
        ctx.strokeStyle = this.strikers[player].color; ctx.lineWidth = 2
        if (result !== undefined) { ctx.fillStyle = result ? this.strikers[player].color : '#667080'; ctx.fill() }
        ctx.stroke()
      }
    })
    ctx.restore()
  }

  private updateFacing(player: 0 | 1, x: number, y: number) {
    if (x || y) this.facing[player] = normalize({ x, y })
  }

  private kickBall(player: 0 | 1) {
    const striker = this.strikers[player]
    const direction = this.facing[player]
    this.puck.x = striker.x + direction.x * BALL_OFFSET
    this.puck.y = clamp(striker.y + direction.y * BALL_OFFSET, TOP + this.puck.r, BOTTOM - this.puck.r)
    this.puck.vx = direction.x * KICK_SPEED + striker.vx * 0.35
    this.puck.vy = direction.y * KICK_SPEED + striker.vy * 0.35
    this.holder = -1
    this.controlCooldown = 0.22
    this.tackleSlowTime = 0
    this.aiCarryTime = 0
    this.particles.burst(this.puck.x, this.puck.y, striker.color, 15, 170)
    this.impact(4)
  }

  private tackleBall(defenderIndex: 0 | 1) {
    const defender = this.strikers[defenderIndex]
    const owner = this.strikers[1 - defenderIndex]
    const awayY = defender.y - owner.y
    const deltaX = defender.x - owner.x
    const awayX = deltaX === 0 && awayY === 0 ? (defenderIndex === 0 ? -1 : 1) : deltaX
    const baseAngle = Math.atan2(awayY, awayX)
    const releaseDistance = defender.r + this.puck.r + 6
    let direction = normalize({ x: awayX, y: awayY })
    for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI]) {
      const candidate = { x: Math.cos(baseAngle + turn), y: Math.sin(baseAngle + turn) }
      const x = defender.x + candidate.x * releaseDistance
      const y = defender.y + candidate.y * releaseDistance
      if (x >= LEFT + this.puck.r && x <= RIGHT - this.puck.r && y >= TOP + this.puck.r && y <= BOTTOM - this.puck.r && Math.hypot(x - owner.x, y - owner.y) > owner.r + this.puck.r) {
        direction = candidate
        break
      }
    }
    this.puck.x = clamp(defender.x + direction.x * releaseDistance, LEFT + this.puck.r, RIGHT - this.puck.r)
    this.puck.y = clamp(defender.y + direction.y * releaseDistance, TOP + this.puck.r, BOTTOM - this.puck.r)
    direction = normalize({ x: this.puck.x - defender.x, y: this.puck.y - defender.y })
    this.puck.vx = direction.x * TACKLE_BALL_SPEED
    this.puck.vy = direction.y * TACKLE_BALL_SPEED
    this.holder = -1
    this.controlCooldown = 0.32
    this.tackleSlowTime = TACKLE_SLOW_TIME
    this.tackleCooldown[defenderIndex] = 0.9
    this.aiCarryTime = 0
    this.particles.burst(this.puck.x, this.puck.y, defender.color, 18, 200)
    this.impact(6)
  }

  private moveAi(dt: number) {
    const striker = this.strikers[1]
    const puck = this.puck
    if (this.holder === 1) {
      const shotY = this.strikers[0].y < 300 ? 350 : 250
      this.aiWantsControl = this.aiCarryTime < 2.8 && striker.x > 405
      this.aiTarget = { x: LEFT + 150, y: shotY }
      this.facing[1] = normalize({ x: LEFT - striker.x, y: shotY - striker.y })
    } else {
      this.aiWantsControl = this.variant === 'football' && (this.holder === 0
        ? Math.hypot(striker.x - this.strikers[0].x, striker.y - this.strikers[0].y) < AI_TACKLE_REACH
        : Math.hypot(puck.vx, puck.vy) < 460)
    }
    this.aiDecisionDelay -= dt
    if (this.holder !== 1 && this.aiDecisionDelay <= 0) {
      this.aiDecisionDelay = 0.11
      const goalCrossing = predictCrossing(puck, RIGHT - puck.r)
      const goalThreat = puck.vx > 0 && goalCrossing !== null
        && goalCrossing.y > this.goalTop - puck.r && goalCrossing.y < this.goalBottom + puck.r
      const urgent = puck.x > striker.x - 50 || (RIGHT - puck.r - puck.x) / Math.max(1, puck.vx) < 0.75
      if (this.holder === 0) {
        // Press the carrier across the rink instead of waiting in our half.
        this.aiTarget = { x: clamp(puck.x + 25, LEFT + striker.r, RIGHT - striker.r), y: puck.y }
      } else if (this.holder === -1 && goalThreat && urgent && Math.hypot(puck.vx, puck.vy) >= 150) {
        // Retreat only for an immediate goal threat; step into the shot
        // from our current position rather than camping at the guard line.
        const guardX = clamp(Math.max(striker.x, puck.x + 45), LEFT + striker.r, RIGHT - striker.r)
        const crossing = predictCrossing(puck, guardX)
        this.aiTarget = { x: guardX, y: crossing?.y ?? puck.y }
      } else if (this.holder === -1) {
        // Get behind the puck and strike toward the side of the goal away from P1.
        const shotY = this.strikers[0].y < 300 ? 350 : 250
        const leadTime = clamp(Math.hypot(striker.x - puck.x, striker.y - puck.y) / AI_MOVE_SPEED, 0, 0.6)
        const future = projectPuck(puck, (1 - Math.exp(-PUCK_DRAG * leadTime)) / PUCK_DRAG)
        const distance = Math.hypot(future.x - LEFT, shotY - future.y)
        this.aiTarget = {
          x: clamp(future.x + 48 * (future.x - LEFT) / distance, LEFT + striker.r, RIGHT - striker.r),
          y: clamp(future.y - 48 * (shotY - future.y) / distance, TOP + striker.r, BOTTOM - striker.r),
        }
      } else {
        this.aiTarget = { x: 600, y: 300 }
      }
    }

    const dx = this.aiTarget.x - striker.x
    const dy = this.aiTarget.y - striker.y
    const distance = Math.hypot(dx, dy)
    const maxSpeed = this.holder === 1 ? AI_CARRY_SPEED : AI_MOVE_SPEED
    const speed = Math.min(maxSpeed, distance * 5)
    const desiredVx = distance > 0 ? dx / distance * speed : 0
    const desiredVy = distance > 0 ? dy / distance * speed : 0
    const changeX = desiredVx - striker.vx
    const changeY = desiredVy - striker.vy
    const changeSpeed = Math.hypot(changeX, changeY)
    const steering = changeSpeed > 0 ? Math.min(1, AI_ACCELERATION * dt / changeSpeed) : 0
    striker.vx += changeX * steering
    striker.vy += changeY * steering
    const actualSpeed = Math.hypot(striker.vx, striker.vy)
    if (actualSpeed > maxSpeed) {
      striker.vx = striker.vx / actualSpeed * maxSpeed
      striker.vy = striker.vy / actualSpeed * maxSpeed
    }
    striker.x += striker.vx * dt
    striker.y += striker.vy * dt
  }

  private moveGoalies(dt: number) {
    this.goalies.forEach((goalie, index) => {
      goalie.recovery = Math.max(0, goalie.recovery - dt)
      goalie.reaction -= dt
      if (goalie.reaction <= 0) {
        goalie.reaction = GOALIE_REACTION
        const incoming = index === 0 ? this.puck.vx < 0 : this.puck.vx > 0
        const crossing = incoming && this.holder === -1
          ? predictCrossing(this.puck, goalie.anchorX, this.matchPhase === 'shootout' ? 0 : PUCK_DRAG)
          : null
        const nearby = Math.abs(this.puck.x - goalie.anchorX) < 160
        const target = crossing?.y ?? (nearby ? this.puck.y : 300)
        goalie.targetY = clamp(target, this.goalTop + 30, this.goalBottom - 30)
      }
      const previousY = goalie.y
      const maxSpeed = goalie.recovery > 0 ? 25 : GOALIE_SPEED
      goalie.y += clamp(goalie.targetY - goalie.y, -maxSpeed * dt, maxSpeed * dt)
      goalie.vy = dt > 0 ? (goalie.y - previousY) / dt : 0
      goalie.vx = 0
      goalie.x = goalie.anchorX
    })
  }

  private keepStrikerInArena(striker: Striker) {
    if (striker.x - striker.r < LEFT) { striker.x = LEFT + striker.r; striker.vx = Math.abs(striker.vx) * 0.45 }
    if (striker.x + striker.r > RIGHT) { striker.x = RIGHT - striker.r; striker.vx = -Math.abs(striker.vx) * 0.45 }
    if (striker.y - striker.r < TOP) { striker.y = TOP + striker.r; striker.vy = Math.abs(striker.vy) * 0.45 }
    if (striker.y + striker.r > BOTTOM) { striker.y = BOTTOM - striker.r; striker.vy = -Math.abs(striker.vy) * 0.45 }
  }

  private wallHit() {
    this.particles.burst(this.puck.x, this.puck.y, COLORS.text, 5, 90)
  }

  private scoreGoal(player: number) {
    this.scores[player] += 1; this.scorer = player; this.serveDirection = player === 0 ? 1 : -1
    this.particles.burst(this.puck.x, this.puck.y, this.strikers[player].color, 42, 390); this.impact(11)
    if (this.variant === 'football' && this.scores[player] >= WIN_SCORE) {
      const winnerName = player === 1 && this.opponent === 'ai' ? 'AI' : `PLAYER ${player + 1}`
      this.finish({ headline: `${winnerName} WINS`, detail: `FIRST TO FIVE · ${this.scores[0]}–${this.scores[1]}`, score: 1, winnerName })
      return
    }
    this.resetFaceoff(1.2)
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    ctx.fillStyle = '#102b48'; ctx.fillRect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP)
    ctx.strokeStyle = COLORS.text; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(LEFT, this.goalTop); ctx.lineTo(LEFT, TOP); ctx.lineTo(RIGHT, TOP); ctx.lineTo(RIGHT, this.goalTop); ctx.moveTo(RIGHT, this.goalBottom); ctx.lineTo(RIGHT, BOTTOM); ctx.lineTo(LEFT, BOTTOM); ctx.lineTo(LEFT, this.goalBottom); ctx.stroke()
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.48; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(600, 300, 86, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1
    this.drawGoal(ctx, LEFT, -1, COLORS.cyan); this.drawGoal(ctx, RIGHT, 1, COLORS.coral)
    if (this.variant === 'football') {
      ctx.save(); ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.globalAlpha = 0.46
      ctx.strokeStyle = COLORS.cyan; ctx.strokeRect(LEFT, this.creaseTop, CREASE_DEPTH, this.creaseBottom - this.creaseTop)
      ctx.strokeStyle = COLORS.coral; ctx.strokeRect(RIGHT - CREASE_DEPTH, this.creaseTop, CREASE_DEPTH, this.creaseBottom - this.creaseTop)
      ctx.restore()
    }
    this.goalies.forEach((goalie, index) => {
      if (this.matchPhase === 'shootout' && index === this.penaltyShooter) return
      ctx.save(); ctx.globalAlpha = goalie.recovery > 0.45 ? 0.3 : goalie.recovery > 0 ? 0.62 : 1
      drawPlayer(ctx, goalie, goalie.color, 'GK')
      ctx.restore()
    })
    this.strikers.forEach((striker, index) => {
      if (this.matchPhase !== 'shootout' || index === this.penaltyShooter) drawPlayer(ctx, striker, striker.color, index === 1 && this.opponent === 'ai' ? 'AI' : striker.label)
    })
    if (this.matchPhase === 'shootout') this.drawShootout(ctx)
    ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = this.puck.color; ctx.fillStyle = this.puck.color; ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r, 0, Math.PI * 2); ctx.fill()
    if (this.variant === 'football') {
      ctx.shadowBlur = 0; ctx.fillStyle = COLORS.ink; ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / 5
        const x = this.puck.x + Math.cos(angle) * 7
        const y = this.puck.y + Math.sin(angle) * 7
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath(); ctx.fill()
    }
    if (this.holder !== -1) {
      ctx.strokeStyle = this.strikers[this.holder].color; ctx.lineWidth = 3; ctx.shadowBlur = 14; ctx.shadowColor = ctx.strokeStyle
      ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r + 8, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
    this.particles.render(ctx)
    if (this.serveDelay > 0) {
      ctx.fillStyle = this.scorer >= 0 ? this.strikers[this.scorer].color : COLORS.text; ctx.font = '800 35px Arial Narrow'; ctx.textAlign = 'center'
      ctx.fillText(this.scorer >= 0 ? `${this.scorer === 1 && this.opponent === 'ai' ? 'AI' : `PLAYER ${this.scorer + 1}`} SCORES!` : `${this.variant === 'classic' && this.matchPhase === 'extra' ? 'EXTRA TIME · 30 MIN' : 'FACE OFF'} · ${Math.max(1, Math.ceil(this.serveDelay))}`, 600, 48)
    }
    ctx.restore()
  }

  private drawGoal(ctx: CanvasRenderingContext2D, x: number, direction: number, color: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = `${color}1f`; ctx.lineWidth = 4; const width = 54 * direction
    ctx.fillRect(x, this.goalTop, width, this.goalBottom - this.goalTop); ctx.strokeRect(x, this.goalTop, width, this.goalBottom - this.goalTop); ctx.restore()
  }

  getHud(): HudItem[] {
    if (this.matchPhase === 'shootout') {
      const round = this.penaltyAttempts[this.penaltyShooter].length + (this.penaltyState === 'result' ? 0 : 1)
      return [
        { label: 'PLAYER 1 · PENALTIES', value: String(this.penaltyGoals(0)), accent: COLORS.cyan },
        { label: round > 5 ? 'SUDDEN DEATH' : 'PENALTY SHOOTOUT', value: this.penaltyState === 'result' ? this.penaltyMessage : `${this.penaltyShooter === 1 && this.opponent === 'ai' ? 'AI' : `P${this.penaltyShooter + 1}`} · SHOT ${round}${round <= 5 ? '/5' : ''}` },
        { label: `${this.opponent === 'ai' ? 'AI' : 'PLAYER 2'} · PENALTIES`, value: String(this.penaltyGoals(1)), accent: COLORS.coral },
      ]
    }
    const inStoppage = this.addedMinutes > 0
    const gameSeconds = Math.floor((inStoppage ? Math.max(0, this.phaseElapsed - this.periodSeconds) : this.phaseElapsed) / REAL_SECONDS_PER_GAME_MINUTE * 60)
    const periodMinutes = this.matchPhase === 'extra' ? EXTRA_TIME_MINUTES : CLASSIC_MATCH_MINUTES
    const timeLabel = inStoppage ? `${this.matchPhase === 'extra' ? 'ET · ' : ''}STOPPAGE · +${this.addedMinutes} MIN`
        : this.matchPhase === 'extra' ? 'EXTRA TIME · 30 MIN' : 'MATCH TIME · 90 MIN'
    const clock = `${Math.floor(gameSeconds / 60)}:${String(gameSeconds % 60).padStart(2, '0')}`
    return [
      { label: 'PLAYER 1', value: String(this.scores[0]), accent: COLORS.cyan },
      { label: this.variant === 'classic' ? timeLabel : 'FIRST TO 5', value: this.variant === 'classic' ? inStoppage ? `${periodMinutes} + ${clock}` : clock : this.serveDelay > 0 ? 'FACE OFF' : this.holder !== -1 ? `${this.holder === 1 && this.opponent === 'ai' ? 'AI' : `P${this.holder + 1}`} DRIBBLING` : `${Math.round(clamp(Math.hypot(this.puck.vx, this.puck.vy), 0, 999))} BALL SPEED` },
      { label: this.opponent === 'ai' ? 'AI' : 'PLAYER 2', value: String(this.scores[1]), accent: COLORS.coral },
    ]
  }
}
