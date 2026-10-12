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
4. **Targets:** nobody answers their own draw. Cards that name another player, and questions about "you", pick who they're for by fair rotation: whoever has been asked about least, and never the person holding the phone. The drawer reads the card to them.
5. **Wildcards:** in level 1 only, about 1 card in 8 is a *Wheel of Fortune* card that everyone plays.
6. **Oblique cards:** from level 2 onward, about 1 card in 12 is a *Hanged Man* card: a sideways instruction rather than a question, loosely after Oblique Strategies.
7. **Three levels:**

   | Level | Card | Theme |
   |---|---|---|
   | 1 | 0 · The Fool | **Perception**: guess about someone, then they reveal the truth |
   | 2 | VI · The Lovers | **Connection**: read a question to someone, who answers honestly |
   | 3 | XVII · The Star | **Revelation**: the deepest questions: loss, regret, love, what goes unsaid |

   A level ends after its set number of rounds. The **⋯ → Go deeper** menu option moves on early.
8. **Ending:** a closing card (*The Sun*), then a summary (*The World*).

Progress is saved in `localStorage`, so a refresh doesn't lose the game.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # store unit tests (vitest)
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

On cards that name another player, the target is chosen by fair rotation. The app picks whoever has been asked about least, and breaks ties toward players whose own turn is still to come this round. This keeps the counts exactly even at the end of every round, and a randomized test checks it.

The face-down shimmer is a fragment shader. Each pixel is advected along a noise-driven flow field, and fine contour filaments are mapped through a thin-film interference palette, with a slow sweeping glint on top. It fades out as the card flips. It renders one still frame under `prefers-reduced-motion`, and does nothing if WebGL is unavailable.
