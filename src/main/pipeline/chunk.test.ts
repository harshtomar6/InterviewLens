import { describe, it, expect } from 'vitest'
import { planChunks } from './chunk'
import type { SpeechRegion } from '@shared/types'

describe('planChunks', () => {
  it('merges adjacent regions within the size and gap limits', () => {
    const regions: SpeechRegion[] = [
      { start: 0, end: 5 },
      { start: 6, end: 10 }
    ]
    const w = planChunks(regions, { maxChunkSec: 45, maxGapSec: 2 })
    expect(w).toEqual([{ start: 0, end: 10 }])
  })

  it('starts a new chunk after a large silent gap (drops dead air)', () => {
    const regions: SpeechRegion[] = [
      { start: 0, end: 5 },
      { start: 30, end: 35 }
    ]
    const w = planChunks(regions, { maxChunkSec: 45, maxGapSec: 2 })
    expect(w).toHaveLength(2)
    expect(w[1]?.start).toBe(30)
  })

  it('respects the max chunk size cap', () => {
    const regions: SpeechRegion[] = [
      { start: 0, end: 40 },
      { start: 41, end: 50 }
    ]
    const w = planChunks(regions, { maxChunkSec: 45, maxGapSec: 2 })
    expect(w.length).toBeGreaterThanOrEqual(2)
    for (const win of w) expect(win.end - win.start).toBeLessThanOrEqual(45 + 0.001)
  })

  it('splits a single region longer than the cap', () => {
    const regions: SpeechRegion[] = [{ start: 0, end: 100 }]
    const w = planChunks(regions, { maxChunkSec: 45, maxGapSec: 2 })
    expect(w.length).toBe(3) // 45 + 45 + 10
    for (const win of w) expect(win.end - win.start).toBeLessThanOrEqual(45 + 0.001)
  })
})
