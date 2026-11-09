import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Film, Maximize2, Minimize2, Pause, Play, RotateCcw, Shield, Trophy, Volume2, VolumeX } from 'lucide-react'
import { arcadeAudio } from '../audio/ArcadeAudio'
import { InputController } from '../core/Input'
import { GAME_HEIGHT, GAME_WIDTH, type GameMeta, type GameResult, type HudItem } from '../core/types'
import { createGame } from '../games'
import { AirHockeyGame, type HockeyOpponent, type HockeyMatchFormat } from '../games/airHockey'
import { SoccerSkillsGame } from '../games/soccerSkills'
import { WORLD_CUP_2026_TEAMS, type WorldCup2026Team } from '../data/worldCup2026'
import { getBest, recordResult } from '../utils/storage'

type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over'
type SoccerOpponent = 'ai' | 'human'
const SOCCER_TEAM_GROUPS = WORLD_CUP_2026_TEAMS.reduce<Record<string, WorldCup2026Team[]>>((groups, team) => {
  ;(groups[team.confederation] ??= []).push(team)
  return groups
}, {})

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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hockeyOpponent, setHockeyOpponent] = useState<HockeyOpponent>('ai')
  const [hockeyFormat, setHockeyFormat] = useState<HockeyMatchFormat>('extra-time')
  const [soccerOpponent, setSoccerOpponent] = useState<SoccerOpponent>('ai')
  const [soccerTeam, setSoccerTeam] = useState<string>('Brazil')
  const [keeperMode, setKeeperMode] = useState<'assist' | 'manual'>('assist')
  const [replayActive, setReplayActive] = useState(false)
  const [replayReady, setReplayReady] = useState(false)
  const [replayProgress, setReplayProgress] = useState(0)
  const [replayEvents, setReplayEvents] = useState<Array<{ time: number; label: string }>>([])
  const replayActiveRef = useRef(false)
  const replayClockRef = useRef(0)
  const replayIndexRef = useRef(0)
  const replayPhaseRef = useRef<Phase>('paused')
  const isClassicHockey = runtime instanceof AirHockeyGame && runtime.variant === 'classic'
  const isHockey = runtime instanceof AirHockeyGame
  const isSoccerSkills = runtime instanceof SoccerSkillsGame
  const isShootout = runtime instanceof AirHockeyGame && hud.some((item) => item.label === 'PENALTY SHOOTOUT' || item.label === 'SUDDEN DEATH')
  const soccerControls = soccerOpponent === 'human' ? 'P1 / P2 · CLICK + HOLD · AIM · RELEASE · H HEADER' : 'CLICK + HOLD · AIM · RELEASE · H HEADER'
  const hockeyControls = isShootout
    ? (hockeyOpponent === 'ai' ? 'PENALTIES · W/S AIM OR MOVE KEEPER · SPACE SHOOT' : 'PENALTIES · P1: W/S · SPACE | P2: ↑/↓ · ENTER · AIM OR MOVE KEEPER')
    : (hockeyOpponent === 'ai' ? 'WASD MOVE · STRIKE THE PUCK' : 'P1 · WASD  ·  P2 · ARROWS  ·  STRIKE THE PUCK')

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
      input.setActive(phaseRef.current === 'playing' && !replayActiveRef.current)
      if (replayActiveRef.current && runtime instanceof SoccerSkillsGame) {
        replayClockRef.current += dt
        const length = runtime.getReplayLength()
        replayIndexRef.current = Math.min(Math.max(0, length - 1), Math.floor(replayClockRef.current / 0.05))
        runtime.renderReplay(ctx, replayIndexRef.current)
        setReplayProgress(length > 1 ? replayIndexRef.current / (length - 1) : 0)
        if (replayIndexRef.current >= length - 1) {
          replayActiveRef.current = false
          setReplayActive(false)
          setReplayProgress(1)
          setPhase(replayPhaseRef.current)
        }
      } else {
        if (phaseRef.current === 'playing') runtime.update(dt, input.snapshot())
        runtime.render(ctx)
      }
      input.endFrame()

      if (now - lastHud > 90) {
        lastHud = now
        setHud(runtime.getHud())
        if (runtime instanceof SoccerSkillsGame) {
          setReplayReady(runtime.getReplayLength() > 2)
          setReplayEvents(runtime.getReplayEvents())
        }
      }
      if (phaseRef.current === 'playing' && runtime.result && !recordedRef.current) {
        recordedRef.current = true
        const recordUpdate = recordResult(meta, runtime.result)
        setNewBest(recordUpdate.isNewBest)
        if (recordUpdate.isNewBest) onRecordsChanged()
        arcadeAudio.play(runtime.result.headline.includes('CRASHED') || runtime.result.winnerName === 'AI' ? 'lose' : 'win')
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
      if (isSoccerSkills && phaseRef.current === 'playing' && !replayActiveRef.current) {
        if (event.code === 'KeyH') {
          event.preventDefault()
          runtime.performHeader()
          return
        }
        if (keeperMode === 'manual' && (event.code === 'KeyW' || event.code === 'ArrowUp')) {
          event.preventDefault()
          runtime.moveKeeper(-1)
          return
        }
        if (keeperMode === 'manual' && (event.code === 'KeyS' || event.code === 'ArrowDown')) {
          event.preventDefault()
          runtime.moveKeeper(1)
          return
        }
      }
      if (event.code !== 'Escape') return
      if (phaseRef.current === 'playing') { event.preventDefault(); setPhase('paused'); arcadeAudio.play('ui') }
      else if (phaseRef.current === 'paused') { event.preventDefault(); setPhase('playing'); arcadeAudio.play('ui') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isSoccerSkills, keeperMode, runtime])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
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

  const start = (opponent?: HockeyOpponent | SoccerOpponent) => {
    if (runtime instanceof AirHockeyGame) {
      const selected: HockeyOpponent = opponent === 'human' ? 'human' : 'ai'
      runtime.setMatchFormat(hockeyFormat)
      runtime.setOpponent(selected)
      setHockeyOpponent(selected)
      setHud(runtime.getHud())
    } else if (runtime instanceof SoccerSkillsGame) {
      const selected: SoccerOpponent = opponent === 'human' ? 'human' : 'ai'
      runtime.setOpponent?.(selected)
      runtime.setNationalTeam?.(soccerTeam)
      runtime.setKeeperMode(keeperMode)
      setSoccerOpponent(selected)
      setReplayReady(false)
      setReplayProgress(0)
      setHud(runtime.getHud())
    }
    arcadeAudio.play('ui'); setCountdown('3'); setPhase(isClassicHockey && hockeyFormat === 'shootout-only' ? 'playing' : 'countdown')
  }
  const restart = () => { replayActiveRef.current = false; setReplayActive(false); setReplayReady(false); setReplayProgress(0); runtime.reset(); recordedRef.current = false; setResult(null); setNewBest(false); setHud(runtime.getHud()); setCountdown('3'); setPhase(isClassicHockey && hockeyFormat === 'shootout-only' ? 'playing' : 'countdown') }
  const toggleSound = () => { arcadeAudio.toggle(); setAudioVersion((value) => value + 1) }
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen?.()
    else await document.documentElement.requestFullscreen?.()
    setIsFullscreen(Boolean(document.fullscreenElement))
  }
  const startReplay = () => {
    if (!isSoccerSkills || !replayReady || replayActiveRef.current) return
    replayPhaseRef.current = phaseRef.current === 'playing' ? 'playing' : 'paused'
    replayClockRef.current = 0
    replayIndexRef.current = 0
    replayActiveRef.current = true
    setReplayProgress(0)
    setReplayActive(true)
    setPhase('paused')
  }
  const toggleKeeperMode = () => {
    if (!isSoccerSkills) return
    const next = keeperMode === 'assist' ? 'manual' : 'assist'
    runtime.setKeeperMode(next)
    setKeeperMode(next)
  }
  const best = getBest(meta.id)
  const selectedSoccerTeam = WORLD_CUP_2026_TEAMS.find((team) => team.name === soccerTeam) ?? WORLD_CUP_2026_TEAMS[0]

  return (
    <main className="game-screen" style={{ '--game-accent': meta.accent } as React.CSSProperties} data-audio-version={audioVersion}>
      <header className="game-header">
        <button className="game-back" onClick={() => { arcadeAudio.play('ui'); onExit() }}><ArrowLeft aria-hidden="true" />Arcade</button>
        <h1>{meta.title}</h1>
        <div className={`game-header-actions ${isSoccerSkills ? 'soccer-header-actions' : ''}`}>
          <button className="action-button" disabled={phase === 'ready' || phase === 'countdown' || phase === 'over'} onClick={() => setPhase(phase === 'paused' ? 'playing' : 'paused')}>{phase === 'paused' ? <Play /> : <Pause />}{phase === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="action-button" onClick={toggleSound}>{arcadeAudio.muted ? <VolumeX /> : <Volume2 />}{arcadeAudio.muted ? 'Sound off' : 'Sound on'}</button>
          <button className="action-button" onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 /> : <Maximize2 />}{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
          {isSoccerSkills && <button className="action-button" disabled={!replayReady || phase === 'ready' || phase === 'countdown' || phase === 'over'} onClick={startReplay}><Film />Replay</button>}
          {isSoccerSkills && <button className="action-button" onClick={toggleKeeperMode}><Shield />{keeperMode === 'assist' ? 'Keeper assist' : 'Keeper manual'}</button>}
        </div>
      </header>

      <section className="hud-strip" aria-label="Game status">
        {hud.map((item) => <div className="hud-item" key={item.label}><span>{item.label}</span><strong style={{ color: item.accent }}>{item.value}</strong></div>)}
      </section>

      <section className="game-stage">
        <div className={`canvas-frame ${isClassicHockey && phase === 'ready' ? 'classic-setup-frame' : ''} ${isSoccerSkills && phase === 'ready' ? 'soccer-setup-frame' : ''}`}>
          <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} aria-label={`${meta.title} play field`} />
          {phase === 'ready' && (
            <div className={`game-overlay ready-overlay ${isHockey ? 'hockey-ready-overlay' : ''} ${isSoccerSkills ? 'soccer-skills-ready-overlay' : ''}`}>
              <span className="overlay-rule" />
              <h2>{meta.title}</h2>
              <p>{isSoccerSkills ? 'Choose from the 48-team 2026 World Cup field, then lead your nation from the Round of 32 through the Round of 16, quarter-finals, semi-final and final. Play 11-a-side matches with passing, headers, throw-ins, corners, fouls, penalties and goalkeeper saves. Solo and local two-player modes are available.' : isClassicHockey ? 'Play a full match or jump straight into a penalty shootout. Choose your game format, then pick your opponent. Penalties: five shots each, followed by sudden death. Defend with W/S (P1) or ↑/↓ (P2). Hold keys to position your keeper before the fast shot.' : meta.description}</p>
              <div className="controls-list">{meta.controls.map((control) => <kbd key={control}>{control}</kbd>)}</div>
              {isSoccerSkills && (
                <>
                  <label className="hockey-draw-rule soccer-team-select">
                    <span>2026 World Cup team · 48 qualified nations</span>
                    <select value={soccerTeam} onChange={(event) => setSoccerTeam(event.target.value)}>
                      {Object.entries(SOCCER_TEAM_GROUPS).map(([confederation, teams]) => (
                        <optgroup key={confederation} label={confederation}>
                          {teams.map((team) => <option key={team.code} value={team.name}>{team.name} · {team.code}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <div className="soccer-kit-preview" aria-label={`${selectedSoccerTeam.name} kit colors`}>
                    <span className="soccer-kit-swatch" style={{ background: `linear-gradient(90deg, ${selectedSoccerTeam.home.shirt} 0 52%, ${selectedSoccerTeam.home.trim} 52% 100%)`, borderColor: selectedSoccerTeam.home.trim }} />
                    <strong>{selectedSoccerTeam.code}</strong>
                    <small>{selectedSoccerTeam.name} · {selectedSoccerTeam.confederation}</small>
                  </div>
                  <div className="hockey-mode-actions soccer-mode-actions">
                    <button className="action-button action-primary overlay-primary" autoFocus onClick={() => start('ai')}>Play solo</button>
                    <button className="action-button overlay-primary" onClick={() => start('human')}>Two players</button>
                  </div>
                </>
              )}
              {isClassicHockey && (
                <label className="hockey-draw-rule">
                  <span>Game format</span>
                  <select value={hockeyFormat} onChange={(event) => setHockeyFormat(event.target.value as HockeyMatchFormat)}>
                    <option value="extra-time">Full match · extra time if tied</option>
                    <option value="penalties">Full match · penalties if tied</option>
                    <option value="shootout-only">Penalty shootout only</option>
                  </select>
                </label>
              )}
              {isHockey ? (
                <div className="hockey-mode-actions">
                  <button className="action-button action-primary overlay-primary" autoFocus onClick={() => start('ai')}>Play vs AI</button>
                  <button className="action-button overlay-primary" onClick={() => start('human')}>Two players</button>
                </div>
              ) : !isSoccerSkills && <button className="action-button action-primary overlay-primary" autoFocus onClick={() => start()}>Start round</button>}
              {meta.players === 1 && best && <small>Device best · {meta.formatRecord(best.score)}</small>}
            </div>
          )}
          {phase === 'countdown' && <div className="game-overlay countdown-overlay" aria-live="assertive"><strong>{countdown}</strong></div>}
          {phase === 'paused' && !replayActive && (
            <div className="game-overlay pause-overlay"><h2>Paused</h2><p>Take a breath. The arena is frozen.</p><button className="action-button action-primary overlay-primary" onClick={() => setPhase('playing')}><Play />Resume</button><button className="text-button" onClick={onExit}>Return to arcade</button></div>
          )}
          {replayActive && (
            <div className="replay-overlay" aria-live="polite">
              <div><Film aria-hidden="true" /><strong>Replay</strong><span>{Math.round(replayProgress * 100)}%</span></div>
              <progress max="1" value={replayProgress} />
              <small>{replayEvents.at(-1)?.label ?? 'Recent match action'}</small>
              <button className="text-button" onClick={() => { replayActiveRef.current = false; setReplayActive(false); setReplayProgress(0); setPhase(replayPhaseRef.current) }}>Exit replay</button>
            </div>
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

      <footer className="game-footer"><span>{isSoccerSkills ? <>{soccerControls}{keeperMode === 'manual' ? '  ·  KEEPER ↑/↓ · W/S' : '  ·  KEEPER ASSIST'}</> : isHockey ? hockeyControls : meta.controls.join('  ·  ')}</span><span>Esc · Pause</span></footer>
    </main>
  )
}
