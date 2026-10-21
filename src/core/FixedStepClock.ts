// Keep gameplay and collision accuracy independent of the display refresh rate.
export class FixedStepClock {
  private accumulator = 0
  readonly step = 1 / 120

  reset() { this.accumulator = 0 }

  advance(seconds: number, update: (dt: number) => void) {
    this.accumulator += Math.min(0.25, Math.max(0, seconds))
    while (this.accumulator + 1e-9 >= this.step) {
      this.accumulator = Math.max(0, this.accumulator - this.step)
      update(this.step)
    }
  }
}
