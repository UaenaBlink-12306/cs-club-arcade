import type { GameId } from '../core/types'

export function GameThumb({ id }: { id: GameId }) {
  const common = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className={`game-thumb-art thumb-${id}`} viewBox="0 0 300 130" role="img" aria-label={`${id} game illustration`}>
      <rect width="300" height="130" fill="#09172b" />
      <path d="M0 104 L300 70 V130 H0Z" fill="rgba(24,216,242,.07)" />
      {id === 'air-hockey' && <><rect x="22" y="15" width="256" height="100" rx="10" fill="#102b48" stroke="#f4f1e8" strokeWidth="4" /><path d="M150 16v98" stroke="#18d8f2" strokeWidth="3" strokeDasharray="8 7"/><circle cx="150" cy="65" r="24" {...common} stroke="#18d8f2" strokeWidth="3"/><path d="M22 48H8v34h14M278 48h14v34h-14" {...common} stroke="#ff5b55" strokeWidth="4"/><circle cx="83" cy="68" r="24" fill="#18d8f2"/><circle cx="218" cy="58" r="24" fill="#ff5b55"/><circle cx="152" cy="82" r="11" fill="#f4f1e8"/></>}
      {id === 'tank-duel' && <><g fill="#b9f20b"><rect x="36" y="72" width="82" height="32" rx="5"/><rect x="56" y="54" width="44" height="24"/><rect x="92" y="61" width="53" height="8"/></g><g fill="#a45cff"><rect x="186" y="72" width="82" height="32" rx="5"/><rect x="201" y="54" width="44" height="24"/><rect x="157" y="61" width="52" height="8"/></g><path d="M149 65l17-8-6 12 12 6-23-2" fill="#ffb928"/></>}
      {id === 'dodge-hell' && <><path d="M70 91l48-25-19 42-10-15z" fill="#18d8f2"/><g fill="#ff5b55"><path d="M177 32l26 8-23 15 8-11z"/><path d="M217 73l28 10-27 13 10-10z"/><path d="M146 87l26 8-24 14 8-10z"/></g><path d="M119 68l42-21" stroke="#18d8f2" strokeWidth="4" strokeDasharray="8 6"/></>}
      {id === 'platform-panic' && <>{[0,1,2].flatMap(row => [0,1,2,3].map(col => <rect key={`${row}-${col}`} x={32+col*61} y={24+row*35} width="49" height="26" fill={(row===1&&col===2)?'#ff5b55':'#41256b'} stroke="#a45cff"/>))}<circle cx="119" cy="62" r="13" fill="#f4f1e8"/></>}
      {id === 'mini-golf' && <><path d="M20 112L130 24l150 88z" fill="#215f35"/><circle cx="92" cy="89" r="11" fill="#f4f1e8"/><ellipse cx="215" cy="82" rx="19" ry="9" fill="#061225"/><path d="M215 82V28" stroke="#f4f1e8" strokeWidth="4"/><path d="M215 29l39 14-39 12z" fill="#ff5b55"/></>}
      {id === 'gravity-flip' && <><path d="M0 112h300M0 18h300" stroke="#18d8f2" strokeWidth="4"/><rect x="76" y="74" width="30" height="30" fill="#18d8f2" transform="rotate(15 91 89)"/><rect x="184" y="28" width="30" height="30" fill="#a45cff" transform="rotate(15 199 43)"/><path d="M129 78c30-34 44-42 74-49" stroke="#f4f1e8" strokeWidth="3" strokeDasharray="7 8"/></>}
      {id === 'slingshot' && <><circle cx="88" cy="72" r="30" fill="#18d8f2"/><circle cx="225" cy="62" r="27" fill="#ff5b55"/><path d="M90 72L168 48" stroke="#f4f1e8" strokeWidth="5" strokeDasharray="11 8"/><path d="M169 48l-18-8 8 18z" fill="#f4f1e8"/></>}
      {id === 'racing' && <><path d="M35 102C8 72 35 23 80 28c38 4 32 45 67 46 38 2 31-54 79-49 45 5 60 55 32 84-29 30-63-1-92 5-44 8-97 19-131-12Z" fill="none" stroke="#f4f1e8" strokeWidth="33" strokeLinejoin="round"/><path d="M35 102C8 72 35 23 80 28c38 4 32 45 67 46 38 2 31-54 79-49 45 5 60 55 32 84-29 30-63-1-92 5-44 8-97 19-131-12Z" fill="none" stroke="#2b4753" strokeWidth="26" strokeLinejoin="round"/><rect x="199" y="88" width="37" height="20" fill="#18d8f2" transform="rotate(-22 218 98)"/><rect x="53" y="31" width="37" height="20" fill="#b9f20b" transform="rotate(13 72 41)"/></>}
      {id === 'boss-rush' && <><path d="M150 25l23 14 29-2 8 28 21 20-17 23-8 22h-112l-8-22-17-23 21-20 8-28 29 2z" fill="#2a1745" stroke="#a45cff" strokeWidth="5"/><rect x="116" y="67" width="21" height="18" fill="#ff5b55"/><rect x="164" y="67" width="21" height="18" fill="#ff5b55"/><path d="M120 105h60" stroke="#ff5b55" strokeWidth="8"/></>}
      {id === 'tower-stack' && <><rect x="61" y="98" width="186" height="25" fill="#18d8f2"/><rect x="78" y="72" width="155" height="25" fill="#a45cff"/><rect x="98" y="46" width="119" height="25" fill="#ff5b55"/><rect x="116" y="20" width="88" height="25" fill="#b9f20b"/></>}
    </svg>
  )
}
