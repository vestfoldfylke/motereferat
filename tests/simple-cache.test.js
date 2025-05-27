import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createSimpleCache } from '../lib/simple-cache.js'

describe('Simple cache works as expected when it', () => {
  it('is initialized with cacheDir', () => {
    const cache = createSimpleCache('./.test-cache')
    cache.clear()
    assert.strictEqual(cache.get('test'), undefined)
    cache.set('test', 'test')
    assert.strictEqual(cache.get('test'), 'test')
    const obj = { test: 'test' }
    cache.set('test', obj)
    assert.strictEqual(cache.get('test'), obj)
    cache.clearMemory()
    assert.notStrictEqual(cache.get('test'), obj)
    assert.deepStrictEqual(cache.get('test'), obj)
  })
  it('is initialized without cacheDir', () => {
    const cache = createSimpleCache()
    assert.strictEqual(cache.get('test'), undefined)
    cache.set('test', 'test')
    assert.strictEqual(cache.get('test'), 'test')
    const obj = { test: 'test' }
    cache.set('test', obj)
    assert.strictEqual(cache.get('test'), obj)
    cache.clear()
    assert.strictEqual(cache.get('test'), undefined)
  })
  it('two caches that reference the same dir, returns and modifies the same values', () => {
    const cache1 = createSimpleCache('./.test-cache')
    const cache2 = createSimpleCache('./.test-cache')
    cache1.set('test', 'test')
    assert.strictEqual(cache2.get('test'), 'test')
    cache2.clear()
    assert.strictEqual(cache1.get('test'), undefined)
    cache2.set('test', 'hallo')
    assert.strictEqual(cache1.get('test'), 'hallo')
  })
})

describe('Simple cache throws as expected', () => {
  it('throws when trying to set undefined value', () => {
    const cache = createSimpleCache('./.test-cache')
    const undefinedValue = () => cache.set('test', undefined)
    assert.throws(undefinedValue, { name: 'Error', message: 'value cannot be undefined' })
  })
  it('throws when trying to set with invalid key', () => {
    const cache = createSimpleCache('./.test-cache')
    const invalidKey = () => cache.set(123, 'test')
    assert.throws(invalidKey, { name: 'Error', message: 'key must be a string' })
  })
  it('throws when trying to get with invalid key', () => {
    const cache = createSimpleCache('./.test-cache')
    const invalidKey = () => cache.get(123)
    assert.throws(invalidKey, { name: 'Error', message: 'key must be a string' })
  })
  it('throws when trying to delete with invalid key', () => {
    const cache = createSimpleCache('./.test-cache')
    const invalidKey = () => cache.delete(123)
    assert.throws(invalidKey, { name: 'Error', message: 'key must be a string' })
  })
  it('throws when trying to get with invalid cacheDir', () => {
    const invalidCacheDir = () => createSimpleCache('balle')
    assert.throws(invalidCacheDir, { name: 'Error', message: 'cacheDir must be a relative path starting with "./" - got "balle"' })
  })
  it('throws when not using legal key name', () => {
    const cache = createSimpleCache('./.test-cache')
    const invalidKey = () => cache.set('test@', 'test')
    assert.throws(invalidKey, { name: 'Error', message: 'key must be a valid key name [a-zA-Z0-9._ -], got: test@' })
  })
})
