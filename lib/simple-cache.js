import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, readdirSync, unlinkSync } from 'fs'

const getKeyName = (key) => {
  if (!key || typeof key !== 'string') {
    throw new Error('key must be a string')
  }
  const validKeyName = /^[a-zA-Z0-9._ -]+$/.test(key)
  if (!validKeyName) {
    throw new Error(`key must be a valid key name [a-zA-Z0-9._ -], got: ${key}`)
  }
  const keySuffix = ''
  if (key.length > 255 - keySuffix.length) {
    throw new Error(`key must be less than ${255 - keySuffix.length} characters`)
  }
  return `${key}${keySuffix}`
}

const setupCacheDir = (cacheDir) => {
  if (!cacheDir) return undefined
  if (typeof cacheDir !== 'string') throw new Error('cacheDir must be a string')
  if (!cacheDir.startsWith('./')) throw new Error(`cacheDir must be a relative path starting with "./" - got "${cacheDir}"`)
  const cacheDirectory = (cacheDir.endsWith('-cache') ? cacheDir : `${cacheDir}-cache`)
  const cacheDirName = cacheDirectory.split('/').pop()
  if (cacheDirName.length > 255) throw new Error('cacheDir must be less than 249 characters')
  if (!existsSync(cacheDirectory)) {
    mkdirSync(cacheDirectory, { recursive: true })
  }
  return cacheDirectory
}

// Arrgh, have to keep track of the memory caches, so they do not crash with each other...
const memoryCaches = new Map()

/**
 * @typedef {Object} SimpleCache
 * @property {string|null} cacheDirectory - The directory where the cache is stored, or null if only in memory.
 * @property {function(string): void} set - Sets a value in the cache.
 * @property {function(string): any} get - Gets a value from the cache.
 * @property {function(string): boolean} delete - Deletes a value from the cache.
 * @property {function(string): boolean} has - Checks if a value exists in the cache.
 * @property {function(): boolean} clearMemory - Clears the memory cache.
 * @property {function(): boolean} clear - Clears the entire cache, including the disk cache.
 * @property {function(): number} size - Returns the size of the cache.
 * @property {function(): string[]} keys - Returns an array of keys in the cache.
 * @property {function(): string[]} files - Returns an array of file names in the cache directory.
 */

/**
 *
 * @param {string} cacheDir - The directory where the cache will be stored. If not provided, the cache will only be in memory.
 * @returns {SimpleCache}
 */

export const createSimpleCache = (cacheDir) => {
  const cacheDirectory = setupCacheDir(cacheDir)
  let memoryCache
  if (cacheDirectory && memoryCaches.has(cacheDirectory)) {
    memoryCache = memoryCaches.get(cacheDirectory)
  } else {
    memoryCache = new Map()
    if (cacheDirectory) memoryCaches.set(cacheDirectory, memoryCache)
  }
  const cache = {
    cacheDirectory: cacheDirectory || null,
    set: (key, value) => {
      const keyName = getKeyName(key)
      if (value === undefined) throw new Error('value cannot be undefined')
      try {
        if (cacheDirectory) {
          if (!existsSync(cacheDirectory)) setupCacheDir(cacheDirectory)
          writeFileSync(`${cacheDirectory}/${keyName}.json`, JSON.stringify(value, null, 2), 'utf8')
        }
        memoryCache.set(keyName, value)
      } catch (error) {
        throw new Error(`Failed to set cache for key "${key}": ${error.message}`)
      }
    },
    get: (key) => {
      const keyName = getKeyName(key)
      if (memoryCache.has(keyName)) return memoryCache.get(keyName)
      if (cacheDir) {
        try {
          if (!existsSync(`${cacheDirectory}/${keyName}.json`)) return undefined
          const data = readFileSync(`${cacheDirectory}/${keyName}.json`, 'utf8')
          const parsedData = JSON.parse(data)
          memoryCache.set(keyName, parsedData)
          return parsedData
        } catch (error) {
          throw new Error(`Failed to get cache for key "${key}": ${error.message}`)
        }
      }
      return undefined
    },
    delete: (key) => {
      const keyName = getKeyName(key)
      if (memoryCache.has(keyName)) {
        memoryCache.delete(keyName)
      }
      if (cacheDirectory && existsSync(`${cacheDirectory}/${keyName}.json`)) {
        try {
          unlinkSync(`${cacheDirectory}/${keyName}.json`)
        } catch (error) {
          throw new Error(`Failed to delete cache for key "${key}": ${error.message}`)
        }
      }
      return true
    },
    has: (key) => {
      const keyName = getKeyName(key)
      if (memoryCache.has(keyName)) {
        return true
      }
      if (cacheDirectory && existsSync(`${cacheDirectory}/${keyName}.json`)) {
        return true
      }
      return false
    },
    clearMemory: () => {
      memoryCache.clear()
      return true
    },
    clear: () => {
      if (cacheDirectory && existsSync(cacheDirectory)) {
        try {
          rmSync(cacheDirectory, { recursive: true, force: true })
        } catch (error) {
          throw new Error(`Failed to delete entire cache: ${error.message}`)
        }
      }
      memoryCache.clear()
      return true
    },
    size: () => {
      if (cacheDirectory && existsSync(cacheDirectory)) {
        try {
          const files = readdirSync(cacheDirectory)
          return files.length
        } catch (error) {
          throw new Error(`Failed to get cache size: ${error.message}`)
        }
      }
      return memoryCache.size
    },
    keys: () => {
      if (cacheDirectory && existsSync(cacheDirectory)) {
        try {
          const files = readdirSync(cacheDirectory)
          return files.map(file => file.replace('.json', ''))
        } catch (error) {
          throw new Error(`Failed to get cache keys: ${error.message}`)
        }
      }
      return Array.from(memoryCache.keys())
    },
    files: () => {
      if (cacheDirectory && existsSync(cacheDirectory)) {
        try {
          return readdirSync(cacheDirectory).filter(file => file.endsWith('.json'))
        } catch (error) {
          throw new Error(`Failed to get cache files: ${error.message}`)
        }
      }
      return []
    }
  }
  return cache
}
