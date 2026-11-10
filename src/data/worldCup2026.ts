/**
 * Original Aurora Cup teams.
 *
 * These fictional nations, badges and kit palettes are intentionally original
 * so the arcade game does not imply an affiliation with real-world football
 * federations or copy protected tournament branding.
 */
export type WorldCupConfederation = 'AURORA' | 'EMBER' | 'TIDELANDS' | 'SKYLANDS' | 'VERDANT' | 'STARFALL'

export interface KitPalette {
  shirt: string
  trim: string
  pattern: string
}

export interface WorldCup2026Team {
  /** Original short code used only by the local team picker. */
  code: string
  name: string
  confederation: WorldCupConfederation
  qualifiedDate: string
  qualification: string
  rating: number
  home: KitPalette
  away: KitPalette
}

const kit = (shirt: string, trim: string, pattern: string): KitPalette => ({ shirt, trim, pattern })
const invite = (code: string, name: string, confederation: WorldCupConfederation, home: KitPalette, away: KitPalette): WorldCup2026Team => ({
  code,
  name,
  confederation,
  qualifiedDate: 'ORIGINAL CUP INVITE',
  qualification: 'Aurora Cup field',
  rating: 68 + ((code.charCodeAt(0) + code.charCodeAt(1) * 3 + code.charCodeAt(2) * 5) % 25),
  home,
  away,
})

