# Football QA coverage and remaining gaps

Updated: 2026-11-16. Gameplay baseline: [cb0fd47](https://github.com/UaenaBlink-12306/cs-club-arcade/commit/cb0fd47c59e1924ba615f6ab8b8c6ca87778fee5).
Live game: https://cs-club-arcade.vercel.app/soccer-skills/index.html

This is a coverage record, not a claim of complete correctness or reference fidelity. Native observations below were reported by the parent reviewer; the agent recording this note did not repeat them. Later documentation-only commits do not change the gameplay baseline.

## Native-browser observations

The reviewer used a desktop browser, including repeated tests at an actual **333×505 CSS viewport** (500×757 content at 150% browser zoom). This is a real narrow layout viewport, not mobile-device or touch emulation.

Observed through normal UI and gameplay:

- Solo/local play, keyboard actions, atomic pointer drags, passes and shots.
- Replay Skip and automatic replay exit focus; pause, resume, restart and quit.
- Halftime/full-time layouts with long country names.
- Shootout Practice shooting, goalkeeper controls, results and reset.
- Complete natural Cup victories, quarterfinal → semifinal → final transitions, and Play Another Cup reset.
- Naturally occurring direct free kicks; goal kicks in earlier local play.
- A natural opponent throw-in announcement that was readable after cb0fd47, followed by automatic AI continuation.

These observations cover the sampled runs, not every team, viewport, restart owner or outcome.

## Remaining gaps and next evidence

| Gap | Existing evidence | Next acceptable evidence |
| --- | --- | --- |
| Natural tied Cup → shootout in a native browser | Two event-harness Cup runs reached 0–0 without assigning scores, positions, possession or clock values, then completed shootouts and exercised win/loss progression. The policy read game state and steered at 60 Hz; it is not a fixed native input recipe. | Stop repeated blind attempts to force a draw. Use an instrumented, supported browser-input test that plays through regulation, or a human play session. Identify instrumentation and any fixtures explicitly. |
| Player-awarded corners and ordinary in-match penalties reached naturally | Focused synthetic fixtures cover rules, ownership, controls and transitions. Native natural occurrence has not been verified. | Retain the fixture tests; capture a practical normal-input reproduction if one is found, or arrange human play. Do not relabel fixture coverage as naturally reached coverage. |
| Uninterrupted held-pointer turnover/recovery | Harness checks passed capture retention, stationary release producing no stale kick, and fresh aim producing one kick. Some checks use assigned-possession fixtures; additional runs reached actual AI loss/recovery through state-aware input. | Use a supported API with independent pointer down/move/up while time advances, or a human test. The current native API provides atomic drags/timed clicks and cannot establish this continuous-gesture behavior. No state injection for native natural-play claims. |
| Physical mobile/touch | Narrow desktop layout and synthetic pointer/touch-event checks only. | Test on physical touch hardware, including cancellation, recovery and responsive layouts. Desktop zoom is not physical-touch evidence. |
| Live reference gameplay/fidelity | Poki Soccer Skills 2 World Cup and the authorized Champions League fallback both showed black game surfaces in the reviewer's native browser, including after one World Cup reload. No reference gameplay was observed. Official descriptions describe drag to move, release to kick, and drag intensity affecting speed/power. | Obtain a working reference session or review the user's recording with explicit evidence limits. Do not claim live-observed reference behavior or verified fidelity from descriptions or black surfaces. |

## Reporting discipline

Label evidence as native browser, physical device, event harness, or synthetic fixture. State when an input policy reads state or reacts frame by frame. Unit/geometry assertions do not prove native text layout, animation quality or device behavior. Preserve these gaps until the specified evidence is obtained; do not add speculative gameplay changes merely to close a QA checklist.
