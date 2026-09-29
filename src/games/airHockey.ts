import { BaseGame } from '../core/BaseGame'
import { clamp, normalize, type Vec2 } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, axis, clearArena, drawPlayer, moveBody, resolveCircleCollision, type Body } from './common'

interface Striker extends Body { color: string; label: string }
interface Puck extends Body { color: string }

const LEFT = 92
const RIGHT = 1108
const TOP = 66
const BOTTOM = 534
const GOAL_TOP = 218
const GOAL_BOTTOM = 382
const WIN_SCORE = 5
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

function reboundY(y: number) {
  const low = TOP + 18
  const high = BOTTOM - 18
  const span = high - low
  const position = ((y - low) % (2 * span) + 2 * span) % (2 * span)
  return low + (position <= span ? position : 2 * span - position)
}

export class AirHockeyGame extends BaseGame {
  private strikers: [Striker, Striker] = [] as unknown as [Striker, Striker]
  private puck: Puck = { x: 600, y: 300, vx: 0, vy: 0, r: 18, mass: 0.35, color: COLORS.text }
  private scores: [number, number] = [0, 0]
  private serveDelay = 0
  private serveDirection = 1
  private scorer = -1
  private opponent: HockeyOpponent = 'ai'
  private aiTarget = { x: AI_GUARD_X, y: 300 }
  private aiDecisionDelay = 0
  private aiWantsControl = false
  private aiCarryTime = 0
  private holder: -1 | 0 | 1 = -1
  private controlCooldown = 0
  private tackleSlowTime = 0
  private tackleCooldown: [number, number] = [0, 0]
  private facing: [Vec2, Vec2] = [{ x: 1, y: 0 }, { x: -1, y: 0 }]

  constructor(meta: GameMeta) { super(meta); this.reset() }

  setOpponent(opponent: HockeyOpponent) {
    this.opponent = opponent
    this.reset()
  }

  reset() {
    this.result = null; this.elapsed = 0; this.scores = [0, 0]; this.scorer = -1; this.serveDirection = Math.random() < 0.5 ? -1 : 1; this.particles.clear(); this.resetFaceoff(1.25)
  }

