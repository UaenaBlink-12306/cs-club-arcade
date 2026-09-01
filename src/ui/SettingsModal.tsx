import { useState } from 'react'
import { X } from 'lucide-react'
import { arcadeAudio } from '../audio/ArcadeAudio'
import { getPlayerName, resetLeaderboards, setPlayerName } from '../utils/storage'

export function SettingsModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(getPlayerName())
  const [resetDone, setResetDone] = useState(false)

  const save = () => { setName(setPlayerName(name)); arcadeAudio.play('ui'); onChanged(); onClose() }
  const reset = () => { resetLeaderboards(); setResetDone(true); arcadeAudio.play('hit'); onChanged() }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="icon-button modal-close" aria-label="Close settings" onClick={onClose}><X /></button>
        <h2 id="settings-title">Arcade settings</h2>
        <p>Your name and records stay in this browser.</p>
        <label className="field-label" htmlFor="player-name">Player name</label>
        <input id="player-name" value={name} minLength={3} maxLength={12} autoFocus onChange={(event) => setName(event.target.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, ''))} />
        <div className="settings-row"><span>Sound effects</span><button className="small-button" onClick={() => { arcadeAudio.toggle(); onChanged() }}>{arcadeAudio.muted ? 'Muted' : 'On'}</button></div>
        <button className="danger-button" onClick={reset}>{resetDone ? 'Leaderboards reset' : 'Reset leaderboards'}</button>
        <button className="action-button action-primary save-button" onClick={save}>Save settings</button>
      </section>
    </div>
  )
}
