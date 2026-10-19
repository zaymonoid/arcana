import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import * as R from '../src/store/rules'
import { pairSpread, simulate } from './simulate'

fc.configureGlobal({ numRuns: Number(import.meta.env.FC_RUNS) || 100 })

const seed = fc.string({ minLength: 1, maxLength: 12 })
const length = fc.constantFrom('quick', 'standard', 'deep' as const)
/** Pass decisions for the first 100 cards of a game; after that nobody passes. Kept as data so a counterexample prints it. */
const passes = fc.array(fc.boolean(), { maxLength: 100 })
const passing = (xs: boolean[]) => (n: number) => xs[n] ?? false

describe('simulated games', () => {
  it('pairs everyone with everyone roughly evenly', () =>
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 3, max: 10 }), length, seed, passes, async (players, length, seed, passes) => {
        const g = await simulate({ players, length, seed, passes: passing(passes) })
        // Before planning targets a round at a time, a deep game for four could
        // see one couple share 13 cards more than another.
        expect(pairSpread(g)).toBeLessThanOrEqual(3)
      }),
    ))

  it('asks about everyone equally, and never makes anyone ask themselves', () =>
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), length, seed, passes, async (players, length, seed, passes) => {
        const g = await simulate({ players, length, seed, passes: passing(passes) })
        for (const e of g.log) expect(e.card.target).not.toBe(e.drawer)
        // A group card has no target, so it leaves someone a question short; everyone is
        // asked about once a round, so that gap stays. Nothing else makes it uneven.
        const groups = g.log.filter((e) => e.outcome === 'answered' && e.card.target === null).length
        const asked = g.players.map((p) => p.askedAbout)
        expect(Math.max(...asked) - Math.min(...asked)).toBeLessThanOrEqual(groups)
        expect(g.answered).toBe(players * R.ROUNDS[length] * 3)
      }),
    ))

  it('plays the same game from the same seed', () =>
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), length, seed, async (players, length, seed) => {
        const [a, b] = await Promise.all([simulate({ players, length, seed }), simulate({ players, length, seed })])
        expect(a.log).toEqual(b.log)
      }),
      { numRuns: 20 },
    ))
})

describe('assign', () => {
  /** Every way of giving each row its own column, by brute force. */
  function cheapest(cost: number[][]): number {
    const cols = cost[0].length
    const go = (row: number, taken: Set<number>): number =>
      row === cost.length
        ? 0
        : Math.min(
            ...Array.from({ length: cols }, (_, c) => c)
              .filter((c) => !taken.has(c))
              .map((c) => cost[row][c] + go(row + 1, new Set([...taken, c]))),
          )
    return go(0, new Set())
  }

  it('finds an assignment as cheap as brute force, with every column used at most once', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }).chain((cols) =>
          fc.integer({ min: 1, max: cols }).chain((rows) =>
            fc.array(fc.array(fc.integer({ min: 0, max: 50 }), { minLength: cols, maxLength: cols }), {
              minLength: rows,
              maxLength: rows,
            }),
          ),
        ),
        (cost) => {
          const out = R.assign(cost)
          expect(new Set(out).size).toBe(cost.length)
          expect(out.every((c) => c >= 0 && c < cost[0].length)).toBe(true)
          expect(out.reduce((sum, c, row) => sum + cost[row][c], 0)).toBe(cheapest(cost))
        },
      ),
    ))
})
