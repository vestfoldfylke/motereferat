import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getMeetingDate } from '../lib/smart/smart-meetings.js'

describe('getMeetingDate works as expected when', () => {
  it('has a valid date', () => {
    const date = getMeetingDate('2023-10-01T22:00:00Z')
    assert.strictEqual(date, '2023-10-02')
  })
  it('has a valid date with time', () => {
    const date = getMeetingDate('2023-10-01T23:00:00Z')
    assert.strictEqual(date, '2023-10-02')
  })
  it('has a valid date without time', () => {
    const date = getMeetingDate('2023-10-01')
    assert.strictEqual(date, '2023-10-01')
  })
  it('has an invalid date', () => {
    assert.throws(() => getMeetingDate('invalid-date'), {
      name: 'Error',
      message: 'Invalid date format'
    })
  })
})
