import { BaseGame } from '../core/BaseGame'
import { clamp } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'

type Team = 0 | 1

interface Player {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  team: Team
  number: number
  keeper?: boolean
  homeX: number
  homeY: number
  angle: number
}

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

const FIELD = { left: 58, right: 1142, top: 112, bottom: 532 }
const GOAL = { top: 238, bottom: 366 }
const WIN_SCORE = 3

/**
 * A compact, single-player interpretation of Soccer Skills 2 World Cup.
 * The match uses the same core gesture as the original: press and hold on the
 * active player, drag to aim, then release to pass or shoot.
 */
export class SoccerSkillsGame extends BaseGame {
  private players: Player[] = []
  private ball: Ball = { x: 330, y: 315, vx: 0, vy: 0, r: 8 }
  private holder = 0
  private selected = 0
  private scores: [number, number] = [0, 0]
  private round = 1
  private phaseNotice = 'QUARTER FINAL · BLUE ATTACKS →'
  private charging = false
  private aimX = 0
  private aimY = 0
  private charge = 0
  private lastTouch: Team = 0
  private kickoffDelay = 0.8
  private aiKickTimer = 0.7
  private matchClock = 75
  private attempts = 0
  private saves = 0

  constructor(meta: GameMeta) {
    super(meta)
    this.reset()
  }

  reset() {
    this.result = null
    this.elapsed = 0
    this.scores = [0, 0]
    this.round = 1
    this.attempts = 0
    this.saves = 0
    this.kickoffDelay = 0.8
    this.aiKickTimer = 0.7
    this.matchClock = 75
    this.phaseNotice = 'QUARTER FINAL · BLUE ATTACKS →'
    this.charging = false
    this.charge = 0
    this.createPlayers()
    this.holder = 1
    this.selected = 1
    const kickoffPlayer = this.players[this.holder]
    this.ball = { x: kickoffPlayer.x + 20, y: kickoffPlayer.y, vx: 0, vy: 0, r: 8 }
  }

  private createPlayers() {
    const blue: Array<[number, number, number]> = [
      [6, 280, 320], [7, 365, 250], [10, 360, 390], [11, 500, 235], [9, 420, 320],
    ]
    const white: Array<[number, number, number]> = [
      [1, 925, 325], [4, 785, 245], [5, 800, 395], [8, 650, 255], [10, 720, 340],
    ]
    this.players = [
      { x: 108, y: 315, vx: 0, vy: 0, r: 17, team: 0, number: 1, keeper: true, homeX: 108, homeY: 315, angle: 0 },
      ...blue.map(([number, x, y]) => ({ x, y, vx: 0, vy: 0, r: 16, team: 0 as Team, number, homeX: x, homeY: y, angle: 0 })),
      { x: 1092, y: 315, vx: 0, vy: 0, r: 17, team: 1, number: 1, keeper: true, homeX: 1092, homeY: 315, angle: Math.PI },
      ...white.map(([number, x, y]) => ({ x, y, vx: 0, vy: 0, r: 16, team: 1 as Team, number, homeX: x, homeY: y, angle: Math.PI })),
    ]
  }

  private resetKickoff(team: Team, message: string) {
    this.createPlayers()
    this.phaseNotice = message
    this.kickoffDelay = 0.8
    this.aiKickTimer = 0.7
    this.charging = false
    this.charge = 0
    this.selected = team === 0 ? 1 : 7
    this.holder = this.selected
    const p = this.players[this.holder]
    p.x = team === 0 ? 330 : 870
    p.y = 315
    p.angle = team === 0 ? 0 : Math.PI
    this.ball = { x: p.x + (team === 0 ? 20 : -20), y: p.y, vx: 0, vy: 0, r: 8 }
  }

