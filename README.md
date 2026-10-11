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
   - The app says *"Pass the phone to X"*.
   - That player taps the face-down card to flip it, then reads it aloud.
   - They tap **Done**. The phone moves clockwise to the next player.
3. **Passes:** each player has 2 passes for the whole game. A pass draws a replacement card.
4. **Targets:** cards that name another player pick them by fair rotation. The app chooses whoever has been asked about least, and never the person holding the phone.
5. **Wildcards:** about 1 card in 8 is a *Wheel of Fortune* card that everyone plays.
6. **Three levels:**

   | Level | Card | Theme |
   |---|---|---|
   | 1 | 0 · The Fool | **Perception**: guess about someone, then they reveal the truth |
   | 2 | VI · The Lovers | **Connection**: answer about yourself |
   | 3 | XVII · The Star | **Reflection**: on tonight and each other |

   A level ends after its set number of rounds. The **⋯ → Go deeper** menu option moves on early.
7. **Ending:** a closing card (*The Sun*), then a summary (*The World*).

Progress is saved in `localStorage`, so a refresh doesn't lose the game.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + build to dist/
```

## Code layout

- `src/deck.ts`: every question and the arcana. Add cards here; `{name}` marks a card about another player.
- `src/game.ts`: the game rules as pure state transitions (turn order, targets, passes, levels).
- `src/app.ts`: the `<arcana-app>` Lit component. It renders into light DOM so Tailwind applies.
- `src/art.ts`: the SVG card back and emblems.
