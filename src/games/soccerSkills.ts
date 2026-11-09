import { BaseGame } from '../core/BaseGame'
import { clamp } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { WORLD_CUP_2026_BY_NAME } from '../data/worldCup2026'

type Team = 0 | 1
type MatchPhase = 'kickoff' | 'open' | 'throw-in' | 'corner' | 'goal-kick' | 'free-kick' | 'penalty' | 'full-time'
const STAGES = ['ROUND OF 32', 'ROUND OF 16', 'QUARTER FINAL', 'SEMI FINAL', 'WORLD CUP FINAL'] as const
const BLUE_KEEPER = 0
const BLUE_FIRST = 1
const WHITE_KEEPER = 12
const WHITE_FIRST = 13

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
  z: number
  vz: number
}

export interface SoccerReplayEvent {
  time: number
  label: string
}

interface SoccerReplayFrame {
  elapsed: number
  players: Player[]
  ball: Ball
  holder: number
  selected: number
  charging: boolean
  aimX: number
  aimY: number
  charge: number
  phaseNotice: string
  matchPhase: MatchPhase
  scores: [number, number]
  round: number
  stageIndex: number
  matchClock: number
  fouls: [number, number]
  lastTouch: Team
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
  private ball: Ball = { x: 330, y: 315, vx: 0, vy: 0, r: 8, z: 0, vz: 0 }
  private holder = 0
  private selected = 0
  private scores: [number, number] = [0, 0]
  private round = 1
  private phaseNotice = 'ROUND OF 32 · BLUE ATTACKS →'
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
  private stageIndex = 0
  private matchPhase: MatchPhase = 'kickoff'
  private setPieceTeam: Team = 0
  private setPieceX = 330
  private setPieceY = 315
  private setPieceTimer = 0
  private fouls = [0, 0]
  private foulCooldown = 0
  private penaltyAttempts = [0, 0]
  private penaltyTurn: Team = 0
  private penaltyAimY = 315
  private opponent: 'ai' | 'human' = 'ai'
  private nationalTeam = 'Brazil'
  private opponentNationalTeam = 'France'
  private penaltyShootout = false
  private penaltyShotTimer = 0
  private keeperMode: 'assist' | 'manual' = 'assist'
  private replayFrames: SoccerReplayFrame[] = []
  private replayEvents: SoccerReplayEvent[] = []
  private replayAccumulator = 0

  // The match simulation runs in a stable 2D field space. Rendering projects
  // that space into a shallow broadcast-camera frustum, then pointer input is
  // inverse-projected so the drag gesture still lands on the right player.
  private projectPoint(x: number, y: number) {
    const depth = clamp((y - FIELD.top) / (FIELD.bottom - FIELD.top), 0, 1)
    const scale = 0.84 + depth * 0.24
    return { x: 600 + (x - 600) * scale, y: 118 + depth * 420, scale }
  }

  private unprojectPoint(x: number, y: number) {
    const depth = clamp((y - 118) / 420, 0, 1)
    const scale = 0.84 + depth * 0.24
    return { x: 600 + (x - 600) / scale, y: FIELD.top + depth * (FIELD.bottom - FIELD.top) }
  }

  private worldPointer(pointer: InputFrame['pointer']) {
    const point = this.unprojectPoint(pointer.x, pointer.y)
    return { ...pointer, x: point.x, y: point.y }
  }

  private updateBallHeight(dt: number) {
    if (this.ball.z <= 0 && this.ball.vz <= 0) return
    this.ball.z += this.ball.vz * dt
    this.ball.vz -= 520 * dt
    if (this.ball.z <= 0) { this.ball.z = 0; this.ball.vz = 0 }
  }

  constructor(meta: GameMeta) {
    super(meta)
    this.reset()
  }

  setOpponent(opponent: 'ai' | 'human') {
    this.opponent = opponent
    this.reset()
  }

  setNationalTeam(team: string) {
    this.nationalTeam = team
    this.opponentNationalTeam = team === 'France' ? 'Brazil' : 'France'
  }

  private makeBall(x: number, y: number, vx = 0, vy = 0): Ball {
    return { x, y, vx, vy, r: 8, z: 0, vz: 0 }
  }

  setKeeperMode(mode: 'assist' | 'manual') {
    this.keeperMode = mode
    this.phaseNotice = mode === 'manual' ? 'KEEPER CONTROL · W/S OR TOUCH' : 'KEEPER ASSIST · TRACKING BALL'
  }

  getKeeperMode() { return this.keeperMode }

  moveKeeper(direction: -1 | 1) {
    const keeper = this.players[BLUE_KEEPER]
    if (!keeper) return
    this.keeperMode = 'manual'
    keeper.y = clamp(keeper.y + direction * 34, GOAL.top + 16, GOAL.bottom - 16)
    this.phaseNotice = direction < 0 ? 'KEEPER · UP' : 'KEEPER · DOWN'
  }

