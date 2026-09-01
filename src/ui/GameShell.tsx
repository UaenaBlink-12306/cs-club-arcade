import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX } from 'lucide-react'
import { arcadeAudio } from '../audio/ArcadeAudio'
import { InputController } from '../core/Input'
import { GAME_HEIGHT, GAME_WIDTH, type GameMeta, type GameResult, type HudItem } from '../core/types'
import { createGame } from '../games'
import { getBest, recordResult } from '../utils/storage'

type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over'

export function GameShell({ meta, onExit, onRecordsChanged }: { meta: GameMeta; onExit: () => void; onRecordsChanged: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [runtime] = useState(() => createGame(meta.id))
  const phaseRef = useRef<Phase>('ready')
  const recordedRef = useRef(false)
  const [phase, setPhaseState] = useState<Phase>('ready')
  const [countdown, setCountdown] = useState('3')
  const [hud, setHud] = useState<HudItem[]>(() => runtime.getHud())
  const [result, setResult] = useState<GameResult | null>(null)
  const [newBest, setNewBest] = useState(false)
  const [audioVersion, setAudioVersion] = useState(0)

  const setPhase = (value: Phase) => { phaseRef.current = value; setPhaseState(value) }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const input = new InputController(canvas)
    let frame = 0
    let last = performance.now()
    let lastHud = 0

    const loop = (now: number) => {
      const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
      last = now
      input.setActive(phaseRef.current === 'playing')
      if (phaseRef.current === 'playing') runtime.update(dt, input.snapshot())
      runtime.render(ctx)
      input.endFrame()

      if (now - lastHud > 90) { lastHud = now; setHud(runtime.getHud()) }
      if (phaseRef.current === 'playing' && runtime.result && !recordedRef.current) {
        recordedRef.current = true
        const recordUpdate = recordResult(meta, runtime.result)
        setNewBest(recordUpdate.isNewBest)
        if (recordUpdate.isNewBest) onRecordsChanged()
        arcadeAudio.play(runtime.result.headline.includes('CRASHED') ? 'lose' : 'win')
        setResult(runtime.result)
        setPhase('over')
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(frame); input.destroy(); runtime.destroy?.() }
  }, [meta, onRecordsChanged, runtime])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      if (phaseRef.current === 'playing') { event.preventDefault(); setPhase('paused'); arcadeAudio.play('ui') }
      else if (phaseRef.current === 'paused') { event.preventDefault(); setPhase('playing'); arcadeAudio.play('ui') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (phase !== 'countdown') return
    const timers = [
      window.setTimeout(() => { setCountdown('2'); arcadeAudio.play('ui') }, 600),
      window.setTimeout(() => { setCountdown('1'); arcadeAudio.play('ui') }, 1200),
      window.setTimeout(() => { setCountdown('GO!'); arcadeAudio.play('start') }, 1800),
      window.setTimeout(() => setPhase('playing'), 2200),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [phase])

  const start = () => { arcadeAudio.play('ui'); setCountdown('3'); setPhase('countdown') }
  const restart = () => { runtime.reset(); recordedRef.current = false; setResult(null); setNewBest(false); setHud(runtime.getHud()); setCountdown('3'); setPhase('countdown') }
  const toggleSound = () => { arcadeAudio.toggle(); setAudioVersion((value) => value + 1) }
  const best = getBest(meta.id)

  return (
    <main className="game-screen" style={{ '--game-accent': meta.accent } as React.CSSProperties} data-audio-version={audioVersion}>
      <header className="game-header">
        <button className="game-back" onClick={() => { arcadeAudio.play('ui'); onExit() }}><ArrowLeft aria-hidden="true" />Arcade</button>
        <h1>{meta.title}</h1>
        <div className="game-header-actions">
          <button className="action-button" disabled={phase === 'ready' || phase === 'countdown' || phase === 'over'} onClick={() => setPhase(phase === 'paused' ? 'playing' : 'paused')}>{phase === 'paused' ? <Play /> : <Pause />}{phase === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="action-button" onClick={toggleSound}>{arcadeAudio.muted ? <VolumeX /> : <Volume2 />}{arcadeAudio.muted ? 'Sound off' : 'Sound on'}</button>
        </div>
      </header>

      <section className="hud-strip" aria-label="Game status">
        {hud.map((item) => <div className="hud-item" key={item.label}><span>{item.label}</span><strong style={{ color: item.accent }}>{item.value}</strong></div>)}
      </section>

      <section className="game-stage">
        <div className="canvas-frame">
          <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} aria-label={`${meta.title} play field`} />
          {phase === 'ready' && (
            <div className="game-overlay ready-overlay">
              <span className="overlay-rule" />
              <h2>{meta.title}</h2>
              <p>{meta.description}</p>
              <div className="controls-list">{meta.controls.map((control) => <kbd key={control}>{control}</kbd>)}</div>
              <button className="action-button action-primary overlay-primary" autoFocus onClick={start}>Start round</button>
              {meta.players === 1 && best && <small>Device best · {meta.formatRecord(best.score)}</small>}
            </div>
          )}
          {phase === 'countdown' && <div className="game-overlay countdown-overlay" aria-live="assertive"><strong>{countdown}</strong></div>}
          {phase === 'paused' && (
            <div className="game-overlay pause-overlay"><h2>Paused</h2><p>Take a breath. The arena is frozen.</p><button className="action-button action-primary overlay-primary" onClick={() => setPhase('playing')}><Play />Resume</button><button className="text-button" onClick={onExit}>Return to arcade</button></div>
          )}
          {phase === 'over' && result && (
            <div className="game-overlay over-overlay" aria-live="polite">
              <span className="result-label">{newBest ? 'Record broken' : 'Round complete'}</span>
              <h2>{result.headline}</h2>
              <p>{result.detail}</p>
              {newBest && <div className="new-best-banner"><Trophy aria-hidden="true" />New device best · {meta.formatRecord(result.score)}</div>}
              <div className="result-actions"><button className="action-button action-primary overlay-primary" autoFocus onClick={restart}><RotateCcw />Replay</button><button className="action-button" onClick={onExit}>Arcade menu</button></div>
            </div>
          )}
        </div>
      </section>

      <footer className="game-footer"><span>{meta.controls.join('  ·  ')}</span><span>Esc · Pause</span></footer>
    </main>
  )
}
