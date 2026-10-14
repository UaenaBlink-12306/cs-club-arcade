import { BaseGame } from '../core/BaseGame'
import { clamp, normalize } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import type { HockeyOpponent } from './airHockey'
import { axis, COLORS, type Body } from './common'

interface Footballer extends Body {
  team: number; number: number; homeX: number; homeY: number; angle: number; stamina: number; cooldown: number
}
const L = 70, R = 1130, T = 65, B = 535
const GOAL_TOP = 242, GOAL_BOTTOM = 358
const SECONDS_PER_MINUTE = 2
const MATCH_MINUTES = 90
const MATCH_LENGTH = MATCH_MINUTES * SECONDS_PER_MINUTE
const TEAM_SIZE = 6
const FORMATION = [[38, 235], [235, 130], [235, 340], [410, 105], [410, 365], [490, 235]]

export class FootballGame extends BaseGame {
  private players: Footballer[] = []
  private ball: Body = { x: 600, y: 300, vx: 0, vy: 0, r: 7 }
  private scores = [0, 0]
  private readonly selected = [TEAM_SIZE - 1, TEAM_SIZE * 2 - 1]
  private holder = -1
  private lastTouch = 0
  private pickupDelay = 0
  private tackleGrace = 0
  private charges = [0, 0]
  private clock = MATCH_LENGTH
  private matchStarted = false
  private lostTime = 0
  private addedMinutes = 0
  private addedRemaining = 0
  private restartDelay = 0
  private notice = ''
  private opponent: HockeyOpponent = 'ai'
  private aiThink = 0
  private passTarget = -1
  private calls = [0, 0]
  private passes = [0, 0]
  private shots = [0, 0]