  performHeader() {
    const candidate = this.players
      .map((p, index) => ({ p, index, distance: Math.hypot(p.x - this.ball.x, p.y - this.ball.y) }))
      .filter(({ p, distance }) => p.team === 0 && !p.keeper && distance < 76)
      .sort((a, b) => a.distance - b.distance)[0]
    if (!candidate) return false
    const p = candidate.p
    const directionX = FIELD.right - p.x
    const directionY = GOAL.top + (GOAL.bottom - GOAL.top) / 2 - p.y
    const length = Math.max(1, Math.hypot(directionX, directionY))
    this.ball.x = p.x + (directionX / length) * 20
    this.ball.y = p.y + (directionY / length) * 20
    this.ball.vx = directionX / length * 540
    this.ball.vy = directionY / length * 540
    this.ball.z = 22
    this.ball.vz = 235
    this.holder = -1
    this.selected = candidate.index
    this.lastTouch = 0
    this.matchPhase = 'open'
    this.attempts++
    this.charging = false
    this.charge = 0
    this.phaseNotice = 'HEADER · BLUE ATTACK'
    this.particles.burst(p.x, p.y, '#ffcf3b', 12, 145)
    return true
  }

  getReplayLength() { return this.replayFrames.length }

  getReplayEvents() { return this.replayEvents.slice(-8) }

  renderReplay(ctx: CanvasRenderingContext2D, frameIndex: number) {
    const frame = this.replayFrames[clamp(frameIndex, 0, Math.max(0, this.replayFrames.length - 1))]
    if (!frame) { this.render(ctx); return }
    const current = this.captureReplayFrame()
    this.applyReplayFrame(frame)
    this.render(ctx)
    this.applyReplayFrame(current)
  }

  reset() {
    this.result = null
    this.elapsed = 0
    this.scores = [0, 0]
    this.round = 1
    this.stageIndex = 0
    this.matchPhase = 'kickoff'
    this.setPieceTeam = 0
    this.setPieceTimer = 0
    this.fouls = [0, 0]
    this.foulCooldown = 0
    this.penaltyAttempts = [0, 0]
    this.penaltyTurn = 0
    this.penaltyAimY = 315
    this.penaltyShootout = false
    this.penaltyShotTimer = 0
    this.keeperMode = 'assist'
    this.replayFrames = []
    this.replayEvents = []
    this.replayAccumulator = 0
    this.attempts = 0
    this.saves = 0
    this.kickoffDelay = 0.8
    this.aiKickTimer = 0.7
    this.matchClock = 75
    this.phaseNotice = `${STAGES[this.stageIndex]} · BLUE ATTACKS →`
    this.charging = false
    this.charge = 0
    this.createPlayers()
    this.holder = BLUE_FIRST
    this.selected = BLUE_FIRST
    const kickoffPlayer = this.players[this.holder]
    kickoffPlayer.x = 330
    kickoffPlayer.y = 315
    kickoffPlayer.angle = 0
    this.ball = this.makeBall(kickoffPlayer.x + 20, kickoffPlayer.y)
  }

