import { rand } from './math'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export class ParticleSystem {
  private particles: Particle[] = []

  burst(x: number, y: number, color: string, count = 18, speed = 220) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2)
      const velocity = rand(speed * 0.35, speed)
      const life = rand(0.25, 0.62)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        maxLife: life,
        size: rand(2, 6),
        color,
      })
    }
  }

  trail(x: number, y: number, color: string, vx = 0, vy = 0) {
    const life = rand(0.18, 0.36)
    this.particles.push({ x, y, vx: vx + rand(-30, 30), vy: vy + rand(-30, 30), life, maxLife: life, size: rand(2, 5), color })
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= Math.pow(0.05, dt)
      p.vy *= Math.pow(0.05, dt)
    }
    this.particles = this.particles.filter((p) => p.life > 0)
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save()
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.restore()
  }

  clear() { this.particles = [] }
}
