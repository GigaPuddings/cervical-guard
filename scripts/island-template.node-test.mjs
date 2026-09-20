import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const islandHtml = readFileSync('public/island.html', 'utf8')

describe('dynamic island detail timer', () => {
  it('uses the same current-session clock source as the dashboard', () => {
    assert.match(islandHtml, /const sessionClock = \(seconds\) =>/)
    assert.match(islandHtml, /#d-seated'\)\.textContent = sessionClock\(snapshot\.seatedSeconds\)/)
    assert.doesNotMatch(islandHtml, /pausedElapsedSeconds/)
  })

  it('keeps the compact timer on one line', () => {
    assert.match(islandHtml, /\.detail-time strong \{[\s\S]*?font-size: 22px;[\s\S]*?white-space: nowrap;/)
  })
})