  private createPlayers() {
    // Ten outfielders plus a goalkeeper per side. Formation positions are
    // deliberately spread across all three thirds so the broadcast view
    // reads like a complete 11-a-side match rather than a small arcade duel.
    const blue: Array<[number, number, number]> = [
      [2, 188, 238], [3, 188, 392], [4, 300, 225], [5, 300, 410],
      [6, 414, 276], [7, 414, 364], [8, 520, 210], [10, 520, 326],
      [11, 520, 438], [9, 430, 320],
    ]
    const white: Array<[number, number, number]> = [
      [2, 1012, 238], [3, 1012, 392], [4, 900, 225], [5, 900, 410],
      [6, 786, 276], [7, 786, 364], [8, 680, 210], [10, 680, 326],
      [11, 680, 438], [9, 770, 320],
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
    this.matchPhase = 'kickoff'
    this.penaltyShootout = false
    this.setPieceTeam = team
    this.setPieceTimer = 0.8
    this.kickoffDelay = 0.8
    this.aiKickTimer = 0.7
    this.charging = false
    this.charge = 0
    this.selected = team === 0 ? BLUE_FIRST : WHITE_FIRST
    this.holder = this.selected
    const p = this.players[this.holder]
    p.x = team === 0 ? 330 : 870
    p.y = 315
    p.angle = team === 0 ? 0 : Math.PI
    this.ball = this.makeBall(p.x + (team === 0 ? 20 : -20), p.y)
  }

  private setupSetPiece(kind: Exclude<MatchPhase, 'kickoff' | 'open' | 'full-time' | 'penalty'>, team: Team, x: number, y: number, message: string) {
    this.matchPhase = kind
    this.setPieceTeam = team
    this.setPieceX = clamp(x, FIELD.left + 34, FIELD.right - 34)
    this.setPieceY = clamp(y, FIELD.top + 22, FIELD.bottom - 22)
    this.setPieceTimer = 0.55
    this.kickoffDelay = 0.55
    this.charging = false
    this.charge = 0
    this.phaseNotice = message
    this.holder = team === 0 ? this.nearestPlayer(0, this.setPieceX, this.setPieceY) : this.nearestPlayer(1, this.setPieceX, this.setPieceY)
    if (this.holder < 0) this.holder = team === 0 ? BLUE_FIRST : WHITE_FIRST
    const p = this.players[this.holder]
    p.x = this.setPieceX
    p.y = this.setPieceY
    p.angle = team === 0 ? 0 : Math.PI
    this.ball = this.makeBall(p.x + (team === 0 ? 20 : -20), p.y)
  }

  private setupPenalty(team: Team, x: number, y: number, message: string) {
    this.matchPhase = 'penalty'
    this.penaltyShootout = false
    this.setPieceTeam = team
    this.setPieceX = x
    this.setPieceY = y
    this.phaseNotice = message
    this.kickoffDelay = 0.55
    this.penaltyShotTimer = 0
    this.charging = false
    this.charge = 0
    this.holder = team === 0 ? this.nearestPlayer(0, x, y) : this.nearestPlayer(1, x, y)
    if (this.holder < 0) this.holder = team === 0 ? BLUE_FIRST : WHITE_FIRST
    this.selected = this.holder
    const p = this.players[this.holder]
    p.x = x
    p.y = y
    p.angle = team === 0 ? 0 : Math.PI
    this.ball = this.makeBall(p.x + (team === 0 ? 22 : -22), p.y)
  }

  private advanceStage() {
    if (this.stageIndex >= STAGES.length - 1) {
      this.matchPhase = 'full-time'
      this.finish({ headline: 'WORLD CUP CHAMPIONS', detail: `${STAGES[this.stageIndex]} · FINAL ${this.scores[0]}–${this.scores[1]} · ${this.attempts} SHOTS`, score: this.scores[0], winnerName: 'BLUE', recordEligible: true })
      return
    }
    this.stageIndex++
    this.scores = [0, 0]
    this.round = 1
    this.matchClock = 75
    this.attempts = 0
    this.saves = 0
    this.phaseNotice = `${STAGES[this.stageIndex]} · BLUE KICK OFF`
    this.resetKickoff(0, this.phaseNotice)
  }

  private kick(directionX: number, directionY: number) {
    const p = this.players[this.holder]
    if (!p) return
    const length = Math.max(1, Math.hypot(directionX, directionY))
    const nx = directionX / length
    const ny = directionY / length
    const power = 320 + this.charge * 760
    p.angle = Math.atan2(ny, nx)
    this.ball.x = p.x + nx * 25
    this.ball.y = p.y + ny * 25
    this.ball.vx = nx * power
    this.ball.vy = ny * power
    this.ball.z = this.charge > 0.58 ? 8 + this.charge * 18 : 0
    this.ball.vz = this.charge > 0.58 ? 170 + this.charge * 90 : 0
    this.lastTouch = p.team
    this.holder = -1
    this.attempts++
    this.charge = 0
    if (this.matchPhase !== 'penalty') this.matchPhase = 'open'
    this.particles.burst(this.ball.x, this.ball.y, p.team === 0 ? '#2767ff' : '#f3f4f5', 10, 135)
  }

  private startShootout() {
    this.matchPhase = 'penalty'
    this.penaltyShootout = true
    this.penaltyAttempts = [0, 0]
    this.penaltyTurn = 0
    this.penaltyShotTimer = 0
    this.kickoffDelay = 0.75
    this.setPieceTimer = 0.75
    this.phaseNotice = 'PENALTY SHOOTOUT · BLUE TO KICK'
    this.createPlayers()
    this.holder = BLUE_FIRST
    this.selected = this.holder
    const p = this.players[this.holder]
    p.x = 938
    p.y = 315
    p.angle = 0
    this.players[WHITE_KEEPER].x = 1090
    this.players[WHITE_KEEPER].y = 315
    this.ball = this.makeBall(p.x + 22, p.y)
  }

  private kickPenalty(directionX: number, directionY: number) {
    const p = this.players[this.holder]
    if (!p) return
    const length = Math.max(1, Math.hypot(directionX, directionY))
    const nx = directionX / length
    const ny = directionY / length
    p.angle = Math.atan2(ny, nx)
    this.ball.x = p.x + nx * 24
    this.ball.y = p.y + ny * 24
    this.ball.vx = nx * 760
    this.ball.vy = ny * 760
    this.ball.z = 0
    this.ball.vz = 0
    this.holder = -1
    this.attempts++
    this.penaltyAttempts[this.penaltyTurn]++
    this.charge = 0
    this.phaseNotice = 'PENALTY · SHOT AWAY'
  }

  private resolvePenaltyAttempt(scored: boolean) {
    if (scored) this.scores[this.penaltyTurn]++
    this.penaltyTurn = (1 - this.penaltyTurn) as Team
    this.penaltyShotTimer = 0
    if (this.penaltyAttempts[0] >= 5 && this.penaltyAttempts[1] >= 5 && this.scores[0] !== this.scores[1]) {
      if (this.scores[0] > this.scores[1]) this.advanceStage()
      else this.finish({ headline: 'WHITE WINS ON PENALTIES', detail: `SHOOTOUT · ${this.scores[0]}–${this.scores[1]} · ${STAGES[this.stageIndex]}`, score: this.scores[0], winnerName: 'WHITE', recordEligible: false })
      return
    }
    if (this.penaltyAttempts[0] >= 5 && this.penaltyAttempts[1] >= 5 && this.scores[0] === this.scores[1]) this.phaseNotice = 'SUDDEN DEATH · NEXT GOAL WINS'
    const team = this.penaltyTurn
    this.createPlayers()
    this.holder = team === 0 ? BLUE_FIRST : WHITE_FIRST
    this.selected = this.holder
    const p = this.players[this.holder]
    p.x = team === 0 ? 938 : 262
    p.y = 315
    p.angle = team === 0 ? 0 : Math.PI
    this.players[team === 0 ? WHITE_KEEPER : BLUE_KEEPER].x = team === 0 ? 1090 : 110
    this.players[team === 0 ? WHITE_KEEPER : BLUE_KEEPER].y = 315
    this.ball = this.makeBall(p.x + (team === 0 ? 22 : -22), p.y)
    this.kickoffDelay = 0.55
    this.setPieceTimer = 0.55
    this.aiKickTimer = 0.65
    this.phaseNotice = team === 0 ? 'PENALTY · BLUE TO KICK' : 'PENALTY · WHITE TO KICK'
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

  private updatePenalty(dt: number, input: InputFrame) {
    if (this.kickoffDelay > 0) {
      this.kickoffDelay = Math.max(0, this.kickoffDelay - dt)
      return
    }
    if (!this.penaltyShootout) {
      const pointer = this.worldPointer(input.pointer)
      if (pointer.pressed) {
        const p = this.players[this.holder]
        if (p && p.team === 0 && Math.hypot(p.x - pointer.x, p.y - pointer.y) < 48) {
          this.charging = true; this.aimX = pointer.x; this.aimY = pointer.y; this.charge = 0.2
        }
      }
      if (this.charging && pointer.down) { this.aimX = pointer.x; this.aimY = pointer.y; this.charge = clamp(this.charge + dt * 0.7, 0.2, 1) }
      if (this.charging && pointer.released) { const p = this.players[this.holder]; if (p) this.kick(this.aimX - p.x, this.aimY - p.y); this.charging = false }
      if (this.holder < 0) {
        this.penaltyShotTimer += dt; this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt
        const keeper = this.players[WHITE_KEEPER]
        if (Math.hypot(keeper.x - this.ball.x, keeper.y - this.ball.y) < keeper.r + this.ball.r + 10) { this.saves++; this.phaseNotice = 'PENALTY SAVED'; this.resetKickoff(1, 'PENALTY SAVED · WHITE KICK OFF'); return }
        if (this.ball.x > FIELD.right || this.penaltyShotTimer > 1.8) {
          const scored = this.ball.x > FIELD.right && this.ball.y > GOAL.top && this.ball.y < GOAL.bottom
          if (scored) this.scores[0]++
          if (scored && this.scores[0] >= WIN_SCORE) this.advanceStage()
          else {
            this.round++
            this.resetKickoff(1, scored ? `PENALTY SCORED · ${this.nationalTeam.toUpperCase()}` : 'PENALTY MISSED · WHITE KICK OFF')
          }
        }
      }
      return
    }
    const pointer = this.worldPointer(input.pointer)
    if (this.holder >= 0 && this.penaltyTurn === 1 && this.opponent === 'ai') {
      this.aiKickTimer -= dt
      if (this.aiKickTimer <= 0) {
        this.charge = 0.8
        this.kickPenalty(FIELD.left - this.players[this.holder].x, 315 - this.players[this.holder].y + (this.elapsed % 1.2 - 0.6) * 90)
        this.aiKickTimer = 1.5
      }
    }
    if (pointer.pressed && (this.penaltyTurn === 0 || this.opponent === 'human')) {
      const p = this.players[this.holder]
      if (p && p.team === this.penaltyTurn && Math.hypot(p.x - pointer.x, p.y - pointer.y) < 48) {
        this.selected = this.holder
        this.charging = true
        this.aimX = pointer.x
        this.aimY = pointer.y
        this.charge = 0.2
      }
    }
    if (this.charging && pointer.down) {
      this.aimX = pointer.x
      this.aimY = pointer.y
      this.charge = clamp(this.charge + dt * 0.7, 0.2, 1)
    }
    if (this.charging && pointer.released) {
      const p = this.players[this.holder]
      if (p) this.kickPenalty(this.aimX - p.x, this.aimY - p.y)
      this.charging = false
    }
    if (this.holder < 0) {
      this.penaltyShotTimer += dt
      this.ball.x += this.ball.vx * dt
      this.ball.y += this.ball.vy * dt
      const keeper = this.players[this.penaltyTurn === 0 ? WHITE_KEEPER : BLUE_KEEPER]
      if (Math.hypot(keeper.x - this.ball.x, keeper.y - this.ball.y) < keeper.r + this.ball.r + 10 && Math.abs(this.ball.vx) > 200) {
        this.saves++
        this.phaseNotice = 'PENALTY SAVED'
        this.resolvePenaltyAttempt(false)
        return
      }
      const crossed = this.penaltyTurn === 0 ? this.ball.x > FIELD.right : this.ball.x < FIELD.left
      if (crossed || this.penaltyShotTimer > 1.8) {
        const scored = crossed && this.ball.y > GOAL.top && this.ball.y < GOAL.bottom
        this.resolvePenaltyAttempt(scored)
      }
    }
  }

  update(dt: number, input: InputFrame) {
    this.step(dt, input)
    this.recordReplayFrame(dt)
  }

  private step(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    this.updateBallHeight(dt)
    if (this.matchPhase === 'penalty') {
      this.updatePenalty(dt, input)
      return
    }
    this.matchClock = Math.max(0, this.matchClock - dt)
    this.foulCooldown = Math.max(0, this.foulCooldown - dt)
    if (this.kickoffDelay > 0) {
      this.kickoffDelay = Math.max(0, this.kickoffDelay - dt)
      return
    }

    if (this.keeperMode === 'manual') {
      if (input.isDown('KeyW')) this.moveKeeper(-1)
      if (input.isDown('KeyS')) this.moveKeeper(1)
    }
    if (input.wasPressed('KeyH')) this.performHeader()

    const pointer = this.worldPointer(input.pointer)
    const humanTeam: Team = this.opponent === 'human' && this.holder >= 0 ? this.players[this.holder].team : 0
    if (pointer.pressed) {
      const clicked = this.players
        .map((p, index) => ({ p, index, d: Math.hypot(p.x - pointer.x, p.y - pointer.y) }))
        .filter(({ p, d }) => p.team === humanTeam && !p.keeper && d < 46)
        .sort((a, b) => a.d - b.d)[0]
      if (clicked) this.selected = clicked.index
      if (clicked && clicked.index === this.holder && this.players[this.holder].team === humanTeam) {
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
      if (p) {
        if (this.penaltyShootout) this.kickPenalty(this.aimX - p.x, this.aimY - p.y)
        else this.kick(this.aimX - p.x, this.aimY - p.y)
      }
      this.charging = false
    }

    // White plays automatically in solo mode. In local multiplayer, the red
    // side is controlled with the same drag gesture when it has possession.
    if (this.opponent === 'ai' && this.holder >= 0 && this.players[this.holder]?.team === 1) {
      this.aiKickTimer -= dt
      if (this.aiKickTimer <= 0) {
        const targetY = clamp(315 + (this.ball.y - 315) * 0.32, GOAL.top + 18, GOAL.bottom - 18)
        this.charge = 0.7
        if (this.penaltyShootout) this.kickPenalty(FIELD.left - this.players[this.holder].x, targetY - this.players[this.holder].y)
        else this.kick(FIELD.left - this.players[this.holder].x, targetY - this.players[this.holder].y)
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
      this.ball.z = 0
      this.ball.vz = 0
    } else {
      const steps = Math.max(1, Math.ceil(Math.hypot(this.ball.vx, this.ball.vy) * dt / 9))
      for (let i = 0; i < steps; i++) {
        this.ball.x += this.ball.vx * dt / steps
        this.ball.y += this.ball.vy * dt / steps
        const keeperIndex = this.ball.vx > 0 ? WHITE_KEEPER : BLUE_KEEPER
        const keeper = this.players[keeperIndex]
        if (Math.abs(this.ball.vx) > 120 && this.ball.z < 44 && Math.hypot(keeper.x - this.ball.x, keeper.y - this.ball.y) < keeper.r + this.ball.r + 8) {
          this.saves++
          this.phaseNotice = 'GREAT SAVE · PLAY ON'
          this.ball.vx = -this.ball.vx * 0.36
          this.ball.vy += (this.ball.y - keeper.y) * 2.2
          this.lastTouch = keeper.team
          this.particles.burst(keeper.x, keeper.y, '#ffd43b', 8, 100)
          continue
        }
        if (this.checkGoal()) return
        if (this.ball.y - this.ball.r < FIELD.top || this.ball.y + this.ball.r > FIELD.bottom) {
          const team = (1 - this.lastTouch) as Team
          const y = this.ball.y < FIELD.top ? FIELD.top + 18 : FIELD.bottom - 18
          this.setupSetPiece('throw-in', team, clamp(this.ball.x, FIELD.left + 32, FIELD.right - 32), y, team === 0 ? 'THROW-IN · BLUE' : 'THROW-IN · WHITE')
          return
        }
        if (this.ball.x - this.ball.r < FIELD.left) {
          const team = this.lastTouch === 0 ? 1 : 0 as Team
          const kind = team === 1 ? 'corner' : 'goal-kick'
          this.setupSetPiece(kind, team, FIELD.left + 28, this.ball.y < 315 ? GOAL.top - 20 : GOAL.bottom + 20, kind === 'corner' ? 'CORNER · WHITE TO TAKE' : 'GOAL KICK · BLUE')
          return
        }
        if (this.ball.x + this.ball.r > FIELD.right) {
          const team = this.lastTouch === 1 ? 0 : 1 as Team
          const kind = team === 0 ? 'corner' : 'goal-kick'
          this.setupSetPiece(kind, team, FIELD.right - 28, this.ball.y < 315 ? GOAL.top - 20 : GOAL.bottom + 20, kind === 'corner' ? 'CORNER · BLUE TO TAKE' : 'GOAL KICK · WHITE')
          return
        }
        const catcher = this.players.findIndex((p) => Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < p.r + 7 && !p.keeper)
        const headerControl = this.ball.z > 12 && Math.hypot(this.ball.vx, this.ball.vy) < 680
        if (catcher >= 0 && (Math.hypot(this.ball.vx, this.ball.vy) < 400 || headerControl)) {
          this.holder = catcher
          this.selected = catcher
          this.lastTouch = this.players[catcher].team
          if (headerControl) this.phaseNotice = 'HEADER CONTROL · PLAY ON'
          this.ball.z = 0
          this.ball.vz = 0
          break
        }
      }
      const drag = Math.exp(-1.1 * dt)
      this.ball.vx *= drag
      this.ball.vy *= drag
      if (Math.hypot(this.ball.vx, this.ball.vy) < 14) { this.ball.vx = 0; this.ball.vy = 0 }
    }

    if (this.matchClock <= 0) {
      if (this.scores[0] === this.scores[1]) {
        this.startShootout()
        return
      }
      const winner = this.scores[0] > this.scores[1] ? 'BLUE' : 'WHITE'
      if (winner === 'BLUE') this.advanceStage()
      else this.finish({ headline: 'WHITE WINS THE TIE', detail: `FULL TIME · ${this.scores[0]}–${this.scores[1]} · ${STAGES[this.stageIndex]}`, score: this.scores[0], winnerName: winner, recordEligible: false })
    }
  }

  private updatePlayers(dt: number) {
    const holder = this.holder >= 0 ? this.players[this.holder] : undefined
    this.players.forEach((p, index) => {
      if (this.opponent === 'human' && p.team === 1 && !p.keeper) return
      if (p.keeper) {
        if (p.team === 0 && this.keeperMode === 'manual') return
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
          const foul = this.foulCooldown <= 0 && ((Math.floor(this.elapsed * 2.4) + index) % 4 === 0)
          if (foul) {
            this.fouls[1]++
            this.foulCooldown = 2.4
            const nearBox = holder.x > FIELD.right - 300
            if (nearBox) this.setupPenalty(0, FIELD.right - 185, GOAL.top + (GOAL.bottom - GOAL.top) / 2, 'PENALTY · BLUE TO KICK')
            else this.setupSetPiece('free-kick', 0, holder.x, holder.y, 'FOUL · BLUE FREE KICK')
          } else {
            this.holder = -1
            this.ball.x = holder.x
            this.ball.y = holder.y
            this.ball.vx = -130
            this.ball.vy = (p.y - holder.y) * 2.4
            this.lastTouch = 1
            this.phaseNotice = 'TACKLE · WHITE BREAKS FORWARD'
          }
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
        this.advanceStage()
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

  private captureReplayFrame(): SoccerReplayFrame {
    return {
      elapsed: this.elapsed,
      players: this.players.map((player) => ({ ...player })),
      ball: { ...this.ball },
      holder: this.holder,
      selected: this.selected,
      charging: this.charging,
      aimX: this.aimX,
      aimY: this.aimY,
      charge: this.charge,
      phaseNotice: this.phaseNotice,
      matchPhase: this.matchPhase,
      scores: [...this.scores] as [number, number],
      round: this.round,
      stageIndex: this.stageIndex,
      matchClock: this.matchClock,
      fouls: [...this.fouls] as [number, number],
      lastTouch: this.lastTouch,
    }
  }

  private applyReplayFrame(frame: SoccerReplayFrame) {
    this.elapsed = frame.elapsed
    this.players = frame.players.map((player) => ({ ...player }))
    this.ball = { ...frame.ball }
    this.holder = frame.holder
    this.selected = frame.selected
    this.charging = frame.charging
    this.aimX = frame.aimX
    this.aimY = frame.aimY
    this.charge = frame.charge
    this.phaseNotice = frame.phaseNotice
    this.matchPhase = frame.matchPhase
    this.scores = [...frame.scores] as [number, number]
    this.round = frame.round
    this.stageIndex = frame.stageIndex
    this.matchClock = frame.matchClock
    this.fouls = [...frame.fouls] as [number, number]
    this.lastTouch = frame.lastTouch
  }

  private recordReplayFrame(dt: number) {
    this.replayAccumulator += dt
    if (this.replayAccumulator < 0.05) return
    this.replayAccumulator = 0
    const frame = this.captureReplayFrame()
    const previous = this.replayFrames[this.replayFrames.length - 1]
    if (!previous || previous.phaseNotice !== frame.phaseNotice || previous.scores[0] !== frame.scores[0] || previous.scores[1] !== frame.scores[1]) {
      this.replayEvents.push({ time: frame.elapsed, label: frame.phaseNotice })
      if (this.replayEvents.length > 12) this.replayEvents.shift()
    }
    this.replayFrames.push(frame)
    if (this.replayFrames.length > 180) this.replayFrames.shift()
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
    const stageWidth = 188
    STAGES.forEach((stage, index) => {
      const x = 18 + index * (stageWidth + 4)
      ctx.fillStyle = index === this.stageIndex ? 'rgba(255,207,59,.92)' : 'rgba(7,18,34,.8)'
      ctx.fillRect(x, 14, stageWidth, 22)
      ctx.fillStyle = index === this.stageIndex ? '#081323' : index < this.stageIndex ? '#9fe4af' : '#8ea0b0'
      ctx.font = '800 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(stage, x + stageWidth / 2, 25)
    })
    ctx.fillStyle = '#0f1c2d'; ctx.fillRect(0, 92, 1200, 8)

    // Isometric-style trapezoid pitch.
    const pitch = new Path2D()
    pitch.moveTo(150, 122); pitch.lineTo(1050, 108); pitch.lineTo(1188, 530); pitch.lineTo(14, 548); pitch.closePath()
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

    // Broadcast ad boards and corner flags sell the same stadium scale as the reference.
    ctx.fillStyle = '#21d8d0'; ctx.fillRect(180, 536, 210, 15); ctx.fillRect(810, 536, 210, 15)
    ctx.fillStyle = '#092c35'; ctx.font = '800 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('NEED FOR MADNESS', 285, 544); ctx.fillText('NEED FOR MADNESS', 915, 544)
    ctx.fillStyle = '#20cbd3'; ctx.fillRect(60, 180, 10, 38); ctx.fillRect(1130, 178, 10, 38)
    ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.moveTo(70, 180); ctx.lineTo(96, 188); ctx.lineTo(70, 198); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(1130, 178); ctx.lineTo(1104, 186); ctx.lineTo(1130, 196); ctx.closePath(); ctx.fill()

    if (this.matchPhase !== 'open' && this.matchPhase !== 'kickoff' && this.matchPhase !== 'full-time') {
      const marker = this.projectPoint(this.setPieceX, this.setPieceY)
      ctx.strokeStyle = '#ffcf3b'; ctx.lineWidth = 3; ctx.setLineDash([6, 5])
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 22 * marker.scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#ffcf3b'; ctx.font = '800 11px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.matchPhase.replace('-', ' ').toUpperCase(), marker.x, marker.y - 28 * marker.scale)
    }

    if (this.charging && this.holder >= 0) {
      const p = this.players[this.holder]
      const projectedPlayer = this.projectPoint(p.x, p.y)
      const projectedAim = this.projectPoint(this.aimX, this.aimY)
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 3; ctx.setLineDash([8, 8])
      ctx.beginPath(); ctx.moveTo(projectedPlayer.x, projectedPlayer.y); ctx.lineTo(projectedAim.x, projectedAim.y); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#ffcf3b'; ctx.beginPath(); ctx.arc(projectedAim.x, projectedAim.y, (9 + this.charge * 9) * projectedAim.scale, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#0a2a25'; ctx.fillRect(projectedPlayer.x - 28 * projectedPlayer.scale, projectedPlayer.y - 34 * projectedPlayer.scale, 56 * projectedPlayer.scale, 6 * projectedPlayer.scale)
      ctx.fillStyle = '#ffcf3b'; ctx.fillRect(projectedPlayer.x - 27 * projectedPlayer.scale, projectedPlayer.y - 33 * projectedPlayer.scale, 54 * projectedPlayer.scale * this.charge, 4 * projectedPlayer.scale)
    }

    this.players.forEach((p, index) => this.drawPlayer(ctx, p, index === this.selected && (p.team === 0 || this.opponent === 'human')))
    this.drawBall(ctx)
    this.particles.render(ctx)

    ctx.fillStyle = '#f3f6ee'; ctx.font = '700 18px Arial, sans-serif'; ctx.textAlign = 'center'
    const displayNotice = this.kickoffDelay > 0 ? (this.matchPhase === 'kickoff' ? 'GET READY' : `${this.matchPhase.replace('-', ' ').toUpperCase()} · READY`) : this.phaseNotice
    ctx.fillText(displayNotice, 600, 76)
    ctx.fillStyle = 'rgba(4,15,26,.74)'; ctx.fillRect(20, 558, 1160, 28)
    ctx.fillStyle = '#f4f6ee'; ctx.font = '600 13px Arial, sans-serif'
    ctx.fillText(this.charging ? 'DRAG TO AIM · RELEASE TO SHOOT' : 'CLICK + HOLD A PLAYER · DRAG TO AIM · RELEASE TO SHOOT', 600, 577)
    ctx.restore()
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: Player, selected: boolean) {
    const projected = this.projectPoint(p.x, p.y)
    ctx.save(); ctx.translate(projected.x, projected.y); ctx.scale(projected.scale, projected.scale)
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(3, 10, p.r * 0.95, p.r * 0.45, 0, 0, Math.PI * 2); ctx.fill()
    const selectedTeam = WORLD_CUP_2026_BY_NAME[this.nationalTeam]
    const opponentTeam = WORLD_CUP_2026_BY_NAME[this.opponentNationalTeam]
    const shirt = p.keeper ? '#ffd43b' : p.team === 0 ? (selectedTeam?.home.shirt ?? '#1b5fe0') : (opponentTeam?.home.shirt ?? '#f6f5ee')
    const shorts = p.keeper ? '#e1e1dc' : p.team === 0 ? (selectedTeam?.home.trim ?? '#d8423c') : (opponentTeam?.home.trim ?? '#e1e1dc')
    ctx.fillStyle = shorts; ctx.beginPath(); ctx.ellipse(0, 10, p.r * 0.58, p.r * 0.32, 0, 0, Math.PI * 2); ctx.fill()
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
    const projected = this.projectPoint(this.ball.x, this.ball.y)
    ctx.save(); ctx.translate(projected.x, projected.y); ctx.scale(projected.scale, projected.scale)
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(3, 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.translate(0, -this.ball.z * 0.55)
    ctx.rotate(this.elapsed * 5)
    ctx.fillStyle = '#fbfbf4'; ctx.beginPath(); ctx.arc(0, 0, this.ball.r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#26313a'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }

  getHud(): HudItem[] {
    const minutes = Math.floor(this.matchClock / 60)
    const seconds = Math.floor(this.matchClock % 60).toString().padStart(2, '0')
    const possession = this.holder >= 0 ? (this.players[this.holder].team === 0 ? 'BLUE' : 'WHITE') : 'LOOSE BALL'
    const phase = this.matchPhase === 'open' ? 'OPEN PLAY' : this.matchPhase.replace('-', ' ').toUpperCase()
    return [
      { label: 'TOURNAMENT', value: `${STAGES[this.stageIndex]} · ${this.stageIndex + 1}/${STAGES.length}`, accent: '#ffcf3b' },
      { label: 'SCORE', value: `${this.scores[0]} – ${this.scores[1]}`, accent: '#3f82ff' },
      { label: 'CLOCK', value: `${minutes}:${seconds}` },
      { label: 'PHASE', value: phase, accent: phase === 'OPEN PLAY' ? '#b9f20b' : '#ffcf3b' },
      { label: 'SHOTS · FOULS', value: `${this.attempts} · ${this.fouls[0]}/${this.fouls[1]}` },
      { label: this.nationalTeam.toUpperCase(), value: possession, accent: possession === 'BLUE' ? '#3f82ff' : '#f4f5ee' },
    ]
  }
}

