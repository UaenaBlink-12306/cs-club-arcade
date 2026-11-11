# Soccer rules and input audit

Audited against the IFAB 2026/27 Laws on 2026-11-11. This remains a stylised football game, **not full IFAB compliance**. The source of truth is `public/soccer-skills/index.html`; `soccer-skills/index.html` mirrors it.

## Implemented in this revision

- **Kick-off:** explicit `setPiece='Kick-off'` and restart guard. The ball stays on the centre mark and the taker cannot dribble. Other players remain in their own half, and opponents outside the centre circle, until contact. Apply at start, second half and after every goal; the conceding team restarts. Mouse/touch aim and release, solo E/Space and each local player's pass/shot keys work. Solo opposition takes its own AI kick; a human-controlled taker never auto-kicks. The opening match clock starts with the kick. [Law 8](https://www.theifab.com/laws/latest/the-start-and-restart-of-play/)
- **Goal kicks:** ball in the goal area; every opponent is placed outside the complete penalty area and constrained there through wind-up. Teammates may stay and receive inside. The restriction ends at contact/launch, without waiting for the ball to leave the area. Early entry is prevented by positioning correction before interaction or contact, including human input. There is no blanket ten-yard radius. [Law 16](https://www.theifab.com/laws/latest/the-goal-kick/)
- **Corners:** nearest corner, ball within its arc, opponents held at least the scaled required distance from the arc until contact. [Law 17](https://www.theifab.com/laws/latest/the-corner-kick/)
- **Throw-ins:** correct last-touch ownership, crossing location, taker on the touchline, inward delivery and opponent spacing. A held/overhead pose replaces a foot strike. Direct throws into the opposing goal become goal kicks; direct throws into one's own goal become corners. [Law 15](https://www.theifab.com/laws/latest/the-throw-in/)
- **Boundary decisions:** whole-ball crossing, with a shared physical/drawing radius; earliest crossed boundary wins on diagonal exits. Goal mouth and crossbar clearance account for the ball's radius and rendered height scale. [Law 9](https://www.theifab.com/laws/latest/the-ball-in-and-out-of-play/), [Law 10](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/)
- **Second touch and indirect free kicks:** retain restart type/team/taker until another player touches. A second touch awards an indirect free kick, including special placement outside the attacking goal area. The taker's off-ball AI does not chase its untouched restart; a human can still incur the offence. Indirect kicks enforce spacing and cannot score directly. Direct own-goal restarts award corners. [Law 13](https://www.theifab.com/laws/latest/free-kicks/)
- **Offside on receiving:** snapshot player positions at pass contact; compare receiver with the ball, second-last opponent and halfway line. Penalise on actual reception, even if they have since returned onside. No offence directly from a goal kick, corner or throw-in. Controlled opposition possession resets the pending phase. [Law 11](https://www.theifab.com/laws/latest/offside/)
- **Goalkeeper possession:** hands available only in the keeper's own penalty area for an opposing delivery. Teammate deliveries and balls outside the area use ordinary foot control. Hand possession prevents tackling, constrains movement to the area and awards the nearest corner if held over eight seconds. [Law 12](https://www.theifab.com/laws/latest/fouls-and-misconduct/)
- **Shootouts:** existing alternating five-kick sequence, early clinch and equal-attempt sudden death retained; track rotating eligible taker IDs so one player cannot repeat before all eleven have taken a kick. [Law 10](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/)

## Pointer and pass controls

Physical pointer capture now survives possession loss, reception and selection changes. Running retains the held screen direction, mapped again for the new controlled player. A handoff reanchors the kick gesture at the last pointer position and disarms old kick intent. Move/drag again while continuing to hold to aim a fresh pass; simply releasing the old gesture does not shoot. This also handles loss and reacquisition of the same player between frames through the possession serial.

Drag length affects pass power, and a small receiving assist snaps a clearly aimed nearby teammate target. Teammate targets stay passes even near goal. Release queues exactly one ownership-bound kick. Pointer cancellation, capture loss, pause, blur and phase changes clear input safely; secondary pointers cannot steal an active gesture. Simulated mouse and scaled-touch handler sequences cover actual flight to a receiver from kickoff and open play.

## Geometry and deliberate limitations

`RULES` shares pitch marking dimensions, centre-circle distance, penalty/goal areas, corner arc, ball radius and crossbar dimensions with rendering. It uses the existing stylised field; it is not a survey-accurate full-size pitch. Player-centre positions approximate bodies for offside and spacing. A mobile minimum drawing size can exaggerate the ball's visual radius for legibility.

Remaining gaps, **not implemented**:

- Careless/reckless fouls, physical handball offences, direct free kicks for fouls, in-match penalties, advantage, yellow/red cards, misconduct and substitutions. Current tackles are abstract clean possession challenges; no claim that every physical football offence is modelled.
- Offside interference with an opponent or goalkeeper's sight line; body-part judging and deflection/save/rebound distinctions. There is no separate rebound engine. Current offside covers receiving a team-mate's pass, not the full law.
- Quick goal-kick exceptions for opponents unable to leave, referee sanctions for persistent encroachment and timed referee countdowns for delaying goal kicks/throw-ins. Players are placed legally before the restart instead.
- Fully adjudicated throw-in foot/hand faults. The animation enforces a fixed legal delivery location; it does not simulate an illegal throw as an available action.
- Detailed keeper hand-release/drop-kick animation, illegal deliberate handling and accidental double-kick interpretations. Forbidden catches are prevented by choosing foot control, rather than exposed as intentional misconduct.
- Physical shootout run-ups, goalkeeper line offences, rebounds, coin tosses and player eligibility changes. The shootout remains a directional-choice abstraction.
- Regulation real-time match duration, stoppage-time calculation and full tournament rounds. Cup play remains QF → SF → final; practice remains untimed.

## Verification

The committed simulation/DOM suite covers both teams and halves, positioning through contact, first-boundary selection, direct-goal restrictions, second touch, offside reception/exemptions, goalkeeper possession, keyboard kickoffs, continuous pointer hold and reacquisition, cancellation, pass power and flight to teammates.

This revision was tested by evaluating the real engine and UI event handlers in a V8 DOM/canvas harness. Browser plugin and executor are unavailable in this delegated thread. No actual browser rendering, physical touchscreen, production HTTP smoke test or local build is claimed. Vercel deployment status is checked separately; independent browser QA is still needed.
