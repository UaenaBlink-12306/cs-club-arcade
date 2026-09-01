export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const rand = (min: number, max: number) => min + Math.random() * (max - min)
export const pick = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)]
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
export const length = (v: Vec2) => Math.hypot(v.x, v.y)
export const normalize = (v: Vec2): Vec2 => {
  const len = length(v) || 1
  return { x: v.x / len, y: v.y / len }
}
export const circleHit = (a: Vec2, ar: number, b: Vec2, br: number) => distance(a, b) < ar + br
export const pointInRect = (p: Vec2, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
export const circleRectHit = (p: Vec2, radius: number, r: Rect) => {
  const x = clamp(p.x, r.x, r.x + r.w)
  const y = clamp(p.y, r.y, r.y + r.h)
  return Math.hypot(p.x - x, p.y - y) < radius
}

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 8) {
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function drawGlowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.save()
  ctx.shadowBlur = 18
  ctx.shadowColor = color
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds - mins * 60
  return mins > 0 ? `${mins}:${secs.toFixed(2).padStart(5, '0')}` : `${secs.toFixed(2)}s`
}
