import { GAME_HEIGHT, GAME_WIDTH, type InputFrame, type PointerState } from './types'

const BLOCKED_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Enter',
])

export class InputController {
  private down = new Set<string>()
  private pressed = new Set<string>()
  private released = new Set<string>()
  private pointer: PointerState = { x: 0, y: 0, down: false, pressed: false, released: false }
  private active = true

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown, { passive: false })
    window.addEventListener('keyup', this.onKeyUp, { passive: false })
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('blur', this.onBlur)
  }

  setActive(active: boolean) {
    this.active = active
    if (!active) this.onBlur()
  }

  snapshot(): InputFrame {
    const down = new Set(this.down)
    const pressed = new Set(this.pressed)
    const released = new Set(this.released)
    const pointer = { ...this.pointer }
    return {
      down,
      pressed,
      released,
      pointer,
      isDown: (...codes) => codes.some((code) => down.has(code)),
      wasPressed: (...codes) => codes.some((code) => pressed.has(code)),
    }
  }

  endFrame() {
    this.pressed.clear()
    this.released.clear()
    this.pointer.pressed = false
    this.pointer.released = false
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('blur', this.onBlur)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.active) return
    if (BLOCKED_KEYS.has(event.code)) event.preventDefault()
    if (!this.down.has(event.code)) this.pressed.add(event.code)
    this.down.add(event.code)
  }

  private onKeyUp = (event: KeyboardEvent) => {
    if (!this.active) return
    if (BLOCKED_KEYS.has(event.code)) event.preventDefault()
    this.down.delete(event.code)
    this.released.add(event.code)
  }

  private updatePointer(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * GAME_WIDTH
    this.pointer.y = ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT
  }

  private onPointerMove = (event: PointerEvent) => this.updatePointer(event)

  private onPointerDown = (event: PointerEvent) => {
    if (!this.active) return
    this.updatePointer(event)
    this.pointer.down = true
    this.pointer.pressed = true
    this.canvas.setPointerCapture?.(event.pointerId)
  }

  private onPointerUp = (event: PointerEvent) => {
    if (!this.active) return
    this.updatePointer(event)
    this.pointer.down = false
    this.pointer.released = true
  }

  private onBlur = () => {
    this.down.clear()
    this.pressed.clear()
    this.released.clear()
    this.pointer.down = false
    this.pointer.pressed = false
    this.pointer.released = false
  }
}
