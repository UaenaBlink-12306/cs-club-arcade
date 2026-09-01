export const GAME_WIDTH = 1200
export const GAME_HEIGHT = 600

export type GameId =
  | 'sumo'
  | 'tank-duel'
  | 'dodge-hell'
  | 'platform-panic'
  | 'mini-golf'
  | 'gravity-flip'
  | 'slingshot'
  | 'racing'
  | 'boss-rush'
  | 'tower-stack'

export type RecordStrategy = 'high' | 'low' | 'count'

export interface GameMeta {
  id: GameId
  title: string
  shortTitle: string
  description: string
  players: 1 | 2
  controls: string[]
  accent: string
  recordLabel: string
  recordStrategy: RecordStrategy
  formatRecord: (score: number) => string
}

export interface PointerState {
  x: number
  y: number
  down: boolean
  pressed: boolean
  released: boolean
}

export interface InputFrame {
  down: ReadonlySet<string>
  pressed: ReadonlySet<string>
  released: ReadonlySet<string>
  pointer: PointerState
  isDown: (...codes: string[]) => boolean
  wasPressed: (...codes: string[]) => boolean
}

export interface HudItem {
  label: string
  value: string
  accent?: string
}

export interface GameResult {
  headline: string
  detail: string
  score: number
  winnerName?: string
  recordEligible?: boolean
}

export interface GameRuntime {
  readonly meta: GameMeta
  result: GameResult | null
  reset(): void
  update(dt: number, input: InputFrame): void
  render(ctx: CanvasRenderingContext2D): void
  getHud(): HudItem[]
  destroy?(): void
}
