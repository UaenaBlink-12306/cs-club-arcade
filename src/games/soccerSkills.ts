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
  cameraX: number
  cameraY: number
}

const FIELD = { left: 58, right: 1142, top: 112, bottom: 532 }
const GOAL = { top: 238, bottom: 366 }
const WIN_SCORE = 3
const STADIUM_BG = typeof Image === 'undefined' ? null : new Image()
if (STADIUM_BG) STADIUM_BG.src = '/assets/stadium-bg.png'

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
  /** Soft broadcast camera target. The camera follows the action instead of
   * locking the whole pitch to the viewport, while keeping enough of the
   * touchline visible for spatial context. */
  private cameraX = 600
  private cameraY = 320
  private keyboardCharge = 0
  private replayFrames: SoccerReplayFrame[] = []
  private replayEvents: SoccerReplayEvent[] = []
  private replayAccumulator = 0

  // The match simulation runs in a stable 2D field space. Rendering projects
  // that space into a shallow broadcast-camera frustum, then pointer input is
  // inverse-projected so the drag gesture still lands on the right player.
  private projectPoint(x: number, y: number) {
    const depth = clamp((y - FIELD.top) / (FIELD.bottom - FIELD.top), 0, 1)
    const scale = 0.84 + depth * 0.24
    // Pan the broadcast frame subtly with the selected player/ball. Keeping
    // the offset below 1:1 preserves a readable full-pitch composition while
    // still making the camera movement obvious during attacks.
    const panX = (this.cameraX - 600) * 0.62
    const panY = (this.cameraY - 320) * 0.42
    return { x: 600 + (x - 600 - panX) * scale, y: 118 + depth * 420 - panY, scale }
  }

  private unprojectPoint(x: number, y: number) {
    const panY = (this.cameraY - 320) * 0.42
    const depth = clamp((y - 118 + panY) / 420, 0, 1)
    const scale = 0.84 + depth * 0.24
    const panX = (this.cameraX - 600) * 0.62
    return { x: 600 + (x - 600) / scale + panX, y: FIELD.top + depth * (FIELD.bottom - FIELD.top) }
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
    this.cameraX = 600
    this.cameraY = 320
    this.keyboardCharge = 0
    this.attempts = 0
    this.saves = 0
    this.kickoffDelay = 0.8
    this.aiKickTimer = 0.7
    this.matchClock = 75
    this.phaseNotice = `${STAGES[this.stageIndex]} · BLUE ATTACKS →`
    this.charging = false
    this.charge = 0
    this.keyboardCharge = 0
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
    this.keyboardCharge = 0
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
    this.keyboardCharge = 0
    this.phaseNotice = message
    this.holder = team === 0 ? this.nearestPlayer(0, this.setPieceX, this.setPieceY) : this.nearestPlayer(1, this.setPieceX, this.setPieceY)
    if (this.holder < 0) this.holder = team === 0 ? BLUE_FIRST : WHITE_FIRST
    const p = this.players[this.holder]
    // Put the keyboard cursor on the taker for human set pieces; otherwise a
    // free kick after a turnover would require an extra rescue click.
    if (team === 0 || this.opponent === 'human') this.selected = this.holder
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
    // Tuned for readable build-up play: a light touch stays close while a
    // full charge can still reach the box without teleporting into the net.
    const power = 230 + this.charge * 520
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

  private canControlPlayer(index: number) {
    const p = this.players[index]
    return Boolean(p && !p.keeper && (p.team === 0 || this.opponent === 'human'))
  }

  /** Handle direct player control. This makes the match playable with a
   * keyboard even when a pointer is not available, while preserving the
   * original click-drag kick gesture. */
  private updateHumanMovement(dt: number, input: InputFrame) {
    if (!this.canControlPlayer(this.selected)) {
      // A loose-ball interception can temporarily select an AI player. Hand
      // control back to the nearest human outfielder automatically so the
      // user can keep pressing toward the action without a rescue click.
      const controlTeam: Team = this.opponent === 'human' && this.holder >= 0
        ? this.players[this.holder].team
        : 0
      const next = this.nearestPlayer(controlTeam, this.ball.x, this.ball.y)
      if (next >= 0) this.selected = next
    }
    if (!this.canControlPlayer(this.selected)) return
    const p = this.players[this.selected]
    const team = p.team
    const left = team === 0 ? 'KeyA' : 'ArrowLeft'
    const right = team === 0 ? 'KeyD' : 'ArrowRight'
    const up = team === 0 ? 'KeyW' : 'ArrowUp'
    const down = team === 0 ? 'KeyS' : 'ArrowDown'
    const kickKey = team === 0 ? 'Space' : 'Enter'
    const dx = (input.isDown(right) ? 1 : 0) - (input.isDown(left) ? 1 : 0)
    const dy = (input.isDown(down) ? 1 : 0) - (input.isDown(up) ? 1 : 0)
    const length = Math.hypot(dx, dy)
    const sprint = input.isDown(team === 0 ? 'ShiftLeft' : 'ShiftRight')
    const speed = sprint ? 305 : 225
    if (length > 0) {
      p.vx = dx / length * speed
      p.vy = dy / length * speed
      p.x = clamp(p.x + p.vx * dt, FIELD.left + 26, FIELD.right - 26)
      p.y = clamp(p.y + p.vy * dt, FIELD.top + 24, FIELD.bottom - 24)
      p.angle = Math.atan2(p.vy, p.vx)
    } else {
      // Ease velocity to a stop so releasing a direction never leaves the
      // controlled player sliding across the pitch.
      p.vx *= Math.exp(-10 * dt)
      p.vy *= Math.exp(-10 * dt)
    }

    // Pick up a loose ball by moving into it. If an opponent is in possession
    // the same key becomes a forgiving standing tackle.
    const distanceToBall = Math.hypot(p.x - this.ball.x, p.y - this.ball.y)
    if (this.holder < 0 && distanceToBall < p.r + this.ball.r + 18 && this.ball.z < 16) {
      this.holder = this.selected
      this.lastTouch = team
      this.ball.vx = 0; this.ball.vy = 0; this.ball.z = 0; this.ball.vz = 0
      this.phaseNotice = team === 0 ? 'BLUE · IN POSSESSION' : 'WHITE · IN POSSESSION'
    } else if (this.holder >= 0 && this.players[this.holder].team !== team && distanceToBall < p.r + 30 && input.wasPressed(kickKey)) {
      this.holder = this.selected
      this.lastTouch = team
      this.ball.vx = 0; this.ball.vy = 0; this.ball.z = 0; this.ball.vz = 0
      this.phaseNotice = team === 0 ? 'TACKLE WON · BLUE' : 'TACKLE WON · WHITE'
      this.particles.burst(p.x, p.y, team === 0 ? '#3f82ff' : '#f4f5ee', 8, 85)
    }

    // Hold Space/Enter for a short, controllable charge and release toward the
    // player's current facing. A kick never exceeds the tuned arcade cap.
    if (this.holder === this.selected) {
      if (input.isDown(kickKey)) {
        this.keyboardCharge = clamp(this.keyboardCharge + dt * 1.45, 0.18, 1)
        this.phaseNotice = team === 0 ? 'BLUE · CHARGING' : 'WHITE · CHARGING'
      }
      if (input.released.has(kickKey) && this.keyboardCharge > 0) {
        const aimX = length > 0 ? dx : team === 0 ? 1 : -1
        const aimY = length > 0 ? dy : 0
        this.charge = this.keyboardCharge
        this.kick(aimX, aimY)
        this.keyboardCharge = 0
      }
    } else if (!input.isDown(kickKey)) {
      this.keyboardCharge = 0
    }
  }

  private updateCamera(dt: number) {
    const focus = this.holder >= 0 ? this.players[this.holder] : this.ball
    if (!focus) return
    // Keep the focus in the playable middle while allowing the camera to
    // reveal more of the attacking third as the ball travels.
    const targetX = clamp(focus.x, 270, 930)
    const targetY = clamp(focus.y, 205, 435)
    const blend = 1 - Math.exp(-4.2 * dt)
    this.cameraX += (targetX - this.cameraX) * blend
    this.cameraY += (targetY - this.cameraY) * blend
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
      this.updateCamera(dt)
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

    // Keyboard control lives beside the original pointer gesture so the
    // match remains playable with either input method.
    this.updateHumanMovement(dt, input)

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
      // Grass friction should settle a pass in a reasonable distance.
      const drag = Math.exp(-2.6 * dt)
      this.ball.vx *= drag
      this.ball.vy *= drag
      if (Math.hypot(this.ball.vx, this.ball.vy) < 14) { this.ball.vx = 0; this.ball.vy = 0 }
    }

    this.updateCamera(dt)

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
      if (index === this.selected && this.canControlPlayer(index)) return
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
    if (this.ball.x + this.ball.r > FIELD.right && this.ball.y > GOAL.top && this.ball.y < GOAL.bottom) {
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
    if (this.ball.x - this.ball.r < FIELD.left && this.ball.y > GOAL.top && this.ball.y < GOAL.bottom) {
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
      cameraX: this.cameraX,
      cameraY: this.cameraY,
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
    this.cameraX = frame.cameraX
    this.cameraY = frame.cameraY
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

    // Cached stadium plate supplies the depth and human scale of a real broadcast.
    if (STADIUM_BG?.complete && STADIUM_BG.naturalWidth > 0) {
      ctx.drawImage(STADIUM_BG, 0, 0, 1200, 600)
    } else {
      const fallback = ctx.createLinearGradient(0, 0, 0, 600)
      fallback.addColorStop(0, '#071328'); fallback.addColorStop(.58, '#123c32'); fallback.addColorStop(1, '#072116')
      ctx.fillStyle = fallback; ctx.fillRect(0, 0, 1200, 600)
    }

    // Darkened broadcast glass over the photo so painted lines and players stay legible.
    const glass = ctx.createLinearGradient(0, 0, 0, 600)
    glass.addColorStop(0, 'rgba(2, 9, 20, .62)'); glass.addColorStop(.22, 'rgba(2, 9, 20, .14)'); glass.addColorStop(1, 'rgba(2, 19, 15, .28)')
    ctx.fillStyle = glass; ctx.fillRect(0, 0, 1200, 600)

    // Compact tournament rail.
    ctx.fillStyle = 'rgba(4, 12, 25, .92)'; ctx.fillRect(0, 0, 1200, 88)
    ctx.fillStyle = 'rgba(29, 214, 202, .18)'; ctx.fillRect(0, 86, 1200, 2)
    ctx.fillStyle = '#d9e9ef'; ctx.font = '800 12px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`${this.nationalTeam.toUpperCase()}  /  LIVE MATCH`, 24, 18)
    ctx.fillStyle = '#7e9cb2'; ctx.font = '700 10px Arial, sans-serif'; ctx.fillText('WORLD CUP 2026 · SKILLS ARENA', 24, 38)
    const stageWidth = 180
    STAGES.forEach((stage, index) => {
      const x = 286 + index * (stageWidth + 5)
      const active = index === this.stageIndex
      ctx.fillStyle = active ? 'rgba(255,207,59,.97)' : index < this.stageIndex ? 'rgba(63, 173, 132, .72)' : 'rgba(28, 51, 72, .8)'
      ctx.fillRect(x, 12, stageWidth, 22)
      ctx.fillStyle = active ? '#0a1624' : index < this.stageIndex ? '#e7fff0' : '#9cb1bf'
      ctx.font = '800 9px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(stage, x + stageWidth / 2, 23)
      if (index < STAGES.length - 1) { ctx.fillStyle = 'rgba(190, 220, 227, .34)'; ctx.fillRect(x + stageWidth + 2, 21, 3, 3) }
    })
    ctx.fillStyle = '#f4f6ee'; ctx.font = '800 18px Arial, sans-serif'; ctx.textAlign = 'center'
    const displayNotice = this.kickoffDelay > 0 ? (this.matchPhase === 'kickoff' ? 'GET READY' : `${this.matchPhase.replace('-', ' ').toUpperCase()} · READY`) : this.phaseNotice
    ctx.fillText(displayNotice, 600, 68)

    // Translucent tactical paint gives the photo a playable broadcast-pitch layer.
    const pitch = new Path2D()
    pitch.moveTo(142, 120); pitch.lineTo(1058, 108); pitch.lineTo(1192, 532); pitch.lineTo(8, 550); pitch.closePath()
    ctx.save(); ctx.clip(pitch)
    const turf = ctx.createLinearGradient(0, 100, 0, 560)
    turf.addColorStop(0, 'rgba(18, 123, 77, .64)'); turf.addColorStop(.55, 'rgba(10, 105, 56, .35)'); turf.addColorStop(1, 'rgba(1, 46, 26, .5)')
    ctx.fillStyle = turf; ctx.fillRect(0, 100, 1200, 460)
    for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 2 ? 'rgba(153,240,143,.07)' : 'rgba(0,30,25,.08)'; ctx.fillRect(0, 110 + i * 34, 1200, 34) }
    ctx.restore()
    ctx.strokeStyle = 'rgba(242, 252, 238, .88)'; ctx.lineWidth = 2.4; ctx.stroke(pitch)
    ctx.save(); ctx.clip(pitch)
    ctx.strokeStyle = 'rgba(236, 251, 239, .83)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(600, 115); ctx.lineTo(600, 540); ctx.stroke()
    ctx.beginPath(); ctx.arc(600, 328, 58, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(600, 328, 4, 0, Math.PI * 2); ctx.fillStyle = '#ecfaec'; ctx.fill()
    ctx.strokeRect(58, 218, 160, 214); ctx.strokeRect(924, 215, 218, 220)
    ctx.strokeRect(58, 256, 90, 138); ctx.strokeRect(1052, 255, 90, 138)
    ctx.beginPath(); ctx.arc(204, 328, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(996, 328, 3, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // Goal frame, net depth, and backboard LEDs.
    for (const side of [0, 1]) {
      const x = side === 0 ? 28 : 1142
      ctx.strokeStyle = '#f7f8ee'; ctx.lineWidth = 3; ctx.strokeRect(x, GOAL.top, 30, GOAL.bottom - GOAL.top)
      ctx.strokeStyle = 'rgba(225,240,240,.56)'; ctx.lineWidth = 1
      for (let y = GOAL.top; y <= GOAL.bottom; y += 13) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(side === 0 ? x + 30 : x - 30, y); ctx.stroke() }
      for (let y = GOAL.top; y <= GOAL.bottom; y += 26) { ctx.beginPath(); ctx.moveTo(side === 0 ? x + 30 : x - 30, y); ctx.lineTo(side === 0 ? x + 16 : x - 16, y); ctx.stroke() }
    }
    ctx.fillStyle = '#15d7cf'; ctx.fillRect(180, 536, 210, 14); ctx.fillRect(810, 536, 210, 14)
    ctx.fillStyle = '#072a37'; ctx.font = '800 9px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NEED FOR MADNESS', 285, 543); ctx.fillText('NEED FOR MADNESS', 915, 543)

    if (this.matchPhase !== 'open' && this.matchPhase !== 'kickoff' && this.matchPhase !== 'full-time') {
      const marker = this.projectPoint(this.setPieceX, this.setPieceY)
      ctx.strokeStyle = '#ffcf3b'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.arc(marker.x, marker.y, 22 * marker.scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#ffcf3b'; ctx.font = '800 11px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.matchPhase.replace('-', ' ').toUpperCase(), marker.x, marker.y - 28 * marker.scale)
    }

    if (this.charging && this.holder >= 0) {
      const p = this.players[this.holder]; const projectedPlayer = this.projectPoint(p.x, p.y); const projectedAim = this.projectPoint(this.aimX, this.aimY)
      ctx.strokeStyle = 'rgba(255, 243, 176, .92)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(projectedPlayer.x, projectedPlayer.y); ctx.lineTo(projectedAim.x, projectedAim.y); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#ffcf3b'; ctx.beginPath(); ctx.arc(projectedAim.x, projectedAim.y, (9 + this.charge * 9) * projectedAim.scale, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(6, 31, 29, .9)'; ctx.fillRect(projectedPlayer.x - 28 * projectedPlayer.scale, projectedPlayer.y - 34 * projectedPlayer.scale, 56 * projectedPlayer.scale, 6 * projectedPlayer.scale)
      ctx.fillStyle = '#ffcf3b'; ctx.fillRect(projectedPlayer.x - 27 * projectedPlayer.scale, projectedPlayer.y - 33 * projectedPlayer.scale, 54 * projectedPlayer.scale * this.charge, 4 * projectedPlayer.scale)
    }

    // Sort by world depth so front players overlap naturally.
    this.players.slice().sort((a, b) => a.y - b.y).forEach((p) => this.drawPlayer(ctx, p, this.players.indexOf(p) === this.selected && (p.team === 0 || this.opponent === 'human')))
    this.drawBall(ctx)
    this.particles.render(ctx)

    ctx.fillStyle = 'rgba(4, 12, 25, .86)'; ctx.fillRect(20, 558, 1160, 28)
    ctx.fillStyle = '#f4f6ee'; ctx.font = '600 13px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.charging || this.keyboardCharge > 0 ? 'CHARGING · RELEASE SPACE / ENTER TO STRIKE' : 'WASD / ARROWS MOVE · HOLD SPACE / ENTER TO KICK · CLICK + DRAG FOR AIM', 600, 577)
    const vignette = ctx.createRadialGradient(600, 300, 220, 600, 300, 760)
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.42)')
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, 1200, 600)
    ctx.restore()
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: Player, selected: boolean) {
    const projected = this.projectPoint(p.x, p.y)
    const depth = projected.scale
    const walking = Math.min(1, Math.hypot(p.vx, p.vy) / 180)
    const stride = Math.sin(this.elapsed * (8 + walking * 4) + p.number) * (2.8 + walking * 4)
    const facing = p.angle
    ctx.save(); ctx.translate(projected.x, projected.y); ctx.scale(depth, depth)

    // Ground contact and soft directional shadow sell the player's scale against the grass.
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(4, 13, p.r * 1.02, p.r * .44, 0, 0, Math.PI * 2); ctx.fill()
    const selectedTeam = WORLD_CUP_2026_BY_NAME[this.nationalTeam]
    const opponentTeam = WORLD_CUP_2026_BY_NAME[this.opponentNationalTeam]
    const shirt = p.keeper ? '#f3c844' : p.team === 0 ? (selectedTeam?.home.shirt ?? '#1b5fe0') : (opponentTeam?.home.shirt ?? '#f6f5ee')
    const trim = p.keeper ? '#121f31' : p.team === 0 ? (selectedTeam?.home.trim ?? '#d8423c') : (opponentTeam?.home.trim ?? '#1e2a39')
    const dark = '#111c2c'
    const skin = '#dca57b'

    // Legs: separate limbs, boots, and the cast shadow make the tiny player read as a human.
    ctx.save(); ctx.rotate(facing)
    ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-4, 9); ctx.lineTo(-5 + stride, 18); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(4, 9); ctx.lineTo(5 - stride, 18); ctx.stroke()
    ctx.strokeStyle = dark; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(-5 + stride, 18); ctx.lineTo(-9 + stride, 20); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(5 - stride, 18); ctx.lineTo(9 - stride, 20); ctx.stroke()
    ctx.restore()

    // Shirt is a shaded capsule with collar, sleeve highlights, and a crisp kit number.
    const torso = ctx.createLinearGradient(-p.r, -p.r, p.r, p.r)
    torso.addColorStop(0, 'rgba(255,255,255,.28)'); torso.addColorStop(.3, shirt); torso.addColorStop(1, 'rgba(0,0,0,.28)')
    ctx.fillStyle = torso; ctx.beginPath(); ctx.ellipse(0, 1, p.r * .73, p.r * .86, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = trim; ctx.fillRect(-p.r * .55, 6, p.r * 1.1, 4)
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -3, p.r * .47, Math.PI * .18, Math.PI * .82); ctx.stroke()
    ctx.strokeStyle = shirt; ctx.lineWidth = 4; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-p.r * .55, -1); ctx.lineTo(-p.r * .82, 7); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(p.r * .55, -1); ctx.lineTo(p.r * .82, 7); ctx.stroke()

    // Head, hair, and face light. Keep it graphic enough to read at broadcast distance.
    const head = ctx.createRadialGradient(-3, -p.r * .78, 1, 3, -p.r * .72, p.r * .62)
    head.addColorStop(0, '#f6c49a'); head.addColorStop(.72, skin); head.addColorStop(1, '#a86855')
    ctx.fillStyle = head; ctx.beginPath(); ctx.arc(0, -p.r * .74, p.r * .48, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, -p.r * .98, p.r * .42, Math.PI, Math.PI * 2); ctx.fill()
    ctx.fillRect(-p.r * .4, -p.r * .98, p.r * .8, p.r * .19)
    ctx.fillStyle = p.team === 0 && !p.keeper ? '#f1f7ff' : '#172436'
    ctx.font = '800 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.number), 0, 2)

    if (selected) {
      const pulse = Math.sin(this.elapsed * 6) * 2
      ctx.strokeStyle = '#ffcf3b'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,207,59,.55)'; ctx.shadowBlur = 12
      ctx.beginPath(); ctx.arc(0, 1, p.r + 10 + pulse, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0
      ctx.fillStyle = '#ffcf3b'; ctx.font = '800 11px Arial, sans-serif'; ctx.fillText('YOU', 0, -p.r - 18)
    }
    ctx.restore()
  }

  private drawBall(ctx: CanvasRenderingContext2D) {
    const projected = this.projectPoint(this.ball.x, this.ball.y)
    ctx.save(); ctx.translate(projected.x, projected.y); ctx.scale(projected.scale, projected.scale)
    const shadowScale = clamp(1 - this.ball.z / 220, .35, 1)
    ctx.fillStyle = `rgba(0,0,0,${.32 * shadowScale})`; ctx.beginPath(); ctx.ellipse(4, 8, 10 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2); ctx.fill()
    ctx.translate(0, -this.ball.z * .55)
    const speed = Math.hypot(this.ball.vx, this.ball.vy)
    if (speed > 260) {
      ctx.strokeStyle = 'rgba(255,255,255,.24)'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-this.ball.vx * .018, -this.ball.vy * .018); ctx.lineTo(-this.ball.vx * .05, -this.ball.vy * .05); ctx.stroke()
    }
    ctx.rotate(this.elapsed * 5)
    const ball = ctx.createRadialGradient(-3, -4, 1, 2, 2, this.ball.r + 2)
    ball.addColorStop(0, '#ffffff'); ball.addColorStop(.6, '#e7eef0'); ball.addColorStop(1, '#8c9ba9')
    ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(0, 0, this.ball.r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#24303b'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(28,40,52,.8)'; ctx.lineWidth = 1
    for (const a of [0.3, 2.4, 4.5]) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2); ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.stroke() }
    ctx.restore()
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

