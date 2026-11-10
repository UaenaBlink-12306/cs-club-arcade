# Design QA

status: in progress

The reference Poki page was not playable in the cloud browser: `poki.com` and its former `games.poki.com` iframe returned `ERR_CONNECTION_REFUSED`, and the iframe HTML says the game has moved. Public Poki copy was used only to validate the high-level drag-release interaction and tournament shape; no reference assets are reused.

The local Aurora Cup implementation uses 48 fictional teams with original short codes, colors, and kit patterns. It renders an angled broadcast camera, striped pitch, stadium seating, goals, nets, markings, corner flags, ad boards, 11 players per side, and original Canvas artwork.

Implemented gameplay includes drag-release movement, passing and shooting, charge feedback, ball height arcs, headers, goalkeeper assist/manual control, saves, throw-ins, corners, goal kicks, free kicks, fouls, penalties, replay frames, and a single-player AI opponent. The cup simulates twelve groups of four with three fixtures per team plus Round of 32 and Round of 16 bracket outcomes, then the player plays quarter-final, semi-final, and final progression. Practice, tutorial memory, pause controls, and continue-cup overlays are in the shell.

`npm run build`, `npm test`, and `git diff --check` should be rerun after the final UI and deployment pass. Desktop and narrow mobile smoke checks remain part of the release checklist.
