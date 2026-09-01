type SoundName = 'ui' | 'start' | 'hit' | 'shoot' | 'score' | 'power' | 'lose' | 'win'

const STORE_KEY = 'cs-club-arcade:muted:v1'

function readMuted() {
  try { return localStorage.getItem(STORE_KEY) === 'true' } catch { return false }
}

export class ArcadeAudio {
  private context: AudioContext | null = null
  muted = readMuted()

  setMuted(value: boolean) {
    this.muted = value
    try { localStorage.setItem(STORE_KEY, String(value)) } catch { /* Sound still works for this session. */ }
  }

  toggle() {
    this.setMuted(!this.muted)
    if (!this.muted) this.play('ui')
  }

  play(name: SoundName) {
    if (this.muted) return
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    this.context ??= new AudioContextClass()
    if (this.context.state === 'suspended') void this.context.resume()

    const settings: Record<SoundName, [number, number, OscillatorType, number]> = {
      ui: [520, 760, 'square', 0.06],
      start: [220, 660, 'sawtooth', 0.18],
      hit: [120, 55, 'sawtooth', 0.12],
      shoot: [720, 260, 'square', 0.08],
      score: [620, 980, 'triangle', 0.12],
      power: [280, 920, 'sine', 0.18],
      lose: [260, 80, 'sawtooth', 0.32],
      win: [440, 1100, 'square', 0.34],
    }
    const [from, to, type, duration] = settings[name]
    const now = this.context.currentTime
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), now + duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(gain).connect(this.context.destination)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }
}

export const arcadeAudio = new ArcadeAudio()
