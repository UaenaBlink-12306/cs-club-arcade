import { BaseGame } from '../core/BaseGame'
import { clamp } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, clearArena } from './common'

interface Block { x: number; y: number; w: number; h: number; color: string }

const palette = [COLORS.cyan, COLORS.violet, COLORS.coral, COLORS.lime, COLORS.amber]

export class TowerStackGame extends BaseGame {
  private blocks: Block[] = []
  private current: Block = { x: 0, y: 0, w: 210, h: 34, color: COLORS.cyan }
  private direction = 1
  private speed = 220
  private score = 0
  private perfect = 0
  private perfectFlash = 0

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.blocks = [{ x: 495, y: 540, w: 210, h: 34, color: '#203e58' }]; this.direction = 1; this.speed = 220; this.score = 0; this.perfect = 0; this.perfectFlash = 0; this.particles.clear(); this.spawnBlock()
  }

  private spawnBlock() {
    const previous = this.blocks[this.blocks.length - 1]
    this.current = { x: this.direction > 0 ? 90 : 1110 - previous.w, y: previous.y - 42, w: previous.w, h: 34, color: palette[this.score % palette.length] }
    this.direction *= -1; this.speed = Math.min(560, 220 + this.score * 13)
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt); this.perfectFlash = Math.max(0, this.perfectFlash - dt)
    this.current.x += this.direction * this.speed * dt
    if (this.current.x < 70) { this.current.x = 70; this.direction = 1 }
    if (this.current.x + this.current.w > 1130) { this.current.x = 1130 - this.current.w; this.direction = -1 }
    if (input.wasPressed('Space') || input.pointer.pressed) this.drop()
  }

  private drop() {
    const previous = this.blocks[this.blocks.length - 1]
    let left = Math.max(this.current.x, previous.x); const right = Math.min(this.current.x + this.current.w, previous.x + previous.w); let overlap = right - left
    const offset = Math.abs(this.current.x - previous.x)
    if (overlap <= 0) { this.particles.burst(this.current.x + this.current.w / 2, this.current.y, this.current.color, 34, 340); this.impact(12); this.finish({ headline: `${this.score} BLOCKS HIGH`, detail: this.score > 20 ? 'SKYLINE COMPLETE' : 'MISSED THE EDGE', score: this.score }); return }
    if (offset < 5) {
      this.perfect += 1; this.perfectFlash = 0.8; left = previous.x; overlap = Math.min(230, previous.w + (this.perfect % 3 === 0 ? 8 : 0)); this.particles.burst(previous.x + previous.w / 2, this.current.y, COLORS.lime, 20, 190)
    } else { this.perfect = 0; this.particles.burst(left + overlap / 2, this.current.y, this.current.color, 9, 90) }
    const landed = { ...this.current, x: left, w: overlap }
    this.blocks.push(landed); this.score += 1; this.impact(offset < 5 ? 4 : 2); this.spawnBlock()
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    const camera = Math.max(0, 160 - this.current.y)
    ctx.save(); ctx.translate(0, camera)
    ctx.fillStyle = '#0b1b30'; ctx.fillRect(0, 574, 1200, 80)
    for (const block of this.blocks) this.drawBlock(ctx, block)
    this.drawBlock(ctx, this.current)
    this.particles.render(ctx); ctx.restore()
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.25; ctx.setLineDash([8, 12]); ctx.beginPath(); ctx.moveTo(600, 0); ctx.lineTo(600, 600); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
    if (this.perfectFlash > 0) { ctx.globalAlpha = clamp(this.perfectFlash * 2, 0, 1); ctx.fillStyle = COLORS.lime; ctx.font = '800 64px Arial Narrow'; ctx.textAlign = 'center'; ctx.fillText('PERFECT!', 600, 105); ctx.globalAlpha = 1 }
    ctx.restore()
  }

  private drawBlock(ctx: CanvasRenderingContext2D, block: Block) {
    ctx.save(); ctx.fillStyle = block.color; ctx.shadowBlur = 14; ctx.shadowColor = block.color; ctx.fillRect(block.x, block.y, block.w, block.h); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(block.x + 3, block.y + 3, Math.max(0, block.w - 6), 4); ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'HEIGHT', value: `${this.score} BLOCKS`, accent: COLORS.text },
      { label: 'SCORE', value: String(this.score * 100 + this.perfect * 25), accent: COLORS.cyan },
      { label: 'STREAK', value: `${this.perfect} PERFECT`, accent: this.perfect > 0 ? COLORS.lime : COLORS.muted },
    ]
  }
}
