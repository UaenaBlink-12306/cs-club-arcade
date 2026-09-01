import { useCallback, useEffect, useState } from 'react'
import type { GameId } from './core/types'
import { getGameMeta } from './games'
import { ArcadeMenu } from './ui/ArcadeMenu'
import { GameShell } from './ui/GameShell'
import { SettingsModal } from './ui/SettingsModal'

export default function App() {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recordsVersion, setRecordsVersion] = useState(0)
  const [audioVersion, setAudioVersion] = useState(0)
  const recordsChanged = useCallback(() => setRecordsVersion((value) => value + 1), [])

  useEffect(() => {
    const onRecords = () => recordsChanged()
    window.addEventListener('arcade-records', onRecords)
    return () => window.removeEventListener('arcade-records', onRecords)
  }, [recordsChanged])

  return (
    <div className="app-shell">
      {selectedGame ? (
        <GameShell key={selectedGame} meta={getGameMeta(selectedGame)} onExit={() => setSelectedGame(null)} onRecordsChanged={recordsChanged} />
      ) : (
        <ArcadeMenu onSelect={setSelectedGame} onSettings={() => setSettingsOpen(true)} recordsVersion={recordsVersion} audioVersion={audioVersion} onAudioChanged={() => setAudioVersion((value) => value + 1)} />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onChanged={() => { recordsChanged(); setAudioVersion((value) => value + 1) }} />}
    </div>
  )
}