  private resetFaceoff(delay: number) {
    this.strikers = [
      { x: 335, y: 300, vx: 0, vy: 0, r: 34, mass: 3, color: COLORS.cyan, label: 'P1' },
      { x: 865, y: 300, vx: 0, vy: 0, r: 34, mass: 3, color: COLORS.coral, label: 'P2' },
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

    this.controlCooldown = Math.max(0, this.controlCooldown - dt)
    this.tackleSlowTime = Math.max(0, this.tackleSlowTime - dt)
    this.tackleCooldown = this.tackleCooldown.map((time) => Math.max(0, time - dt)) as [number, number]
    const wantsControl: [boolean, boolean] = [input.isDown('Space'), this.opponent === 'ai' ? this.aiWantsControl : input.isDown('Enter')]
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
      const inGoal = this.puck.y > GOAL_TOP && this.puck.y < GOAL_BOTTOM
      if (inGoal && this.puck.x - this.puck.r < LEFT) { this.scoreGoal(1); return }
      if (inGoal && this.puck.x + this.puck.r > RIGHT) { this.scoreGoal(0); return }
      this.puck.x = clamp(this.puck.x, LEFT + this.puck.r, RIGHT - this.puck.r)

      const dx = this.puck.x - defender.x
      const dy = this.puck.y - defender.y
      const distance = Math.hypot(dx, dy)
      if (distance < defender.r + this.puck.r) {
        const direction = normalize({ x: dx || 1, y: dy })
        this.puck.vx = direction.x * TACKLE_BALL_SPEED
        this.puck.vy = direction.y * TACKLE_BALL_SPEED
        this.holder = -1
        this.controlCooldown = 0.28
        this.tackleSlowTime = TACKLE_SLOW_TIME
        this.particles.burst(this.puck.x, this.puck.y, defender.color, 12, 160)
      }
      return
    }

    this.puck.x += this.puck.vx * dt
    this.puck.y += this.puck.vy * dt
    const damping = Math.pow(0.997, dt * 60)
    this.puck.vx *= damping; this.puck.vy *= damping

    if (this.puck.y - this.puck.r < TOP) { this.puck.y = TOP + this.puck.r; this.puck.vy = Math.abs(this.puck.vy) * 0.98; this.wallHit() }
    if (this.puck.y + this.puck.r > BOTTOM) { this.puck.y = BOTTOM - this.puck.r; this.puck.vy = -Math.abs(this.puck.vy) * 0.98; this.wallHit() }
    const inGoal = this.puck.y > GOAL_TOP && this.puck.y < GOAL_BOTTOM
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
    if (Math.hypot(this.puck.vx, this.puck.vy) < 105) {
      const direction = this.puck.vx === 0 ? this.serveDirection : Math.sign(this.puck.vx)
      this.puck.vx += direction * 28 * dt
    }
    if (this.tackleSlowTime > 0) {
      const speed = Math.hypot(this.puck.vx, this.puck.vy)
      if (speed > TACKLE_BALL_SPEED) {
        this.puck.vx = this.puck.vx / speed * TACKLE_BALL_SPEED
        this.puck.vy = this.puck.vy / speed * TACKLE_BALL_SPEED
      }
    }
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
    const goalDirection = defenderIndex === 0 ? 1 : -1
    this.puck.x = defender.x + goalDirection * BALL_OFFSET
    this.puck.y = defender.y
    this.puck.vx = goalDirection * TACKLE_BALL_SPEED
    this.puck.vy = 0
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
    const p1Distance = Math.hypot(puck.x - this.strikers[0].x, puck.y - this.strikers[0].y)
    if (this.holder === 1) {
      const shotY = this.strikers[0].y < 300 ? 350 : 250
      this.aiWantsControl = this.aiCarryTime < 2.8 && striker.x > 405
      this.aiTarget = { x: LEFT + 150, y: shotY }
      this.facing[1] = normalize({ x: LEFT - striker.x, y: shotY - striker.y })
    } else {
      this.aiWantsControl = this.holder === 0
        ? Math.hypot(striker.x - this.strikers[0].x, striker.y - this.strikers[0].y) < AI_TACKLE_REACH
        : puck.x > 500 && p1Distance > 140 && Math.hypot(puck.vx, puck.vy) < 460
    }
    this.aiDecisionDelay -= dt
    if (this.holder !== 1 && this.aiDecisionDelay <= 0) {
      this.aiDecisionDelay = 0.11
      if (this.holder === 0 && puck.x > 560) {
        // Challenge a player carrying the ball into the AI's half.
        this.aiTarget = { x: clamp(puck.x + 25, LEFT + striker.r, RIGHT - striker.r), y: puck.y }
      } else if (puck.x > 500 && puck.vx > -90 && (puck.x > 720 || p1Distance > 190)) {
        // Get behind the puck and strike toward the side of the goal away from P1.
        const shotY = this.strikers[0].y < 300 ? 350 : 250
        const distance = Math.hypot(puck.x - LEFT, shotY - puck.y)
        this.aiTarget = {
          x: clamp(puck.x + 51 * (puck.x - LEFT) / distance, LEFT + striker.r, RIGHT - striker.r),
          y: clamp(puck.y - 51 * (shotY - puck.y) / distance, TOP + striker.r, BOTTOM - striker.r),
        }
      } else if (puck.vx > 45) {
        // Cover where the puck will cross the defensive line, including wall banks.
        const time = clamp((AI_GUARD_X - puck.x) / puck.vx, 0, 2)
        this.aiTarget = { x: AI_GUARD_X, y: reboundY(puck.y + puck.vy * time) }
      } else {
        // Recover to a central goalkeeping position when the puck is moving away.
        this.aiTarget = { x: AI_GUARD_X, y: 300 }
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
    if (this.scores[player] >= WIN_SCORE) {
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
    ctx.beginPath(); ctx.moveTo(LEFT, GOAL_TOP); ctx.lineTo(LEFT, TOP); ctx.lineTo(RIGHT, TOP); ctx.lineTo(RIGHT, GOAL_TOP); ctx.moveTo(RIGHT, GOAL_BOTTOM); ctx.lineTo(RIGHT, BOTTOM); ctx.lineTo(LEFT, BOTTOM); ctx.lineTo(LEFT, GOAL_BOTTOM); ctx.stroke()
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.48; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(600, 300, 86, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1
    this.drawGoal(ctx, LEFT, -1, COLORS.cyan); this.drawGoal(ctx, RIGHT, 1, COLORS.coral)
    this.strikers.forEach((striker, index) => drawPlayer(ctx, striker, striker.color, index === 1 && this.opponent === 'ai' ? 'AI' : striker.label))
    ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = this.puck.color; ctx.fillStyle = this.puck.color; ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0; ctx.fillStyle = COLORS.ink; ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 5
      const x = this.puck.x + Math.cos(angle) * 7
      const y = this.puck.y + Math.sin(angle) * 7
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.fill()
    if (this.holder !== -1) {
      ctx.strokeStyle = this.strikers[this.holder].color; ctx.lineWidth = 3; ctx.shadowBlur = 14; ctx.shadowColor = ctx.strokeStyle
      ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r + 8, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
    this.particles.render(ctx)
    if (this.serveDelay > 0) {
      ctx.fillStyle = this.scorer >= 0 ? this.strikers[this.scorer].color : COLORS.text; ctx.font = '800 35px Arial Narrow'; ctx.textAlign = 'center'
      ctx.fillText(this.scorer >= 0 ? `${this.scorer === 1 && this.opponent === 'ai' ? 'AI' : `PLAYER ${this.scorer + 1}`} SCORES!` : `FACE OFF · ${Math.max(1, Math.ceil(this.serveDelay))}`, 600, 48)
    }
    ctx.restore()
  }

  private drawGoal(ctx: CanvasRenderingContext2D, x: number, direction: number, color: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = `${color}1f`; ctx.lineWidth = 4; const width = 54 * direction
    ctx.fillRect(x, GOAL_TOP, width, GOAL_BOTTOM - GOAL_TOP); ctx.strokeRect(x, GOAL_TOP, width, GOAL_BOTTOM - GOAL_TOP); ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'PLAYER 1', value: String(this.scores[0]), accent: COLORS.cyan },
      { label: 'FIRST TO 5', value: this.serveDelay > 0 ? 'FACE OFF' : this.holder !== -1 ? `${this.holder === 1 && this.opponent === 'ai' ? 'AI' : `P${this.holder + 1}`} DRIBBLING` : `${Math.round(clamp(Math.hypot(this.puck.vx, this.puck.vy), 0, 999))} BALL SPEED` },
      { label: this.opponent === 'ai' ? 'AI' : 'PLAYER 2', value: String(this.scores[1]), accent: COLORS.coral },
    ]
  }
}
