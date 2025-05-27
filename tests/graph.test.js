import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createBatchRequests } from '../lib/graph.js'

const aLotOfRequests = []
for (let i = 0; i < 100; i++) {
  aLotOfRequests.push({
    method: 'POST',
    url: 'https://example.com/tjohei!',
    headers: {
      'Content-Type': 'application/json'
    },
    body: { halla: 'balla' }
  })
}

describe('createBatchRequest works as expected when', () => {
  it('has below 20 requests', () => {
    const batches = createBatchRequests(aLotOfRequests.slice(0, 5))
    assert.strictEqual(batches.length, 1)
    assert.strictEqual(batches[0].length, 5)
  })
  it('has more than 20 request', () => {
    const batches = createBatchRequests(aLotOfRequests)
    assert.strictEqual(batches.length, 5)
    assert.strictEqual(batches[0].length, 20)
    assert.strictEqual(batches[1].length, 20)
    assert.strictEqual(batches[2].length, 20)
    assert.strictEqual(batches[3].length, 20)
    assert.strictEqual(batches[4].length, 20)
  })
  it('has 21 requests', () => {
    const batches = createBatchRequests(aLotOfRequests.slice(0, 21))
    assert.strictEqual(batches.length, 2)
    assert.strictEqual(batches[0].length, 20)
    assert.strictEqual(batches[1].length, 1)
  })
  it('request has custom header and body', () => {
    const batches = createBatchRequests([
      {
        method: 'POST',
        url: 'https://example.com/tjohei!',
        headers: {
          'Content-Type': 'grus'
        },
        body: 'nununuunu'
      }
    ])
    assert.strictEqual(batches[0][0].headers['Content-Type'], 'grus')
    assert.strictEqual(batches[0][0].body, 'nununuunu')
  })
  it('request has no body', () => {
    const batches = createBatchRequests([
      {
        method: 'GET',
        url: 'https://example.com/tjohei!'
      }
    ])
    assert.strictEqual(batches[0][0].headers, undefined)
    assert.strictEqual(batches[0][0].body, undefined)
  })
  it('sets application/json as default header', () => {
    const batches = createBatchRequests([
      {
        method: 'POST',
        url: 'https://example.com/tjohei!',
        body: { halla: 'balla' }
      }
    ])
    assert.strictEqual(batches[0][0].headers['Content-Type'], 'application/json')
  })
})
