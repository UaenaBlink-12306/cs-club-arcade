# Design QA

status: release candidate

The reference Poki page was not playable in the cloud browser: `poki.com` and its former `games.poki.com` iframe returned `ERR_CONNECTION_REFUSED`, and the iframe HTML says the game has moved. Public Poki copy was used only to validate the high-level drag-release interaction and tournament shape; no reference assets are reused.

The local Aurora Cup implementation uses 48 fictional teams with original short codes, colors, and kit patterns. It renders an angled broadcast camera, striped pitch, stadium seating, goals, nets, markings, corner flags, ad boards, 11 players per side, and original Canvas artwork.

Implemented gameplay includes drag-release movement, passing and shooting, charge feedback, ball height arcs, headers, goalkeeper assist/manual control, saves, throw-ins, corners, goal kicks, free kicks, fouls, penalties, replay frames, and a single-player AI opponent. The cup simulates twelve groups of four with three fixtures per team plus Round of 32 and Round of 16 bracket outcomes, then the player plays quarter-final, semi-final, and final progression. Practice, tutorial memory, pause controls, and continue-cup overlays are in the shell.

Release checks passed with `npm run lint`, `npm test` (54 tests), `npm run build`, and `git diff --check`. The desktop local smoke path covered team selection, the tutorial, countdown, kickoff, drag-to-shoot, live open play, fouls/free-kicks, pause, and controls; the responsive stylesheet includes dedicated 720px and 480px layouts. Vercel served the new production asset bundle after the final push. The managed Chrome browser still reports `ERR_CONNECTION_REFUSED` for the public hostname even though direct HTTP fetches return the new bundle, so the final visual smoke was completed against the local build.
