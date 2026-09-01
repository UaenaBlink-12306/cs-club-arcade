import { clamp, distance, normalize, type Vec2 } from '../core/math'

export const COLORS = {
  ink: '#061225',
  field: '#07172c',
  line: '#24415f',
  text: '#f4f1e8',
  muted: '#8ca0b8',
  cyan: '#18d8f2',
  coral: '#ff5b55',
  lime: '#b9f20b',
  violet: '#a45cff',
  amber: '#ffb928',
}

export interface Body extends Vec2 {
  vx: number
  vy: number
  r: number
  mass?: number
}

export function clearArena(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLORS.ink
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.strokeStyle = 'rgba(24,216,242,.08)'
  ctx.lineWidth = 1
  for (let x = 0; x <= ctx.canvas.width; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ctx.canvas.height); ctx.stroke()
  }
  for (let y = 0; y <= ctx.canvas.height; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ctx.canvas.width, y); ctx.stroke()
  }
}

export function moveBody(body: Body, xAxis: number, yAxis: number, dt: number, acceleration = 560, maxSpeed = 330, drag = 0.88) {
  const direction = normalize({ x: xAxis, y: yAxis })
  if (xAxis || yAxis) {
    body.vx += direction.x * acceleration * dt
    body.vy += direction.y * acceleration * dt
  }
  const damping = Math.pow(drag, dt * 10)
  body.vx *= damping
  body.vy *= damping
  const speed = Math.hypot(body.vx, body.vy)
  if (speed > maxSpeed) {
    body.vx = body.vx / speed * maxSpeed
    body.vy = body.vy / speed * maxSpeed
  }
  body.x += body.vx * dt
  body.y += body.vy * dt
}

export function resolveCircleCollision(a: Body, b: Body, restitution = 0.9) {
  const d = distance(a, b)
  const min = a.r + b.r
  if (d >= min || d === 0) return 0
  const nx = (b.x - a.x) / d
  const ny = (b.y - a.y) / d
  const overlap = min - d
  const ma = a.mass ?? 1
  const mb = b.mass ?? 1
  a.x -= nx * overlap * (mb / (ma + mb))
  a.y -= ny * overlap * (mb / (ma + mb))
  b.x += nx * overlap * (ma / (ma + mb))
  b.y += ny * overlap * (ma / (ma + mb))
  const rvx = b.vx - a.vx
  const rvy = b.vy - a.vy
  const along = rvx * nx + rvy * ny
  if (along > 0) return Math.abs(along)
  const impulse = -(1 + restitution) * along / (1 / ma + 1 / mb)
  a.vx -= impulse * nx / ma
  a.vy -= impulse * ny / ma
  b.vx += impulse * nx / mb
  b.vy += impulse * ny / mb
  return Math.abs(impulse)
}

export function drawPlayer(ctx: CanvasRenderingContext2D, body: Body, color: string, label: string, angle = 0) {
  ctx.save()
  ctx.translate(body.x, body.y)
  ctx.rotate(angle)
  ctx.shadowBlur = 16
  ctx.shadowColor = color
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(0, 0, body.r, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#fff'
  ctx.globalAlpha = 0.72
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(0, 0, body.r - 4, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = COLORS.ink
  ctx.font = `800 ${Math.max(12, body.r * 0.72)}px Arial Narrow, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 0, 1)
  ctx.restore()
}

export function axis(input: ReadonlySet<string>, negative: string, positive: string) {
  return (input.has(positive) ? 1 : 0) - (input.has(negative) ? 1 : 0)
}

export function keepInBounds(body: Body, left: number, top: number, right: number, bottom: number, bounce = 0.7) {
  if (body.x - body.r < left) { body.x = left + body.r; body.vx = Math.abs(body.vx) * bounce }
  if (body.x + body.r > right) { body.x = right - body.r; body.vx = -Math.abs(body.vx) * bounce }
  if (body.y - body.r < top) { body.y = top + body.r; body.vy = Math.abs(body.vy) * bounce }
  if (body.y + body.r > bottom) { body.y = bottom - body.r; body.vy = -Math.abs(body.vy) * bounce }
  body.x = clamp(body.x, left + body.r, right - body.r)
  body.y = clamp(body.y, top + body.r, bottom - body.r)
}
