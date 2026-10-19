# CLAUDE.md

Arcana: a Lit + Tailwind v4 + Vite tarot question game for one phone passed around a group.

## Hard rule: state lives in katha

All logic lives in the katha store (`src/store/`). **Components only dispatch actions (`store.put`) and read state (`fromStore` with a selector from `src/store/selectors.ts`).**

- No game logic, validation or derived values in components. Add a selector or view-model field instead.
- Reducers and `rules.ts` are pure. Randomness (`Random`), time (`Clock`) and storage go in `processes.ts`, which turns an intent action into a fully formed event action.
- Purely presentational, DOM-only behaviour (animation loops, applying a store-requested focus) is fine in components.

## Commands

- `npm test`: vitest store tests. Randomised tests are fast-check properties over dice (`Rolls`), never `Math.random()` loops; `npm run test:soak` runs 5000 cases each. `tests/simulate.ts` plays whole games through the real store (processes included) with a seeded `Random`; use it for anything about how a game plays out.
- `npm run build`: `tsc --noEmit` + vite build. Must pass before committing.
