import type { GameMeta, GameResult, GameRuntime, HudItem, InputFrame } from './types'
import { ParticleSystem } from './Particles'

export abstract class BaseGame implements GameRuntime {
  result: GameResult | null = null
  readonly particles = new ParticleSystem()
  protected elapsed = 0
  protected shake = 0

  constructor(public readonly meta: GameMeta) {}

  abstract reset(): void
  abstract update(dt: number, input: InputFrame): void
  abstract render(ctx: CanvasRenderingContext2D): void
  abstract getHud(): HudItem[]

  protected tickEffects(dt: number) {
    this.elapsed += dt
    this.shake = Math.max(0, this.shake - dt * 22)
    this.particles.update(dt)
  }

  protected finish(result: GameResult) {
    if (!this.result) this.result = result
  }

  protected impact(amount = 6) {
    this.shake = Math.max(this.shake, amount)
  }

  protected applyShake(ctx: CanvasRenderingContext2D) {
    if (this.shake <= 0) return
    ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)
  }

  destroy() { this.particles.clear() }
}
