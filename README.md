# Arcana: questions

A tarot-styled question game that helps a group get to know each other. **One phone is passed around the circle.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzaymonoid%2Fquestions&project-name=arcana-questions&repository-name=arcana-questions)

Built with [Lit](https://lit.dev), [Tailwind CSS v4](https://tailwindcss.com) and [Vite](https://vite.dev). It's a static site with no backend.

## How to play

1. **Setup:** enter 2–10 names in seating order (clockwise) and choose a length:
   - Quick: 1 round per level
   - Standard: 2 rounds per level
   - Deep: 3 rounds per level
2. **Each turn:**
   - The app says *"It's X's turn to draw"*.
   - That player taps the face-down card to flip it, then reads it aloud.
   - When the card has been answered they tap it again. The phone moves clockwise to the next player.
   - Tapping the card (or anywhere around it) is how the whole game moves on: it also begins each level and finishes the reading. The **↶** button in the top left undoes an accidental tap.
3. **Passes:** each player has 3 passes for the whole game. A pass deals a replacement card, already turned over.
4. **Targets:** every card except a group card is for someone else, never the person holding the phone. Everyone is asked about once per round, and pairings are spread out: you're steered towards the people you've shared fewest cards with. The card says who speaks:
   - *guess*: you guess about them, then they reveal the truth
   - *read*: a question about "you", which you read to them and they answer
   - *ask*: you ask them something, and they answer
   - *tell*: you say something to them
   - *pair*: you do it together
   - *group*: everyone plays
5. **Two players:** the spotlight (whoever the card is really about) stays even: never more than one card apart, so nobody is in it three times running. Cards that put the drawer in the spotlight usually come in pairs: you tell me something, then I tell you.
6. **Wildcards:** in level 1 only, about 1 card in 8 is a *Wheel of Fortune* card that everyone plays.
7. **Oblique cards:** from level 2 onward, about 1 card in 12 is a *Hanged Man* card: a sideways instruction rather than a question, loosely after Oblique Strategies.
8. **Three levels:**

   | Level | Card | Theme |
   |---|---|---|
   | 1 | 0 · The Fool | **Perception**: guess about someone, then they reveal the truth |
   | 2 | VI · The Lovers | **Connection**: read a question to someone, who answers honestly |
   | 3 | XVII · The Star | **Revelation**: the deepest questions: loss, regret, love, what goes unsaid |

   A level ends after its set number of rounds. The **⋯ → Go deeper** menu option moves on early.
9. **Ending:** a closing card (*The Sun*), then a summary (*The World*).

Progress is saved in `localStorage`, so a refresh doesn't lose the game.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # store unit tests (vitest + fast-check properties)
npm run test:soak  # the same with 5000 cases per property
npm run build    # type-check + build to dist/
```

## Architecture

State is managed with [katha](https://github.com/zaymonoid/katha): a reducer plus Effect processes.
**Hard rule: all logic lives in the store. Components only dispatch actions and read state.**

```
src/
  deck.ts                 questions + arcana (data)
  store/
    state.ts              State, Action union, initial state
    rules.ts              pure game rules (randomness/time passed in as arguments)
    reducer.ts            State × Action → State, built from rules
    processes.ts          side effects: dice rolls (Effect Random), clock, localStorage
    selectors.ts          view models: everything the UI shows, pre-derived
    index.ts              store boot (ManagedRuntime) + exported `store` handle
  components/
    arcana-app.ts         <arcana-app>: fromStore(selectors) + store.put(actions), nothing else
    iridescent-shimmer.ts WebGL flow-field iridescence over face-down cards
    art.ts                SVG card back + emblems
```

UI intents (`card/draw`, `card/pass`, `game/start`) are handled by processes. Each one rolls dice or reads the clock, then dispatches a fully formed event (`card/dealt`, `game/started`) that the reducer applies purely.

Each pile (each level's cards, the wildcards, the obliques) is a shuffled deck held in the game state. Cards come off the top, and when a pile runs out the discards are shuffled back in. A process rolls the dice and `rules.draw` is pure, so a game is a function of its dice and survives undo and refresh. A passed card goes to the bottom of its pile.

The target is chosen first. On every draw, the rest of the round is planned as a minimum-cost assignment (the Hungarian algorithm, `rules.assign`). Each drawer left in the round gets a different target, never themselves. Whoever has been asked about least comes first, so everyone is asked about equally by the end of each round. After that, pairs who've shared fewest cards come first, and a repeat costs more the more often that pair has already met. Only the active player's target is used; the plan is redone next draw. Choosing one target at a time could paint the end of a round into a corner: a deep game for four could see one couple share 13 more cards than another. Planning the round keeps that gap to 3 at most. Then the card is fitted to the target. Every prompt has a `subject` (`self`: the drawer is in the spotlight, `other`: the target is, `shared`: nobody in particular). In a two-player game, the dealt card is the first from the top of the pile that keeps the spotlight even, counted from the draw log. If the pile can't, the discards are shuffled in underneath, then the level's other piles are tried.

These invariants are [fast-check](https://fast-check.dev) properties over arbitrary dice and passes in `tests/store.test.ts`: even targeting, never targeting the drawer, an even two-player spotlight, every card in a pile before any repeats, passes never dealt straight back, and determinism.

`tests/simulate.ts` plays whole games headlessly through the real store, reducer and processes together. Effect's `Random` is seeded, and a bot puts the same intents the UI does, waiting for the state to move after each one. `tests/simulation.test.ts` runs fast-check over seeds, group sizes, lengths and pass patterns to check, end to end, that pairings stay roughly even, everyone is asked about equally, and a seed always replays the same game.

The face-down shimmer is a fragment shader. Each pixel is advected along a noise-driven flow field, and fine contour filaments are mapped through a thin-film interference palette, with a slow sweeping glint on top. It fades out as the card flips. It renders one still frame under `prefers-reduced-motion`, and does nothing if WebGL is unavailable.
