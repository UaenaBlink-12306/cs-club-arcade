/**
 * 2026 FIFA World Cup finalists and display kit palettes.
 *
 * Qualification status is a snapshot for 2026-11-09 (all 48 places are set).
 * Kit colours are the primary shirt colours used for a compact arcade render;
 * they are not intended to reproduce every trim, pattern, or goalkeeper kit.
 *
 * Sources:
 * - FIFA tournament/team hub: https://www.fifa.com/en/tournaments/mens/worldcup/canada-mexico-usa-2026
 * - Qualification table (host berths, dates, and confederation paths):
 *   https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_qualification
 */

export type WorldCupConfederation = 'AFC' | 'CAF' | 'CONCACAF' | 'CONMEBOL' | 'OFC' | 'UEFA'

export interface KitPalette {
  shirt: string
  trim: string
  pattern: string
}

export interface WorldCup2026Team {
  /** Stable FIFA three-letter code (FIFA convention where available). */
  code: string
  name: string
  confederation: WorldCupConfederation
  /** ISO date on which the berth was secured (hosts use the FIFA Council date). */
  qualifiedDate: string
  qualification: string
  home: KitPalette
  away: KitPalette
}

const kit = (shirt: string, trim: string, pattern = 'solid'): KitPalette => ({ shirt, trim, pattern })

