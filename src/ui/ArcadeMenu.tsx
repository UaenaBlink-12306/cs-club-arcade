import { useEffect, useRef, useState } from 'react'
import { Shuffle, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'
import type { GameId } from '../core/types'
import { arcadeAudio } from '../audio/ArcadeAudio'
import { games } from '../games'
import { getBest } from '../utils/storage'
import { GameThumb } from './GameThumb'

interface Props {
  onSelect: (id: GameId) => void
  onSettings: () => void
  recordsVersion: number
  audioVersion: number
  onAudioChanged: () => void
}

export function ArcadeMenu({ onSelect, onSettings, recordsVersion, audioVersion, onAudioChanged }: Props) {
  const [selected, setSelected] = useState(2)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      const columns = window.innerWidth >= 1120 ? 5 : window.innerWidth >= 700 ? 3 : 2
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) event.preventDefault()
      if (event.key === 'ArrowLeft') setSelected((value) => (value + games.length - 1) % games.length)
      if (event.key === 'ArrowRight') setSelected((value) => (value + 1) % games.length)
      if (event.key === 'ArrowUp') setSelected((value) => (value + games.length - columns) % games.length)
      if (event.key === 'ArrowDown') setSelected((value) => (value + columns) % games.length)
      if (event.key === 'Enter') { arcadeAudio.play('start'); onSelect(games[selected].id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect, selected])

  useEffect(() => { cardRefs.current[selected]?.focus({ preventScroll: true }) }, [selected])

  const randomGame = () => {
    let index = Math.floor(Math.random() * games.length)
    if (index === selected) index = (index + 1) % games.length
    setSelected(index); arcadeAudio.play('start'); onSelect(games[index].id)
  }

  const toggleAudio = () => { arcadeAudio.toggle(); onAudioChanged() }

  return (
    <main className="arcade-menu" data-records-version={recordsVersion} data-audio-version={audioVersion}>
      <header className="menu-header">
        <h1 className="brand-title"><span>CS CLUB</span><em>ARCADE</em></h1>
        <div className="menu-actions">
          <button className="action-button action-primary" onClick={randomGame}><Shuffle aria-hidden="true" />Random game</button>
          <button className="action-button" onClick={onSettings}><SlidersHorizontal aria-hidden="true" />Settings</button>
          <button className={`action-button ${arcadeAudio.muted ? '' : 'sound-on'}`} onClick={toggleAudio}>{arcadeAudio.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}{arcadeAudio.muted ? 'Sound off' : 'Sound on'}</button>
        </div>
      </header>

      <section className="game-grid" aria-label="Choose a game">
        {games.map((game, index) => {
          const best = getBest(game.id)
          return (
            <button
              key={game.id}
              ref={(node) => { cardRefs.current[index] = node }}
              className={`game-card ${selected === index ? 'is-selected' : ''}`}
              style={{ '--game-accent': game.accent } as React.CSSProperties}
              onFocus={() => setSelected(index)}
              onMouseEnter={() => setSelected(index)}
              onClick={() => { arcadeAudio.play('start'); onSelect(game.id) }}
            >
              <GameThumb id={game.id} />
              <span className="game-card-body">
                <strong>{game.title}</strong>
                <span className="game-description">{game.description}</span>
                <span className="game-card-meta"><b>{game.players === 1 ? '1 PLAYER' : '2 PLAYERS'}</b><span>{best ? `${best.name} · ${game.formatRecord(best.score)}` : `${game.recordLabel}: —`}</span></span>
              </span>
            </button>
          )
        })}
      </section>

      <footer className="menu-footer"><span className="key-hint">← ↑ ↓ →</span><span>Navigate</span><span className="key-hint">Enter</span><span>Select a game</span></footer>
    </main>
  )
}