/** 48 fictional teams grouped into twelve four-team pools for the cup hub. */
export const WORLD_CUP_2026_TEAMS: readonly WorldCup2026Team[] = [
  invite('AUR', 'Aurora Isles', 'AURORA', kit('#35d0ff', '#062a50', 'sunburst'), kit('#062a50', '#35d0ff', 'wave trim')),
  invite('BRI', 'Brighthaven', 'AURORA', kit('#ffbe3b', '#642b7d', 'gold chevrons'), kit('#642b7d', '#ffbe3b', 'violet bands')),
  invite('CIN', 'Cinder Coast', 'AURORA', kit('#f45d48', '#ffe57e', 'ember stripes'), kit('#ffe57e', '#f45d48', 'coral sash')),
  invite('DUS', 'Duskfall', 'AURORA', kit('#6f6cf6', '#f6f0ff', 'night dots'), kit('#f6f0ff', '#6f6cf6', 'indigo trim')),

  invite('EMB', 'Ember Union', 'EMBER', kit('#ff5b6e', '#2e174d', 'flame blocks'), kit('#2e174d', '#ff5b6e', 'red pinstripes')),
  invite('FRO', 'Frostholm', 'EMBER', kit('#dff8ff', '#2877b8', 'ice facets'), kit('#2877b8', '#dff8ff', 'blue facets')),
  invite('GOL', 'Golden Steppe', 'EMBER', kit('#f5d547', '#163b59', 'sun bands'), kit('#163b59', '#f5d547', 'gold piping')),
  invite('HAR', 'Harbor Republic', 'EMBER', kit('#29b6a8', '#073b57', 'harbor waves'), kit('#073b57', '#29b6a8', 'teal sash')),

  invite('IRW', 'Ironwood', 'TIDELANDS', kit('#4b5563', '#c5f36a', 'forest blocks'), kit('#c5f36a', '#4b5563', 'lime trim')),
  invite('JAD', 'Jade Dominion', 'TIDELANDS', kit('#2ecf83', '#0d4b40', 'jade diamonds'), kit('#0d4b40', '#2ecf83', 'green sash')),
  invite('KES', 'Kestrel Reach', 'TIDELANDS', kit('#f08b45', '#173c75', 'wing stripes'), kit('#173c75', '#f08b45', 'orange trim')),
  invite('LUM', 'Lumen Valley', 'TIDELANDS', kit('#eaf5ff', '#f26bce', 'lumen rays'), kit('#f26bce', '#eaf5ff', 'pink piping')),

  invite('MOO', 'Mooncrest', 'SKYLANDS', kit('#8aa4ff', '#151d4d', 'crescent bands'), kit('#151d4d', '#8aa4ff', 'blue crescent')),
  invite('NEO', 'Neon Bay', 'SKYLANDS', kit('#9dfc5e', '#122c46', 'neon grid'), kit('#122c46', '#9dfc5e', 'lime grid')),
  invite('OPA', 'Opal Federation', 'SKYLANDS', kit('#ff8db1', '#38246b', 'opalescent blocks'), kit('#38246b', '#ff8db1', 'rose trim')),
  invite('PRI', 'Prism Isles', 'SKYLANDS', kit('#ff7a4d', '#ffe56b', 'prism hoops'), kit('#ffe56b', '#ff7a4d', 'sunset sash')),

  invite('QUA', 'Quartz Union', 'VERDANT', kit('#d9e6f2', '#204968', 'quartz facets'), kit('#204968', '#d9e6f2', 'silver trim')),
  invite('RED', 'Redwind', 'VERDANT', kit('#e63946', '#f7f2df', 'wind chevrons'), kit('#f7f2df', '#e63946', 'red bands')),
  invite('SOL', 'Solara', 'VERDANT', kit('#ffca3a', '#b34f21', 'solar rays'), kit('#b34f21', '#ffca3a', 'amber trim')),
  invite('TID', 'Tidewatch', 'VERDANT', kit('#26a6d1', '#0d415d', 'tidal stripes'), kit('#0d415d', '#26a6d1', 'aqua trim')),

  invite('UMB', 'Umber Coast', 'STARFALL', kit('#9b6a4b', '#f6d98a', 'coast blocks'), kit('#f6d98a', '#9b6a4b', 'umber bands')),
  invite('VER', 'Verdantia', 'STARFALL', kit('#59c36a', '#183f32', 'leaf mosaic'), kit('#183f32', '#59c36a', 'green piping')),
  invite('WES', 'Westreach', 'STARFALL', kit('#5975e8', '#f6f6ff', 'horizon stripes'), kit('#f6f6ff', '#5975e8', 'blue trim')),
  invite('YAR', 'Yarrow Fields', 'STARFALL', kit('#e0b547', '#374151', 'field checks'), kit('#374151', '#e0b547', 'gold trim')),

  invite('ZEP', 'Zephyr State', 'AURORA', kit('#b6f0ff', '#214d73', 'cloud arcs'), kit('#214d73', '#b6f0ff', 'sky trim')),
  invite('BLW', 'Brightwood', 'AURORA', kit('#f7f3ce', '#4b8f8c', 'woodgrain'), kit('#4b8f8c', '#f7f3ce', 'mint bands')),
  invite('CLM', 'Cloudmere', 'AURORA', kit('#c5b8ff', '#403075', 'cloud layers'), kit('#403075', '#c5b8ff', 'lavender trim')),
  invite('DRI', 'Driftmark', 'AURORA', kit('#ff9d66', '#6b2744', 'drift chevrons'), kit('#6b2744', '#ff9d66', 'orange trim')),

  invite('EVD', 'Everdawn', 'EMBER', kit('#f6df63', '#884d2a', 'dawn rays'), kit('#884d2a', '#f6df63', 'gold bands')),
  invite('FLI', 'Flintara', 'EMBER', kit('#a9b6c8', '#22354d', 'flint facets'), kit('#22354d', '#a9b6c8', 'steel trim')),
  invite('GAL', 'Galeward', 'EMBER', kit('#62c8d3', '#19405e', 'gale arcs'), kit('#19405e', '#62c8d3', 'aqua piping')),
  invite('HIG', 'Highmere', 'EMBER', kit('#f66d9b', '#52205c', 'highland bands'), kit('#52205c', '#f66d9b', 'pink trim')),

  invite('IVO', 'Ivory Plains', 'TIDELANDS', kit('#fff4dc', '#a65d37', 'plain waves'), kit('#a65d37', '#fff4dc', 'cream trim')),
  invite('JUN', 'Juniper Republic', 'TIDELANDS', kit('#4aa36b', '#132f38', 'juniper sprigs'), kit('#132f38', '#4aa36b', 'green piping')),
  invite('KIN', 'Kindledale', 'TIDELANDS', kit('#ff745c', '#683d55', 'kindle blocks'), kit('#683d55', '#ff745c', 'coral trim')),
  invite('LON', 'Longshore', 'TIDELANDS', kit('#3e97d1', '#102e52', 'shore stripes'), kit('#102e52', '#3e97d1', 'blue trim')),

  invite('MIS', 'Mistvale', 'SKYLANDS', kit('#d3d8ff', '#48528a', 'mist bands'), kit('#48528a', '#d3d8ff', 'silver trim')),
  invite('NOR', 'Northglen', 'SKYLANDS', kit('#9de2bd', '#164b45', 'glen facets'), kit('#164b45', '#9de2bd', 'green trim')),
  invite('OXB', 'Oxbow', 'SKYLANDS', kit('#c98c66', '#493448', 'oxbow loops'), kit('#493448', '#c98c66', 'clay trim')),
  invite('PIN', 'Pinecrest', 'SKYLANDS', kit('#2aa56a', '#ebf5b8', 'pine stripes'), kit('#ebf5b8', '#2aa56a', 'lime trim')),

  invite('RAI', 'Rainshadow', 'VERDANT', kit('#6887ac', '#17253b', 'rain ticks'), kit('#17253b', '#6887ac', 'blue trim')),
  invite('STA', 'Starfall', 'VERDANT', kit('#9c7cff', '#f7ce65', 'star sparks'), kit('#f7ce65', '#9c7cff', 'gold trim')),
  invite('THU', 'Thunder Ridge', 'VERDANT', kit('#4a5ce0', '#f5dd67', 'thunder bolts'), kit('#f5dd67', '#4a5ce0', 'yellow trim')),
  invite('UNI', 'Unity Isles', 'VERDANT', kit('#ff657d', '#f1f5f9', 'unity hoops'), kit('#f1f5f9', '#ff657d', 'rose trim')),

  invite('VIV', 'Vividora', 'STARFALL', kit('#ff6f61', '#4b2d73', 'vivid pixels'), kit('#4b2d73', '#ff6f61', 'coral trim')),
  invite('WIL', 'Wildcrest', 'STARFALL', kit('#79d65b', '#284e37', 'wild zigzags'), kit('#284e37', '#79d65b', 'lime trim')),
  invite('XEN', 'Xenora', 'STARFALL', kit('#e56af1', '#243253', 'xeno waves'), kit('#243253', '#e56af1', 'violet trim')),
  invite('YEL', 'Yellowcrest', 'STARFALL', kit('#f6da44', '#754b23', 'crest stripes'), kit('#754b23', '#f6da44', 'gold trim')),
  invite('ZAF', 'Zaffre Coast', 'STARFALL', kit('#2764c4', '#e7f0ff', 'zaffre tide'), kit('#e7f0ff', '#2764c4', 'blue trim')),
]

export const WORLD_CUP_2026_BY_CODE: Readonly<Record<string, WorldCup2026Team>> = Object.fromEntries(
  WORLD_CUP_2026_TEAMS.map((team) => [team.code, team]),
)

export const WORLD_CUP_2026_BY_NAME: Readonly<Record<string, WorldCup2026Team>> = Object.fromEntries(
  WORLD_CUP_2026_TEAMS.map((team) => [team.name, team]),
)
