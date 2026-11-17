import { describe, expect, it } from 'vitest'
import type { StageHandoff } from './handoff'

describe('StageHandoff', () => {
  it('survives a JSON round trip', () => {
    const h: StageHandoff = {
      runId: 3,
      stage: 'collection',
      folders: [{ path: '/a/2026-11-14', clips: [{ name: 'x.mov', sizeBytes: 10 }] }],
    }
    expect(JSON.parse(JSON.stringify(h))).toEqual(h)
  })
})