  private kick(directionX: number, directionY: number) {
    const p = this.players[this.holder]
    const length = Math.max(1, Math.hypot(directionX, directionY))
    const nx = directionX / length
    const ny = directionY / length
    const power = 320 + this.charge * 760
    p.angle = Math.atan2(ny, nx)
    this.ball.x = p.x + nx * 25
    this.ball.y = p.y + ny * 25
    this.ball.vx = nx * power
    this.ball.vy = ny * power
    this.lastTouch = p.team
    this.holder = -1
    this.attempts++
    this.charge = 0
    this.particles.burst(this.ball.x, this.ball.y, p.team === 0 ? '#2767ff' : '#f3f4f5', 10, 135)
  }

  private nearestPlayer(team: Team, x: number, y: number) {
    let best = -1
    let distance = Infinity
    this.players.forEach((p, index) => {
      if (p.team !== team || p.keeper) return
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < distance) { distance = d; best = index }
    })
    return best
  }

  private movePlayer(p: Player, tx: number, ty: number, dt: number, speed = 150) {
    const dx = tx - p.x
    const dy = ty - p.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1) { p.vx = 0; p.vy = 0; return }
    const step = Math.min(distance, speed * dt)
    p.vx = dx / distance * speed
    p.vy = dy / distance * speed
    p.x += dx / distance * step
    p.y += dy / distance * step
    p.angle = Math.atan2(dy, dx)
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    this.matchClock = Math.max(0, this.matchClock - dt)
    if (this.kickoffDelay > 0) {
      this.kickoffDelay = Math.max(0, this.kickoffDelay - dt)
      return
    }

    const pointer = input.pointer
    if (pointer.pressed) {
      const clicked = this.players
        .map((p, index) => ({ p, index, d: Math.hypot(p.x - pointer.x, p.y - pointer.y) }))
        .filter(({ p, d }) => p.team === 0 && !p.keeper && d < 46)
        .sort((a, b) => a.d - b.d)[0]
      if (clicked) this.selected = clicked.index
      if (clicked && clicked.index === this.holder && this.players[this.holder].team === 0) {
        this.charging = true
        this.aimX = pointer.x
        this.aimY = pointer.y
        this.charge = 0.18
      }
    }
    if (this.charging && pointer.down) {
      this.aimX = pointer.x
      this.aimY = pointer.y
      this.charge = clamp(this.charge + dt * 0.58, 0.18, 1)
    }
    if (this.charging && pointer.released) {
      const p = this.players[this.holder]
      if (p) this.kick(this.aimX - p.x, this.aimY - p.y)
      this.charging = false
    }

    // White plays automatically: receive, take a touch, then clear toward the
    // blue goal. This keeps the round moving after goals and loose-ball steals.
    if (this.holder >= 0 && this.players[this.holder]?.team === 1) {
      this.aiKickTimer -= dt
      if (this.aiKickTimer <= 0) {
        const targetY = clamp(315 + (this.ball.y - 315) * 0.32, GOAL.top + 18, GOAL.bottom - 18)
        this.charge = 0.7
        this.kick(FIELD.left - this.players[this.holder].x, targetY - this.players[this.holder].y)
        this.aiKickTimer = 1.15
      }
    }

    this.updatePlayers(dt)
    if (this.holder >= 0) {
      const p = this.players[this.holder]
      this.ball.x = p.x + Math.cos(p.angle) * 20
      this.ball.y = p.y + Math.sin(p.angle) * 20
      this.ball.vx = 0
      this.ball.vy = 0
    } else {
      const steps = Math.max(1, Math.ceil(Math.hypot(this.ball.vx, this.ball.vy) * dt / 9))
      for (let i = 0; i < steps; i++) {
        this.ball.x += this.ball.vx * dt / steps
        this.ball.y += this.ball.vy * dt / steps
        const keeperIndex = this.ball.vx > 0 ? 6 : 0
        const keeper = this.players[keeperIndex]
        if (Math.abs(this.ball.vx) > 120 && Math.hypot(keeper.x - this.ball.x, keeper.y - this.ball.y) < keeper.r + this.ball.r + 8) {
          this.saves++
          this.phaseNotice = 'GREAT SAVE · PLAY ON'
          this.ball.vx = -this.ball.vx * 0.36
          this.ball.vy += (this.ball.y - keeper.y) * 2.2
          this.lastTouch = keeper.team
          this.particles.burst(keeper.x, keeper.y, '#ffd43b', 8, 100)
          continue
        }
        if (this.checkGoal()) return
        if (this.ball.y - this.ball.r < FIELD.top) { this.ball.y = FIELD.top + this.ball.r; this.ball.vy = Math.abs(this.ball.vy) * 0.72 }
        if (this.ball.y + this.ball.r > FIELD.bottom) { this.ball.y = FIELD.bottom - this.ball.r; this.ball.vy = -Math.abs(this.ball.vy) * 0.72 }
        if (this.ball.x - this.ball.r < FIELD.left) { this.ball.x = FIELD.left + this.ball.r; this.ball.vx = Math.abs(this.ball.vx) * 0.72 }
        if (this.ball.x + this.ball.r > FIELD.right) { this.ball.x = FIELD.right - this.ball.r; this.ball.vx = -Math.abs(this.ball.vx) * 0.72 }
        const catcher = this.players.findIndex((p) => Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < p.r + 7 && !p.keeper)
        if (catcher >= 0 && Math.hypot(this.ball.vx, this.ball.vy) < 400) {
          this.holder = catcher
          this.selected = catcher
          this.lastTouch = this.players[catcher].team
          break
        }
      }
      const drag = Math.exp(-1.1 * dt)
      this.ball.vx *= drag
      this.ball.vy *= drag
      if (Math.hypot(this.ball.vx, this.ball.vy) < 14) { this.ball.vx = 0; this.ball.vy = 0 }
    }

    if (this.matchClock <= 0) {
      const winner = this.scores[0] > this.scores[1] ? 'BLUE' : this.scores[1] > this.scores[0] ? 'WHITE' : undefined
      this.finish({ headline: winner ? `${winner} WINS` : 'MATCH DRAWN', detail: `FULL TIME · ${this.scores[0]}–${this.scores[1]} · ROUND ${this.round}`, score: this.scores[0], winnerName: winner, recordEligible: Boolean(winner) })
    }
  }

  private updatePlayers(dt: number) {
    const holder = this.holder >= 0 ? this.players[this.holder] : undefined
    this.players.forEach((p, index) => {
      if (p.keeper) {
        const targetY = clamp(this.ball.y, GOAL.top + 16, GOAL.bottom - 16)
        this.movePlayer(p, p.homeX, targetY, dt, 115)
        return
      }
      if (index === this.selected && p.team === 0) return
      if (holder && holder.team === p.team) {
        const lead = p.team === 0 ? 105 : -105
        const offset = ((index % 3) - 1) * 75
        this.movePlayer(p, clamp(holder.x + lead, FIELD.left + 30, FIELD.right - 30), clamp(holder.y + offset, FIELD.top + 24, FIELD.bottom - 24), dt, 125)
      } else if (!holder && p.team === 1) {
        const d = Math.hypot(p.x - this.ball.x, p.y - this.ball.y)
        if (d < 230) this.movePlayer(p, this.ball.x, this.ball.y, dt, 172)
        else this.movePlayer(p, p.homeX + (this.ball.x - 600) * 0.13, p.homeY + (this.ball.y - 320) * 0.1, dt, 92)
      } else if (holder && holder.team !== p.team && p.team === 1) {
        const d = Math.hypot(p.x - holder.x, p.y - holder.y)
        if (d < 245) this.movePlayer(p, holder.x, holder.y, dt, 168)
        else this.movePlayer(p, p.homeX + (this.ball.x - 600) * 0.12, p.homeY + (this.ball.y - 320) * 0.08, dt, 90)
        if (d < 30 && this.holder >= 0 && this.players[this.holder].team === 0) {
          this.holder = -1
          this.ball.x = holder.x
          this.ball.y = holder.y
          this.ball.vx = -130
          this.ball.vy = (p.y - holder.y) * 2.4
          this.lastTouch = 1
          this.phaseNotice = 'TACKLE · WHITE BREAKS FORWARD'
        }
      } else {
        this.movePlayer(p, p.homeX, p.homeY, dt, 90)
      }
      p.x = clamp(p.x, FIELD.left + 18, FIELD.right - 18)
      p.y = clamp(p.y, FIELD.top + 18, FIELD.bottom - 18)
    })
  }

  private checkGoal() {
    if (this.ball.x - this.ball.r > FIELD.right && this.ball.y > GOAL.top && this.ball.y < GOAL.bottom) {
      this.scores[0]++
      this.impact(10)
      if (this.scores[0] >= WIN_SCORE) {
        this.finish({ headline: 'BLUE WINS THE TIE', detail: `FINAL · ${this.scores[0]}–${this.scores[1]} · ${this.attempts} SHOTS`, score: this.scores[0], winnerName: 'BLUE', recordEligible: true })
      } else {
        this.round++
        this.resetKickoff(1, `GOAL! · BLUE ${this.scores[0]}–${this.scores[1]} · WHITE KICK OFF`)
      }
      return true
    }
    if (this.ball.x + this.ball.r < FIELD.left && this.ball.y > GOAL.top && this.ball.y < GOAL.bottom) {
      this.scores[1]++
      this.impact(8)
      if (this.scores[1] >= WIN_SCORE) {
        this.finish({ headline: 'WHITE WINS THE TIE', detail: `FINAL · ${this.scores[0]}–${this.scores[1]} · ${this.saves} SAVES`, score: this.scores[0], winnerName: 'WHITE', recordEligible: false })
      } else {
        this.round++
        this.resetKickoff(0, `WHITE SCORES · ${this.scores[0]}–${this.scores[1]} · BLUE KICK OFF`)
      }
      return true
    }
    return false
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save()
    this.applyShake(ctx)
    ctx.fillStyle = '#071222'
    ctx.fillRect(0, 0, 1200, 600)

    // Stadium seating and the bright, compact broadcast HUD.
    ctx.fillStyle = '#17253b'
    ctx.fillRect(0, 0, 1200, 98)
    ctx.fillStyle = '#1b2c42'
    ctx.fillRect(0, 552, 1200, 48)
    for (let row = 0; row < 4; row++) for (let x = 20; x < 1200; x += 42) {
      ctx.fillStyle = (x / 42 + row) % 3 === 0 ? '#db4050' : (x / 42 + row) % 2 ? '#2a73d8' : '#efbd36'
      ctx.fillRect(x, 18 + row * 18, 14, 9)
      ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(x + 15, 18 + row * 18, 8, 9)
    }
    ctx.fillStyle = '#0f1c2d'; ctx.fillRect(0, 92, 1200, 8)

    // Isometric-style trapezoid pitch.
    const pitch = new Path2D()
    pitch.moveTo(58, 122); pitch.lineTo(1142, 108); pitch.lineTo(1188, 530); pitch.lineTo(14, 548); pitch.closePath()
    ctx.save(); ctx.clip(pitch)
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? '#148140' : '#0f7438'
      ctx.fillRect(0, 100 + i * 40, 1200, 44)
    }
    ctx.restore()
    ctx.strokeStyle = '#e4f0df'; ctx.lineWidth = 2.2; ctx.stroke(pitch)
    ctx.beginPath(); ctx.moveTo(600, 116); ctx.lineTo(600, 538); ctx.stroke()
    ctx.beginPath(); ctx.arc(600, 326, 58, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(600, 326, 4, 0, Math.PI * 2); ctx.fillStyle = '#e4f0df'; ctx.fill()
    ctx.strokeRect(58, 218, 160, 214); ctx.strokeRect(924, 215, 218, 220)
    ctx.strokeRect(58, 256, 90, 138); ctx.strokeRect(1052, 255, 90, 138)
    ctx.beginPath(); ctx.arc(204, 326, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(996, 326, 3, 0, Math.PI * 2); ctx.fill()

    // Goals and net lines.
    for (const side of [0, 1]) {
      const x = side === 0 ? 28 : 1142
      ctx.strokeStyle = '#f2f2e9'; ctx.lineWidth = 2
      ctx.strokeRect(side === 0 ? x : x, GOAL.top, 30, GOAL.bottom - GOAL.top)
      for (let y = GOAL.top; y <= GOAL.bottom; y += 13) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(side === 0 ? x + 30 : x - 30, y); ctx.stroke() }
    }

    if (this.charging && this.holder >= 0) {
      const p = this.players[this.holder]
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 3; ctx.setLineDash([8, 8])
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(this.aimX, this.aimY); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#ffcf3b'; ctx.beginPath(); ctx.arc(this.aimX, this.aimY, 9 + this.charge * 9, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#0a2a25'; ctx.fillRect(p.x - 28, p.y - 34, 56, 6)
      ctx.fillStyle = '#ffcf3b'; ctx.fillRect(p.x - 27, p.y - 33, 54 * this.charge, 4)
    }

    this.players.forEach((p, index) => this.drawPlayer(ctx, p, index === this.selected && p.team === 0))
    this.drawBall(ctx)
    this.particles.render(ctx)

    ctx.fillStyle = '#f3f6ee'; ctx.font = '700 18px Arial, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(this.kickoffDelay > 0 ? 'GET READY' : this.phaseNotice, 600, 76)
    ctx.fillStyle = 'rgba(4,15,26,.74)'; ctx.fillRect(20, 558, 1160, 28)
    ctx.fillStyle = '#f4f6ee'; ctx.font = '600 13px Arial, sans-serif'
    ctx.fillText(this.charging ? 'DRAG TO AIM · RELEASE TO SHOOT' : 'CLICK + HOLD A PLAYER · DRAG TO AIM · RELEASE TO SHOOT', 600, 577)
    ctx.restore()
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: Player, selected: boolean) {
    ctx.save(); ctx.translate(p.x, p.y)
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(3, 10, p.r * 0.95, p.r * 0.45, 0, 0, Math.PI * 2); ctx.fill()
    const shirt = p.keeper ? '#ffd43b' : p.team === 0 ? '#1b5fe0' : '#f6f5ee'
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.ellipse(0, 2, p.r * 0.72, p.r * 0.92, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#f0bd93'; ctx.beginPath(); ctx.arc(0, -p.r * 0.72, p.r * 0.48, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#192534'; ctx.beginPath(); ctx.arc(0, -p.r * 0.92, p.r * 0.4, Math.PI, Math.PI * 2); ctx.fill()
    ctx.fillStyle = p.team === 0 && !p.keeper ? '#eff6ff' : '#1f2b39'; ctx.font = '800 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.number), 0, 3)
    if (selected) {
      ctx.strokeStyle = '#ffcf3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, p.r + 9 + Math.sin(this.elapsed * 6) * 2, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#ffcf3b'; ctx.font = '800 11px Arial, sans-serif'; ctx.fillText('YOU', 0, -p.r - 17)
    }
    ctx.restore()
  }

  private drawBall(ctx: CanvasRenderingContext2D) {
    ctx.save(); ctx.translate(this.ball.x, this.ball.y); ctx.rotate(this.elapsed * 5)
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(3, 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fbfbf4'; ctx.beginPath(); ctx.arc(0, 0, this.ball.r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#26313a'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }

  getHud(): HudItem[] {
    const minutes = Math.floor(this.matchClock / 60)
    const seconds = Math.floor(this.matchClock % 60).toString().padStart(2, '0')
    const possession = this.holder >= 0 ? (this.players[this.holder].team === 0 ? 'BLUE' : 'WHITE') : 'LOOSE BALL'
    return [
      { label: 'WORLD CUP · ROUND', value: `${this.round} / 3`, accent: '#ffcf3b' },
      { label: 'BLUE', value: String(this.scores[0]), accent: '#3f82ff' },
      { label: 'CLOCK', value: `${minutes}:${seconds}` },
      { label: 'POSSESSION', value: possession, accent: possession === 'BLUE' ? '#3f82ff' : '#f4f5ee' },
      { label: 'SHOTS', value: String(this.attempts) },
      { label: 'WHITE', value: String(this.scores[1]), accent: '#f4f5ee' },
    ]
  }
}

