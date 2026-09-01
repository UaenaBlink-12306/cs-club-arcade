# CS Club Arcade visual spec

## Accepted concepts

- `concept-menu.png` is the launcher source of truth.
- `concept-dodge-hell.png` is the active-game shell and HUD source of truth.

## Visible-copy lock

Above the fold on the launcher: `CS CLUB ARCADE`, `RANDOM GAME`, `SOUND ON`/`SOUND OFF`, the ten approved game names, player-count labels, short descriptions, single-player device-best labels, and `SESSION ONLY` labels for local multiplayer. No eyebrow, badge, leaderboard, settings panel, marketing copy, or extra navigation.

## Design tokens

- Background: true dark ink `#061225`; deeper field `#030916`; raised field `#0a1830`.
- Text: warm off-white `#f4f1e8`; muted blue-gray `#8ca0b8`.
- Accents: cyan `#18d8f2`, coral `#ff5b55`, lime `#b9f20b`, violet `#a45cff`, amber `#ffb928`.
- Borders: one-pixel cool slate, cyan for focus/selection.
- Display type: condensed, heavy, uppercase. UI type: compact sans-serif, uppercase controls, tabular numerals.
- Geometry: mostly squared forms; 4-8px radii; crisp outlines; restrained shadows and bloom.
- Motion: 160ms menu lift/focus; short impact shake; particles decay in 300-600ms.

## Container and component rules

- Launcher: quiet header plus a 5x2 card matrix at laptop widths; each card has one image field and one compact information rail.
- Game shell: open canvas, one thin boundary, HUD anchored around the canvas rather than nested panels.
- Controls: high-contrast outlined buttons with deliberate 13-16px condensed type.
- Responsive: five columns at 1366px+, two or three columns below; the game canvas remains 16:9 and all controls stay visible.

## Asset and icon inventory

- Generated production background plate: `public/assets/arcade-background.png`.
- Code-native SVGs: back, sound, shuffle, pause, keyboard hints, and ten geometric game thumbnails.
- Canvas-native gameplay silhouettes: circles, tanks, cars, projectiles, tiles, blocks, and collision bounds.

## Intentional scope and art deviations

- The brief's multiple arenas, three racing tracks, and multiple bosses are reduced to one polished rotating/variable arena, one original race circuit, and one multi-phase boss. This protects playability and verification across all ten games.
- Gameplay silhouettes are drawn as crisp code-native geometric art rather than generated sprite sheets. This is intentional: collision readability, color swapping for local multiplayer, 60 FPS scaling, and consistent hit geometry matter more for a ten-game fair build. The generated backdrop and accepted visual concepts still anchor the shipped art direction.
