import { BaseGame } from '../core/BaseGame'
import { circleHit, clamp, normalize, rand } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, axis, clearArena } from './common'

interface Shot { x: number; y: number; vx: number; vy: number; r: number; homing?: number }

export class BossRushGame extends BaseGame {
  private player = { x: 600, y: 500, r: 16, hp: 3, invulnerable: 0, dash: 0 }
  private boss = { x: 600, y: 130, r: 70, hp: 420, maxHp: 420 }
  private playerShots: Shot[] = []
  private enemyShots: Shot[] = []
  private shootCooldown = 0
  private attackTimer = 1
  private bossDirection = 1

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.playerShots = []; this.enemyShots = []; this.shootCooldown = 0; this.attackTimer = 1; this.bossDirection = 1; this.particles.clear()
    Object.assign(this.player, { x: 600, y: 500, hp: 3, invulnerable: 0, dash: 0 }); Object.assign(this.boss, { x: 600, y: 130, hp: 420 })
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt); this.player.invulnerable = Math.max(0, this.player.invulnerable - dt); this.player.dash = Math.max(0, this.player.dash - dt); this.shootCooldown -= dt
    const dx = axis(input.down, 'KeyA', 'KeyD'); const dy = axis(input.down, 'KeyW', 'KeyS'); const dir = normalize({ x: dx, y: dy })
    let speed = 285
    if (input.wasPressed('Space') && this.player.dash <= 0) { this.player.dash = 2; this.player.invulnerable = 0.24; speed = 850; this.particles.burst(this.player.x, this.player.y, COLORS.cyan, 10, 140) }
    this.player.x = clamp(this.player.x + dir.x * speed * dt, 35, 1165); this.player.y = clamp(this.player.y + dir.y * speed * dt, 235, 565)
    const aim = normalize({ x: input.pointer.x - this.player.x, y: input.pointer.y - this.player.y })
    if (input.pointer.down && this.shootCooldown <= 0) { this.shootCooldown = 0.12; this.playerShots.push({ x: this.player.x + aim.x * 22, y: this.player.y + aim.y * 22, vx: aim.x * 720, vy: aim.y * 720, r: 5 }) }

    const phase = this.phase()
    this.boss.x += this.bossDirection * (65 + phase * 25) * dt
    if (this.boss.x < 250 || this.boss.x > 950) this.bossDirection *= -1
    this.attackTimer -= dt
    if (this.attackTimer <= 0) { this.attack(phase); this.attackTimer = Math.max(0.38, 1.15 - phase * 0.2) }

    for (const shot of this.playerShots) { shot.x += shot.vx * dt; shot.y += shot.vy * dt; if (circleHit(shot, shot.r, this.boss, this.boss.r)) { shot.y = -100; this.boss.hp -= 6; this.particles.burst(shot.x, shot.y + 100, COLORS.coral, 5, 70) } }
    for (const shot of this.enemyShots) {
      if (shot.homing) { const target = normalize({ x: this.player.x - shot.x, y: this.player.y - shot.y }); shot.vx += target.x * shot.homing * dt; shot.vy += target.y * shot.homing * dt }
      shot.x += shot.vx * dt; shot.y += shot.vy * dt
      if (this.player.invulnerable <= 0 && circleHit(shot, shot.r, this.player, this.player.r)) { shot.y = 900; this.hitPlayer() }
    }
    this.playerShots = this.playerShots.filter((shot) => shot.x > -30 && shot.x < 1230 && shot.y > -30 && shot.y < 630)
    this.enemyShots = this.enemyShots.filter((shot) => shot.x > -60 && shot.x < 1260 && shot.y > -60 && shot.y < 680)
    if (this.boss.hp <= 0) { this.particles.burst(this.boss.x, this.boss.y, COLORS.violet, 70, 500); this.impact(16); this.finish({ headline: 'NULL POINTER DEFEATED', detail: `${this.elapsed.toFixed(2)} SECONDS · ${this.player.hp} HP LEFT`, score: this.elapsed }) }
  }

  private phase() { return this.boss.hp > 280 ? 1 : this.boss.hp > 140 ? 2 : 3 }

  private attack(phase: number) {
    if (phase === 1 || Math.random() < 0.45) {
      const aim = normalize({ x: this.player.x - this.boss.x, y: this.player.y - this.boss.y })
      for (let offset = -1; offset <= 1; offset += 1) { const angle = Math.atan2(aim.y, aim.x) + offset * 0.16; this.enemyShots.push({ x: this.boss.x, y: this.boss.y + 42, vx: Math.cos(angle) * 250, vy: Math.sin(angle) * 250, r: 9 }) }
    }
    if (phase >= 2 && Math.random() < 0.75) {
      const count = phase === 2 ? 12 : 18
      for (let i = 0; i < count; i += 1) { const angle = i / count * Math.PI * 2 + this.elapsed * 0.25; this.enemyShots.push({ x: this.boss.x, y: this.boss.y, vx: Math.cos(angle) * (150 + phase * 18), vy: Math.sin(angle) * (150 + phase * 18), r: 7 }) }
    }
    if (phase === 3 && Math.random() < 0.6) {
      const side = Math.random() < 0.5 ? -30 : 1230; this.enemyShots.push({ x: side, y: rand(255, 540), vx: side < 0 ? 105 : -105, vy: 0, r: 13, homing: 48 })
    }
  }

  private hitPlayer() {
    this.player.hp -= 1; this.player.invulnerable = 1; this.particles.burst(this.player.x, this.player.y, COLORS.cyan, 28, 330); this.impact(10)
    if (this.player.hp <= 0) this.finish({ headline: 'SYSTEM CRASHED', detail: `BOSS ${Math.max(0, Math.ceil(this.boss.hp / this.boss.maxHp * 100))}% REMAINING`, score: 9999, recordEligible: false })
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.4; ctx.lineWidth = 2; ctx.strokeRect(20, 20, 1160, 560); ctx.globalAlpha = 1
    const phaseColor = this.phase() === 1 ? COLORS.violet : this.phase() === 2 ? COLORS.coral : COLORS.lime
    ctx.save(); ctx.translate(this.boss.x, this.boss.y); ctx.shadowBlur = 28; ctx.shadowColor = phaseColor; ctx.fillStyle = '#16102d'; ctx.strokeStyle = phaseColor; ctx.lineWidth = 6; ctx.beginPath()
    for (let i = 0; i < 12; i += 1) { const angle = i / 12 * Math.PI * 2; const r = i % 2 ? 62 : 78; const x = Math.cos(angle) * r; const y = Math.sin(angle) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = phaseColor; ctx.fillRect(-36, -12, 19, 19); ctx.fillRect(17, -12, 19, 19); ctx.fillRect(-28, 28, 56, 8); ctx.restore()
    for (const shot of this.playerShots) { ctx.fillStyle = COLORS.cyan; ctx.shadowBlur = 10; ctx.shadowColor = COLORS.cyan; ctx.fillRect(shot.x - 3, shot.y - 7, 6, 14) }
    for (const shot of this.enemyShots) { ctx.fillStyle = shot.homing ? COLORS.lime : COLORS.coral; ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2); ctx.fill() }
    ctx.save(); ctx.translate(this.player.x, this.player.y); ctx.rotate(Math.atan2(0 - this.player.y + this.player.y, 1)); ctx.globalAlpha = this.player.invulnerable > 0 && Math.floor(this.player.invulnerable * 12) % 2 ? 0.3 : 1; ctx.fillStyle = COLORS.cyan; ctx.shadowBlur = 18; ctx.shadowColor = COLORS.cyan; ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(17, 18); ctx.lineTo(0, 10); ctx.lineTo(-17, 18); ctx.closePath(); ctx.fill(); ctx.restore()
    this.particles.render(ctx); ctx.shadowBlur = 0
    ctx.fillStyle = '#111b2b'; ctx.fillRect(310, 34, 580, 20); ctx.fillStyle = phaseColor; ctx.fillRect(314, 38, 572 * clamp(this.boss.hp / this.boss.maxHp, 0, 1), 12)
    ctx.fillStyle = COLORS.text; ctx.font = '800 22px Arial Narrow'; ctx.textAlign = 'center'; ctx.fillText(`NULL POINTER · PHASE ${this.phase()}`, 600, 82)
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'PLAYER HP', value: '●'.repeat(Math.max(0, this.player.hp)) + '○'.repeat(Math.max(0, 3 - this.player.hp)), accent: COLORS.cyan },
      { label: 'BOSS HP', value: `${Math.max(0, Math.ceil(this.boss.hp / this.boss.maxHp * 100))}%`, accent: this.phase() === 3 ? COLORS.lime : COLORS.coral },
      { label: 'DASH', value: this.player.dash <= 0 ? 'READY' : `${this.player.dash.toFixed(1)}s` },
    ]
  }
}