  constructor(meta: GameMeta) { super(meta); this.reset() }
  setOpponent(opponent: HockeyOpponent) { this.opponent = opponent; this.reset() }
  reset() {
    this.result = null; this.elapsed = 0; this.clock = MATCH_LENGTH; this.scores = [0, 0]
    this.matchStarted = false; this.lostTime = 0; this.addedMinutes = 0; this.addedRemaining = 0
    this.calls = [0, 0]; this.passTarget = -1; this.passes = [0, 0]; this.shots = [0, 0]; this.charges = [0, 0]; this.particles.clear()
    this.kickoff(0, 'KICK OFF · BLUE ATTACKS →')
  }
  private kickoff(team: number, notice: string) {
    this.players = []
    for (let side = 0; side < 2; side++) FORMATION.forEach(([x, y], i) => {
      const px = side === 0 ? L + x : R - x
      this.players.push({ x: px, y: T + y, homeX: px, homeY: T + y, vx: 0, vy: 0, r: i === 0 ? 13 : 12,
        team: side, number: i === 0 ? 1 : i + 3, angle: side === 0 ? 0 : Math.PI, stamina: 1, cooldown: 0 })
    })
    const taker = team * TEAM_SIZE + TEAM_SIZE - 1
    this.players[taker].x = 600 + (team === 0 ? -22 : 22); this.players[taker].y = 300
    this.restart(taker, 'KICK OFF', 600, 300)
    this.notice = notice
  }
  private restart(taker: number, kind: string, x: number, y: number) {
    const p = this.players[taker]
    p.x = clamp(x, L + p.r, R - p.r); p.y = clamp(y, T + p.r, B - p.r); p.vx = 0; p.vy = 0
    p.angle = p.team === 0 ? 0 : Math.PI
    this.holder = taker; this.lastTouch = p.team; this.passTarget = -1
    Object.assign(this.ball, { x: p.x + Math.cos(p.angle) * 21, y: p.y, vx: 0, vy: 0 })
    this.charges = [0, 0]; this.pickupDelay = 0; this.tackleGrace = 0; this.restartDelay = 1.1; this.aiThink = 0.7
    this.notice = `${p.team === 0 ? 'BLUE' : 'RED'} · ${kind}`
    // Keep opponents away from the restart taker.
    this.players.forEach(other => {
      if (other.team !== p.team && Math.hypot(other.x - p.x, other.y - p.y) < 85) {
        other.x = clamp(p.x + (p.team === 0 ? 90 : -90), L + 13, R - 13)
        other.y = clamp(p.y + (other.number % 2 ? 75 : -75), T + 13, B - 13)
      }
    })
  }
  private nearest(team: number, x = this.ball.x, y = this.ball.y, outfield = true) {
    let best = team * TEAM_SIZE + 1, distance = Infinity
    this.players.forEach((p, i) => {
      if (p.team !== team || (outfield && p.number === 1)) return
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < distance) { distance = d; best = i }
    })
    return best
  }
  private kick(index: number, angle: number, speed: number, shot = false) {
    const p = this.players[index]
    Object.assign(this.ball, { x: p.x + Math.cos(angle) * 22, y: p.y + Math.sin(angle) * 22,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed })
    this.holder = -1; this.passTarget = -1; this.lastTouch = p.team; this.pickupDelay = 0.18; this.charges[p.team] = 0
    if (shot) this.shots[p.team]++
    this.particles.burst(this.ball.x, this.ball.y, p.team === 0 ? COLORS.cyan : COLORS.coral, 8, 100)
  }
  private isHuman(index: number) {
    return index === this.selected[0] || (this.opponent === 'human' && index === this.selected[1])
  }
  private laneClearance(from: Footballer, to: Footballer) {
    const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy
    let clearance = 100
    this.players.forEach(q => {
      if (q.team === from.team) return
      const t = clamp(((q.x - from.x) * dx + (q.y - from.y) * dy) / Math.max(1, length), 0, 1)
      clearance = Math.min(clearance, Math.hypot(q.x - from.x - dx * t, q.y - from.y - dy * t))
    })
    return clearance
  }
  private passingOptions(index: number) {
    const p = this.players[index], direction = p.team === 0 ? 1 : -1
    return this.players.map((other, i) => {
      const dx = other.x - p.x, dy = other.y - p.y, distance = Math.hypot(dx, dy)
      const clearance = this.laneClearance(p, other)
      const openness = Math.min(100, ...this.players.filter(q => q.team !== p.team).map(q => Math.hypot(q.x - other.x, q.y - other.y)))
      const humanRequest = this.isHuman(i) && this.calls[p.team] > 0
      const score = this.isHuman(index)
        ? (dx * Math.cos(p.angle) + dy * Math.sin(p.angle)) / Math.max(distance, 1) * 160 + clearance + openness * 0.4 - distance * 0.1
        : dx * direction * 0.4 + clearance * 1.5 + openness * 0.6 - distance * 0.08 + (humanRequest ? 300 : this.isHuman(i) ? 25 : 0)
      return { other, i, distance, clearance, score }
    }).filter(({ other, i, distance }) => other.team === p.team && i !== index && other.number !== 1 && distance > 35 && distance < 550)
      .sort((a, b) => b.score - a.score)
  }
  private pass(index: number, targetIndex?: number) {
    const p = this.players[index]
    const target = targetIndex === undefined ? this.passingOptions(index)[0] : { other: this.players[targetIndex], i: targetIndex }
    if (!target) return
    const dx = target.other.x + target.other.vx * 0.15 - p.x, dy = target.other.y + target.other.vy * 0.15 - p.y
    this.kick(index, Math.atan2(dy, dx), clamp(Math.hypot(dx, dy) * 1.3, 290, 510))
    this.passes[p.team]++; this.passTarget = target.i; this.calls[p.team] = 0
  }
  private tackle(index: number) {
    const p = this.players[index]
    if (p.cooldown > 0 || this.holder < 0 || this.tackleGrace > 0) return
    p.cooldown = 0.45
    const owner = this.players[this.holder]
    if (owner.team === p.team || Math.hypot(owner.x - p.x, owner.y - p.y) > 58) return
    // A forgiving standing tackle wins possession immediately.
    this.charges[owner.team] = 0
    this.holder = index; this.passTarget = -1; this.lastTouch = p.team
    this.pickupDelay = 0; this.tackleGrace = 0.55; this.aiThink = 0.5
    this.ball.vx = 0; this.ball.vy = 0
    this.particles.burst(p.x, p.y, COLORS.lime, 10, 95)
  }
  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    // Opening kickoff and user pauses do not consume match time.
    if (!this.matchStarted) {
      if (this.restartDelay > 0) { this.restartDelay = Math.max(0, this.restartDelay - dt); return }
      this.matchStarted = true
    }
    if (this.clock > 0) {
      const regulationStep = Math.min(dt, this.clock)
      if (this.restartDelay > 0) this.lostTime += Math.min(regulationStep, this.restartDelay)
      this.clock = Math.max(0, this.clock - dt)
      if (this.clock === 0) {
        // Announce whole football minutes, at least one, to recover restart delays.
        this.addedMinutes = Math.max(1, Math.ceil(this.lostTime / SECONDS_PER_MINUTE))
        this.addedRemaining = this.addedMinutes * SECONDS_PER_MINUTE - (dt - regulationStep)
      }
    } else this.addedRemaining = Math.max(0, this.addedRemaining - dt)
    if (this.clock === 0 && this.addedRemaining <= 0) {
      const winner = this.scores[0] === this.scores[1] ? undefined : this.scores[0] > this.scores[1] ? 'PLAYER 1' : this.opponent === 'ai' ? 'AI' : 'PLAYER 2'
      this.finish({ headline: winner ? `${winner} WINS` : 'MATCH DRAWN', detail: `FULL TIME · 90 + ${this.addedMinutes} MIN · ${this.scores[0]}–${this.scores[1]}`, score: winner ? 1 : 0, winnerName: winner, recordEligible: !!winner }); return
    }
    if (this.restartDelay > 0) { this.restartDelay = Math.max(0, this.restartDelay - dt); return }
    this.tackleGrace = Math.max(0, this.tackleGrace - dt)
    this.pickupDelay = Math.max(0, this.pickupDelay - dt); this.aiThink -= dt
    this.calls = this.calls.map(time => Math.max(0, time - dt))
    this.players.forEach(p => { p.cooldown = Math.max(0, p.cooldown - dt) })
    for (let team = 0; team < 2; team++) {
      if (team === 1 && this.opponent === 'ai') continue
      if (input.wasPressed(team === 0 ? 'KeyR' : 'Slash')) this.calls[team] = 2.5
      const i = this.selected[team], p = this.players[i]
      const x = axis(input.down, team === 0 ? 'KeyA' : 'ArrowLeft', team === 0 ? 'KeyD' : 'ArrowRight')
      const y = axis(input.down, team === 0 ? 'KeyW' : 'ArrowUp', team === 0 ? 'KeyS' : 'ArrowDown')
      const aim = axis(input.down, team === 0 ? 'KeyQ' : 'Comma', team === 0 ? 'KeyE' : 'Period')
      const shootKey = team === 0 ? 'Space' : 'Enter'
      if (aim) p.angle += aim * 2.7 * dt
      else if ((x || y) && !input.isDown(shootKey)) p.angle = Math.atan2(y, x)
      const sprint = input.isDown(team === 0 ? 'ShiftLeft' : 'ShiftRight') && p.stamina > 0.05 && this.holder !== i
      const direction = normalize({ x, y }); const speed = this.holder === i ? 175 : sprint ? 280 : 210
      p.vx = direction.x * speed; p.vy = direction.y * speed; p.x += p.vx * dt; p.y += p.vy * dt
      p.stamina = clamp(p.stamina + (sprint && (x || y) ? -0.3 : 0.18) * dt, 0, 1)
      if (this.holder === i) {
        if (input.isDown(shootKey)) this.charges[team] = Math.min(1, this.charges[team] + dt / 0.85)
        if (input.released.has(shootKey)) this.kick(i, p.angle, 380 + this.charges[team] * 370, true)
        else if (input.wasPressed(team === 0 ? 'KeyF' : 'Semicolon')) this.pass(i)
      } else {
        this.charges[team] = 0
        if (input.wasPressed(shootKey)) this.tackle(i)
      }
    }
    for (let team = 0; team < 2; team++) {
      const direction = team === 0 ? 1 : -1
      const owner = this.holder >= 0 ? this.players[this.holder] : null
      const attacking = owner?.team === team
      // One autonomous player pressures the ball; others cover and offer passing lanes.
      const eligible = this.players.map((p, i) => ({ p, i })).filter(({ p, i }) => p.team === team && p.number !== 1 && !this.isHuman(i))
      eligible.sort((a, b) => Math.hypot(a.p.x - this.ball.x, a.p.y - this.ball.y) - Math.hypot(b.p.x - this.ball.x, b.p.y - this.ball.y))
      const chaser = this.passTarget >= 0 && this.players[this.passTarget].team === team && !this.isHuman(this.passTarget)
        ? this.passTarget : eligible[0]?.i
      this.players.forEach((p, i) => {
        if (p.team !== team || this.isHuman(i)) return
        let tx = p.homeX, ty = p.homeY
        if (p.number === 1) {
          tx = p.homeX; ty = clamp(300 + (this.ball.y - 300) * 0.6, GOAL_TOP + 10, GOAL_BOTTOM - 10)
          if (i === this.holder && this.aiThink <= 0) { p.angle = team === 0 ? 0 : Math.PI; this.pass(i); this.aiThink = 0.7 }
        } else if (i === this.holder) {
          const goalX = team === 0 ? R : L
          const keeper = this.players[(1 - team) * TEAM_SIZE]
          const shotY = keeper.y > 300 ? GOAL_TOP + 22 : GOAL_BOTTOM - 22
          tx = goalX - direction * 110; ty = shotY
          p.angle = Math.atan2(shotY - p.y, goalX - p.x)
          if (this.aiThink <= 0) {
            this.aiThink = 0.65
            const option = this.passingOptions(i).find(option => option.clearance > 24)
            const pressure = this.players.some(q => q.team !== team && Math.hypot(q.x - p.x, q.y - p.y) < 85)
            const requested = option && this.isHuman(option.i) && this.calls[team] > 0
            if (requested) this.pass(i, option.i)
            else if (Math.abs(goalX - p.x) < 310) this.kick(i, p.angle, 610, true)
            else if (option && (pressure || (option.other.x - p.x) * direction > 45)) this.pass(i, option.i)
          }
        } else if (i === chaser && !attacking) {
          tx = clamp(this.ball.x + this.ball.vx * 0.12, L + 20, R - 20)
          ty = clamp(this.ball.y + this.ball.vy * 0.12, T + 20, B - 20)
          if (this.holder >= 0) this.tackle(i)
        } else if (attacking && owner) {
          // Support the actual carrier, including the human, without crowding them.
          const role = i % TEAM_SIZE
          tx = role <= 2 ? p.homeX + (owner.x - 600) * 0.25 : owner.x + direction * (role === 5 ? 135 : 85)
          ty = role <= 2 ? p.homeY : owner.y + (role % 2 ? -105 : 105)
        } else if (owner) {
          // Mark nearby opponents and stay between their attackers and our goal.
          const attackers = this.players.filter(q => q.team !== team && q.number !== 1)
          const mark = attackers[(i % TEAM_SIZE - 1) % attackers.length]
          tx = mark.x - direction * 65; ty = mark.y
          if (i % TEAM_SIZE <= 2) tx = (tx + p.homeX) / 2
        } else {
          tx = p.homeX + (this.ball.x - 600) * 0.35
          ty = p.homeY + (this.ball.y - 300) * 0.18
        }
        tx = clamp(tx, L + 25, R - 25); ty = clamp(ty, T + 30, B - 30)
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy)
        const mainAi = team === 1 && this.opponent === 'ai' && i === this.selected[1]
        const speed = Math.min(p.number === 1 ? 135 : this.holder === i ? mainAi ? 175 : 155 : mainAi ? 210 : 185, d * 4)
        p.vx = d > 1 ? dx / d * speed : 0; p.vy = d > 1 ? dy / d * speed : 0
        p.x += p.vx * dt; p.y += p.vy * dt
        if (i !== this.holder && d > 3) p.angle = Math.atan2(dy, dx)
        // Avoid teammates so supporting runs stay spread out.
        this.players.forEach(q => {
          if (q === p || q.team !== team) return
          const gap = Math.hypot(p.x - q.x, p.y - q.y)
          if (gap > 0 && gap < 55) { p.x += (p.x - q.x) / gap * 30 * dt; p.y += (p.y - q.y) / gap * 30 * dt }
        })
      })
    }
    // Players occupy space without transferring hockey-style collision impulses.
    for (let a = 0; a < this.players.length; a++) for (let b = a + 1; b < this.players.length; b++) {
      const p = this.players[a], q = this.players[b], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy)
      if (d < p.r + q.r) {
        const amount = (p.r + q.r - d) / 2, nx = d ? dx / d : 1, ny = d ? dy / d : 0
        p.x -= nx * amount; p.y -= ny * amount; q.x += nx * amount; q.y += ny * amount
      }
    }
    this.players.forEach(p => { p.x = clamp(p.x, L + p.r, R - p.r); p.y = clamp(p.y, T + p.r, B - p.r) })
    if (this.holder >= 0) {
      const p = this.players[this.holder]
      this.ball.x = p.x + Math.cos(p.angle) * 21; this.ball.y = p.y + Math.sin(p.angle) * 21
      this.ball.vx = 0; this.ball.vy = 0
    } else {
      // Substeps prevent fast shots from tunnelling through a keeper or defender.
      const steps = Math.max(1, Math.ceil(Math.hypot(this.ball.vx, this.ball.vy) * dt / 7))
      for (let step = 0; step < steps; step++) {
        this.ball.x += this.ball.vx * dt / steps; this.ball.y += this.ball.vy * dt / steps
        if (this.checkOut()) return
        const catcher = this.players.findIndex(p => Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < p.r + 8 && (p.number === 1 || this.pickupDelay === 0))
        if (catcher >= 0) {
          const p = this.players[catcher]; this.holder = catcher; this.lastTouch = p.team; this.passTarget = -1
          this.charges[p.team] = 0; this.aiThink = 0.5; this.ball.vx = 0; this.ball.vy = 0
          break
        }
      }
      const drag = Math.exp(-0.85 * dt); this.ball.vx *= drag; this.ball.vy *= drag
      if (Math.hypot(this.ball.vx, this.ball.vy) < 6) { this.ball.vx = 0; this.ball.vy = 0 }
    }
    this.checkOut()
  }
  private checkOut() {
    const { x, y, r } = this.ball
    if (x + r < L || x - r > R) {
      const scoringTeam = x < L ? 1 : 0
      if (y - r > GOAL_TOP && y + r < GOAL_BOTTOM) {
        this.scores[scoringTeam]++; this.impact(8)
        this.kickoff(1 - scoringTeam, `${scoringTeam === 0 ? 'BLUE' : 'RED'} SCORES! · ${this.scores[0]}–${this.scores[1]}`)
      } else {
        const defender = x < L ? 0 : 1
        if (this.lastTouch === defender) {
          const team = 1 - defender
          this.restart(this.nearest(team, x, y), 'CORNER', x < L ? L + 16 : R - 16, y < 300 ? T + 16 : B - 16)
        } else this.restart(defender * TEAM_SIZE, 'GOAL KICK', x < L ? L + 60 : R - 60, 300)
      }
      return true
    }
    if (y + r < T || y - r > B) {
      const team = 1 - this.lastTouch
      this.restart(this.nearest(team, x, y), 'THROW IN', clamp(x, L + 25, R - 25), y < T ? T + 16 : B - 16)
      this.players[this.holder].angle = y < T ? Math.PI / 2 : -Math.PI / 2
      return true
    }
    return false
  }
  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); ctx.fillStyle = '#071b21'; ctx.fillRect(0, 0, 1200, 600)
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#207548' : '#226f45'; ctx.fillRect(L + i * 106, T, 106, B - T) }
    ctx.strokeStyle = '#d7eddb'; ctx.lineWidth = 2; ctx.strokeRect(L, T, R - L, B - T)
    ctx.beginPath(); ctx.moveTo(600, T); ctx.lineTo(600, B); ctx.stroke()
    ctx.beginPath(); ctx.arc(600, 300, 65, 0, Math.PI * 2); ctx.stroke()
    for (const side of [0, 1]) {
      const x = side === 0 ? L : R
      ctx.strokeRect(side === 0 ? L : R - 155, 170, 155, 260)
      ctx.strokeRect(side === 0 ? L : R - 55, 225, 55, 150)
      ctx.beginPath(); ctx.arc(side === 0 ? L + 110 : R - 110, 300, 3, 0, Math.PI * 2); ctx.fillStyle = '#d7eddb'; ctx.fill()
      ctx.fillStyle = '#ddece426'; ctx.fillRect(side === 0 ? x - 28 : x, GOAL_TOP, 28, GOAL_BOTTOM - GOAL_TOP)
      ctx.strokeRect(side === 0 ? x - 28 : x, GOAL_TOP, 28, GOAL_BOTTOM - GOAL_TOP)
      for (let y = GOAL_TOP; y < GOAL_BOTTOM; y += 10) { ctx.beginPath(); ctx.moveTo(x - (side === 0 ? 28 : 0), y); ctx.lineTo(x + (side === 0 ? 0 : 28), y); ctx.stroke() }
    }
    this.players.forEach((p, i) => {
      const color = p.number === 1 ? COLORS.amber : p.team === 0 ? COLORS.cyan : COLORS.coral
      if (i === this.selected[p.team]) {
        ctx.strokeStyle = p.team === 0 ? COLORS.cyan : COLORS.coral; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.fillText(this.isHuman(i) ? p.team === 0 ? 'YOU' : 'P2' : 'MAIN AI', p.x, p.y - 40); ctx.beginPath(); ctx.moveTo(p.x, p.y - 27); ctx.lineTo(p.x - 5, p.y - 34); ctx.lineTo(p.x + 5, p.y - 34); ctx.fill()
      }
      ctx.fillStyle = '#06231866'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 5, 14, 10, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#092231'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.number), p.x, p.y)
      if (i === this.selected[p.team]) {
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20)
        ctx.lineTo(p.x + Math.cos(p.angle) * (55 + this.charges[p.team] * 40), p.y + Math.sin(p.angle) * (55 + this.charges[p.team] * 40)); ctx.stroke()
        ctx.fillStyle = '#062318'; ctx.fillRect(p.x - 14, p.y + 23, 28, 3); ctx.fillStyle = COLORS.lime; ctx.fillRect(p.x - 14, p.y + 23, p.stamina * 28, 3)
      }
    })
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, 7, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#14282b'; ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, 3, 0, Math.PI * 2); ctx.fill()
    this.particles.render(ctx)
    ctx.fillStyle = '#d7eddb'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'
    ctx.fillText(this.restartDelay > 0 ? this.notice : this.addedMinutes > 0 ? `STOPPAGE TIME · +${this.addedMinutes} MINUTES` : 'BLUE →                          6-A-SIDE                          ← RED', 600, 34)
    ctx.font = '14px Arial'; ctx.fillText('R / slash: call for pass · F / semicolon: pass · Q E / , .: aim · hold & release shoot · Shift: sprint', 600, 573)
    ctx.restore()
  }
  getHud(): HudItem[] {
    const footballSeconds = Math.ceil((this.clock > 0 ? this.clock : this.addedRemaining) / SECONDS_PER_MINUTE * 60)
    const time = `${Math.floor(footballSeconds / 60)}:${String(footballSeconds % 60).padStart(2, '0')}`
    return [
      { label: 'BLUE', value: String(this.scores[0]), accent: COLORS.cyan },
      { label: this.addedMinutes > 0 ? `90 + ${this.addedMinutes}′ · STOPPAGE` : '90 MIN · COUNTDOWN', value: time },
      { label: 'YOU · #8', value: this.calls[0] > 0 ? 'CALLING FOR PASS' : this.holder === this.selected[0] ? 'ON THE BALL' : 'OFF THE BALL', accent: COLORS.cyan },
      { label: 'POSSESSION', value: this.restartDelay > 0 ? this.notice : this.holder < 0 ? 'LOOSE BALL' : `${this.players[this.holder].team === 0 ? 'BLUE' : 'RED'} #${this.players[this.holder].number}` },
      { label: 'PASSES / SHOTS', value: `${this.passes[0]} / ${this.shots[0]} · ${this.passes[1]} / ${this.shots[1]}` },
      { label: this.opponent === 'ai' ? 'RED · AI' : 'RED', value: String(this.scores[1]), accent: COLORS.coral },
    ]
  }
}