/** Final 48-team field, ordered by qualification date then table order. */
export const WORLD_CUP_2026_TEAMS: readonly WorldCup2026Team[] = [
  // Hosts (automatic berths confirmed 2023-02-14).
  { code: 'CAN', name: 'Canada', confederation: 'CONCACAF', qualifiedDate: '2023-02-14', qualification: 'Hosts', home: kit('#D80621', '#FFFFFF', 'red with maple-leaf trim'), away: kit('#FFFFFF', '#D80621', 'white with red trim') },
  { code: 'MEX', name: 'Mexico', confederation: 'CONCACAF', qualifiedDate: '2023-02-14', qualification: 'Hosts', home: kit('#006847', '#CE1126', 'green with red trim'), away: kit('#FFFFFF', '#006847', 'white with green-red trim') },
  { code: 'USA', name: 'United States', confederation: 'CONCACAF', qualifiedDate: '2023-02-14', qualification: 'Hosts', home: kit('#0B1F3A', '#D71920', 'navy with red-white trim'), away: kit('#FFFFFF', '#D71920', 'white with navy-red trim') },

  { code: 'JPN', name: 'Japan', confederation: 'AFC', qualifiedDate: '2025-03-20', qualification: 'AFC third round Group C winners', home: kit('#003DA5', '#FFFFFF', 'blue with red-white trim'), away: kit('#FFFFFF', '#003DA5', 'white with blue trim') },
  { code: 'NZL', name: 'New Zealand', confederation: 'OFC', qualifiedDate: '2025-03-24', qualification: 'OFC third round winners', home: kit('#111111', '#FFFFFF', 'black with white trim'), away: kit('#FFFFFF', '#111111', 'white with black trim') },
  { code: 'IRN', name: 'Iran', confederation: 'AFC', qualifiedDate: '2025-03-25', qualification: 'AFC third round Group A winners', home: kit('#FFFFFF', '#CE1126', 'white with red-green trim'), away: kit('#CE1126', '#FFFFFF', 'red with white trim') },
  { code: 'ARG', name: 'Argentina', confederation: 'CONMEBOL', qualifiedDate: '2025-03-25', qualification: 'CONMEBOL winners', home: kit('#74ACDF', '#FFFFFF', 'sky-blue and white stripes'), away: kit('#111111', '#74ACDF', 'black with sky-blue trim') },
  { code: 'UZB', name: 'Uzbekistan', confederation: 'AFC', qualifiedDate: '2025-06-05', qualification: 'AFC third round Group A runners-up', home: kit('#FFFFFF', '#1EB7E8', 'white with sky-blue trim'), away: kit('#1EB7E8', '#FFFFFF', 'sky blue with white trim') },
  { code: 'JOR', name: 'Jordan', confederation: 'AFC', qualifiedDate: '2025-06-05', qualification: 'AFC third round Group B runners-up', home: kit('#CE1126', '#FFFFFF', 'red with white trim'), away: kit('#FFFFFF', '#CE1126', 'white with red trim') },
  { code: 'KOR', name: 'South Korea', confederation: 'AFC', qualifiedDate: '2025-06-05', qualification: 'AFC third round Group B winners', home: kit('#CD2E3A', '#111111', 'red with black trim'), away: kit('#FFFFFF', '#CD2E3A', 'white with red trim') },
  { code: 'AUS', name: 'Australia', confederation: 'AFC', qualifiedDate: '2025-06-10', qualification: 'AFC third round Group C runners-up', home: kit('#FFCD00', '#00843D', 'gold with green trim'), away: kit('#00843D', '#FFCD00', 'green with gold trim') },
  { code: 'BRA', name: 'Brazil', confederation: 'CONMEBOL', qualifiedDate: '2025-06-10', qualification: 'CONMEBOL fifth place', home: kit('#FFDF00', '#009C3B', 'yellow with green trim'), away: kit('#1E3A8A', '#FFDF00', 'royal blue with yellow trim') },
  { code: 'ECU', name: 'Ecuador', confederation: 'CONMEBOL', qualifiedDate: '2025-06-10', qualification: 'CONMEBOL runners-up', home: kit('#FFD100', '#003DA5', 'yellow with blue-red trim'), away: kit('#003DA5', '#FFD100', 'blue with yellow trim') },
  { code: 'PAR', name: 'Paraguay', confederation: 'CONMEBOL', qualifiedDate: '2025-09-04', qualification: 'CONMEBOL sixth place', home: kit('#D52B1E', '#FFFFFF', 'red and white stripes'), away: kit('#FFFFFF', '#D52B1E', 'white with red-blue trim') },
  { code: 'URU', name: 'Uruguay', confederation: 'CONMEBOL', qualifiedDate: '2025-09-04', qualification: 'CONMEBOL fourth place', home: kit('#5CBFEB', '#FFFFFF', 'sky blue with white trim'), away: kit('#111111', '#5CBFEB', 'black with sky-blue trim') },
  { code: 'COL', name: 'Colombia', confederation: 'CONMEBOL', qualifiedDate: '2025-09-04', qualification: 'CONMEBOL third place', home: kit('#FCD116', '#003DA5', 'yellow with blue-red trim'), away: kit('#003DA5', '#FCD116', 'blue with yellow trim') },
  { code: 'MAR', name: 'Morocco', confederation: 'CAF', qualifiedDate: '2025-09-05', qualification: 'CAF Group E winners', home: kit('#C1272D', '#006233', 'red with green trim'), away: kit('#FFFFFF', '#C1272D', 'white with red-green trim') },
  { code: 'TUN', name: 'Tunisia', confederation: 'CAF', qualifiedDate: '2025-09-08', qualification: 'CAF Group H winners', home: kit('#E70013', '#FFFFFF', 'red with white crest'), away: kit('#FFFFFF', '#E70013', 'white with red trim') },
  { code: 'EGY', name: 'Egypt', confederation: 'CAF', qualifiedDate: '2025-10-08', qualification: 'CAF Group A winners', home: kit('#CE1126', '#FFFFFF', 'red with black-white trim'), away: kit('#FFFFFF', '#CE1126', 'white with red trim') },
  { code: 'ALG', name: 'Algeria', confederation: 'CAF', qualifiedDate: '2025-10-09', qualification: 'CAF Group G winners', home: kit('#FFFFFF', '#006233', 'white with green trim'), away: kit('#006233', '#FFFFFF', 'green with white trim') },
  { code: 'GHA', name: 'Ghana', confederation: 'CAF', qualifiedDate: '2025-10-12', qualification: 'CAF Group I winners', home: kit('#FFFFFF', '#CE1126', 'white with red-yellow-green trim'), away: kit('#CE1126', '#FCD116', 'red with gold-green trim') },
  { code: 'CPV', name: 'Cape Verde', confederation: 'CAF', qualifiedDate: '2025-10-13', qualification: 'CAF Group D winners', home: kit('#003893', '#FFFFFF', 'blue with red-white trim'), away: kit('#FFFFFF', '#003893', 'white with blue-red trim') },
  { code: 'QAT', name: 'Qatar', confederation: 'AFC', qualifiedDate: '2025-10-14', qualification: 'AFC fourth round Group A winners', home: kit('#8A1538', '#FFFFFF', 'maroon with white trim'), away: kit('#FFFFFF', '#8A1538', 'white with maroon trim') },
  { code: 'KSA', name: 'Saudi Arabia', confederation: 'AFC', qualifiedDate: '2025-10-14', qualification: 'AFC fourth round Group B winners', home: kit('#006C35', '#FFFFFF', 'green with white trim'), away: kit('#FFFFFF', '#006C35', 'white with green trim') },
  { code: 'SEN', name: 'Senegal', confederation: 'CAF', qualifiedDate: '2025-10-14', qualification: 'CAF Group B winners', home: kit('#FFFFFF', '#00853F', 'white with green-yellow-red trim'), away: kit('#00853F', '#FCD116', 'green with gold trim') },
  { code: 'RSA', name: 'South Africa', confederation: 'CAF', qualifiedDate: '2025-10-14', qualification: 'CAF Group C winners', home: kit('#FFB81C', '#007A33', 'gold with green trim'), away: kit('#007A33', '#FFB81C', 'green with gold trim') },
  { code: 'CIV', name: 'Ivory Coast', confederation: 'CAF', qualifiedDate: '2025-10-14', qualification: 'CAF Group F winners', home: kit('#F77F00', '#FFFFFF', 'orange with white-green trim'), away: kit('#FFFFFF', '#F77F00', 'white with orange-green trim') },
  { code: 'ENG', name: 'England', confederation: 'UEFA', qualifiedDate: '2025-10-14', qualification: 'UEFA Group K winners', home: kit('#FFFFFF', '#1F3A93', 'white with navy trim'), away: kit('#1F3A93', '#FFFFFF', 'navy with white trim') },
  { code: 'FRA', name: 'France', confederation: 'UEFA', qualifiedDate: '2025-11-13', qualification: 'UEFA Group D winners', home: kit('#1E3A8A', '#EF4135', 'blue with red-white trim'), away: kit('#FFFFFF', '#1E3A8A', 'white with blue trim') },
  { code: 'CRO', name: 'Croatia', confederation: 'UEFA', qualifiedDate: '2025-11-14', qualification: 'UEFA Group L winners', home: kit('#FF0000', '#FFFFFF', 'red-white checkerboard'), away: kit('#FFFFFF', '#FF0000', 'white with red checker trim') },
  { code: 'POR', name: 'Portugal', confederation: 'UEFA', qualifiedDate: '2025-11-16', qualification: 'UEFA Group F winners', home: kit('#C8102E', '#006600', 'red with green trim'), away: kit('#FFFFFF', '#C8102E', 'white with red-green trim') },
  { code: 'NOR', name: 'Norway', confederation: 'UEFA', qualifiedDate: '2025-11-16', qualification: 'UEFA Group I winners', home: kit('#BA0C2F', '#00205B', 'red with navy trim'), away: kit('#FFFFFF', '#BA0C2F', 'white with red-blue trim') },
  { code: 'GER', name: 'Germany', confederation: 'UEFA', qualifiedDate: '2025-11-17', qualification: 'UEFA Group A winners', home: kit('#FFFFFF', '#111111', 'white with black trim'), away: kit('#111111', '#FFFFFF', 'black with white trim') },
  { code: 'NED', name: 'Netherlands', confederation: 'UEFA', qualifiedDate: '2025-11-17', qualification: 'UEFA Group G winners', home: kit('#F36C21', '#FFFFFF', 'orange with white trim'), away: kit('#111111', '#F36C21', 'black with orange trim') },
  { code: 'SUI', name: 'Switzerland', confederation: 'UEFA', qualifiedDate: '2025-11-18', qualification: 'UEFA Group B winners', home: kit('#D52B1E', '#FFFFFF', 'red with white trim'), away: kit('#FFFFFF', '#D52B1E', 'white with red trim') },
  { code: 'SCO', name: 'Scotland', confederation: 'UEFA', qualifiedDate: '2025-11-18', qualification: 'UEFA Group C winners', home: kit('#005EB8', '#FFFFFF', 'navy with white trim'), away: kit('#FFFFFF', '#005EB8', 'white with navy trim') },
  { code: 'ESP', name: 'Spain', confederation: 'UEFA', qualifiedDate: '2025-11-18', qualification: 'UEFA Group E winners', home: kit('#AA151B', '#F1BF00', 'red with gold trim'), away: kit('#F1BF00', '#AA151B', 'gold with red trim') },
  { code: 'AUT', name: 'Austria', confederation: 'UEFA', qualifiedDate: '2025-11-18', qualification: 'UEFA Group H winners', home: kit('#ED2939', '#FFFFFF', 'red with white trim'), away: kit('#FFFFFF', '#ED2939', 'white with red trim') },
  { code: 'BEL', name: 'Belgium', confederation: 'UEFA', qualifiedDate: '2025-11-18', qualification: 'UEFA Group J winners', home: kit('#111111', '#ED2939', 'black with red-gold trim'), away: kit('#ED2939', '#111111', 'red with black trim') },
  { code: 'PAN', name: 'Panama', confederation: 'CONCACAF', qualifiedDate: '2025-11-18', qualification: 'CONCACAF third round Group A winners', home: kit('#D50032', '#FFFFFF', 'red with white-blue trim'), away: kit('#FFFFFF', '#D50032', 'white with red-blue trim') },
  { code: 'CUW', name: 'Curaçao', confederation: 'CONCACAF', qualifiedDate: '2025-11-18', qualification: 'CONCACAF third round Group B winners', home: kit('#0057B8', '#FCD116', 'blue with yellow trim'), away: kit('#FFFFFF', '#0057B8', 'white with blue-yellow trim') },
  { code: 'HAI', name: 'Haiti', confederation: 'CONCACAF', qualifiedDate: '2025-11-18', qualification: 'CONCACAF third round Group C winners', home: kit('#00209F', '#D21034', 'blue with red trim'), away: kit('#D21034', '#FFFFFF', 'red with blue trim') },
  { code: 'BIH', name: 'Bosnia and Herzegovina', confederation: 'UEFA', qualifiedDate: '2026-03-31', qualification: 'UEFA play-offs Path A winners', home: kit('#1E6BA8', '#F7D117', 'blue with gold trim'), away: kit('#FFFFFF', '#1E6BA8', 'white with blue trim') },
  { code: 'SWE', name: 'Sweden', confederation: 'UEFA', qualifiedDate: '2026-03-31', qualification: 'UEFA play-offs Path B winners', home: kit('#FECC00', '#005B99', 'yellow with blue trim'), away: kit('#005B99', '#FECC00', 'blue with yellow trim') },
  { code: 'TUR', name: 'Turkey', confederation: 'UEFA', qualifiedDate: '2026-03-31', qualification: 'UEFA play-offs Path C winners', home: kit('#E30A17', '#FFFFFF', 'red with white crescent'), away: kit('#FFFFFF', '#E30A17', 'white with red trim') },
  { code: 'CZE', name: 'Czech Republic', confederation: 'UEFA', qualifiedDate: '2026-03-31', qualification: 'UEFA play-offs Path D winners', home: kit('#D7141A', '#11457E', 'red with blue trim'), away: kit('#FFFFFF', '#D7141A', 'white with red-blue trim') },
  { code: 'COD', name: 'DR Congo', confederation: 'CAF', qualifiedDate: '2026-03-31', qualification: 'Inter-confederation Pathway 1 play-off winners', home: kit('#007FFF', '#F7D117', 'sky blue with red-yellow sash'), away: kit('#FFFFFF', '#007FFF', 'white with sky-blue trim') },
  { code: 'IRQ', name: 'Iraq', confederation: 'AFC', qualifiedDate: '2026-03-31', qualification: 'Inter-confederation Pathway 2 play-off winners', home: kit('#009E60', '#FFFFFF', 'green with white trim'), away: kit('#FFFFFF', '#009E60', 'white with green trim') },
]

export const WORLD_CUP_2026_BY_CODE: Readonly<Record<string, WorldCup2026Team>> = Object.fromEntries(
  WORLD_CUP_2026_TEAMS.map((team) => [team.code, team]),
)

export const WORLD_CUP_2026_BY_NAME: Readonly<Record<string, WorldCup2026Team>> = Object.fromEntries(
  WORLD_CUP_2026_TEAMS.map((team) => [team.name, team]),
)
