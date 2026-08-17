# AGENTS.md

## Project Focus

This workspace is for an HTML5 PC game prototype called "Hell Court" / "지옥법정".

The goal is to quickly test the core game loop, UI flow, mood, and interaction feel in a desktop browser. Prototype speed matters, but the playable experience should stay coherent.

## Primary Target

- Target desktop browser play first.
- Keyboard interaction is important.
- Mouse interaction should work for visible buttons and menus.
- Mobile support is secondary unless explicitly requested.
- Prefer a single playable `index.html` entry point for early prototypes.

## Technical Direction

- Use plain HTML5, CSS, and JavaScript unless the existing project already uses a library.
- Keep dependencies minimal.
- Prefer readable, direct game-state code over heavy abstractions.
- Keep game data in separate files under `assets/data` when it grows.
- Keep reusable behavior in `assets/js` when inline scripts become too large.
- Avoid build steps unless the user explicitly asks for one.

## Prototype Priorities

Work in this order:

1. Core loop: start trial, inspect evidence, spend resources, make verdict, see result.
2. Input feel: keyboard navigation, click targets, focus state, and feedback.
3. Readability: clear panels, legible text, stable layout.
4. Game balance knobs: time, spirit, costs, case count, outcome rules.
5. Mood: background art, sound, transitions, and small effects.

For a prototype, placeholder data and rough art are acceptable if the loop is playable.

## UI Guidelines

- Build the actual game screen first, not a landing page.
- Keep PC layouts dense but readable.
- Use stable dimensions for panels, menus, buttons, meters, and event lists.
- Make selected states obvious for keyboard navigation.
- Avoid overlapping text or resizing buttons during interaction.
- Do not hide important game state behind decorative UI.
- Use semantic controls such as `button`, `textarea`, `nav`, `section`, and `main` where practical.

## Game Design Guidelines

- Every action should communicate cost and result.
- If an action fails, show a short reason.
- Important state changes should update the HUD immediately.
- Verdicts should feel consequential even in prototype form.
- Keep labels and story text in Korean unless the user requests otherwise.
- Favor small, testable interactions over large unfinished systems.

## File Style

- Keep edits scoped to the files involved in the requested feature.
- Do not rewrite unrelated game systems while adding one feature.
- Use ASCII for code unless Korean text or existing content requires otherwise.
- Add comments only when they clarify non-obvious game logic.
- Preserve user-made changes in the working tree.

## Change Reporting

When UI or game code changes introduce, rename, or remove selectors, tell the user in the reply:

- New or changed CSS classes (e.g. `.panel-court-name`)
- New or changed element IDs (e.g. `#courtMeta`)
- Important config/label keys that drive visible text (e.g. `GAME_CONFIG.labels.courtName`)

Keep the list short and tied to what actually changed in that turn. Skip it when no identifiers changed.

## Git

When the user asks for a local commit in this workspace, use `git commit --no-verify` (skip hooks).

## Verification

Before finishing changes:

- Confirm the page can load.
- Check that the main game loop still works.
- Check keyboard navigation for the touched screen.
- Check clickable controls for the touched screen.
- Look for obvious console errors.
- Check that visible text fits in its containers.

## Good Prototype Tasks

Useful next steps for this project include:

- Add one complete playable case.
- Add a verdict scoring rule.
- Add a day/lobby progression loop.
- Add keyboard-first menu polish.
- Add simple sound toggles and feedback.
- Add rough background art placeholders.
- Add a debug panel for time, spirit, and current case state.
