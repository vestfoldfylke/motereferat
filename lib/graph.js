import axios from 'axios'
import { z } from 'zod/v4'
import { GRAPH, SHAREPOINT } from '../config.js'
import { defaultAzureCredential } from './azure-auth.js'
import { createSimpleCache } from './simple-cache.js'
import { logger } from '@vtfk/logger'

export const pagedRequest = async (url, options) => {
  if (!url || typeof url !== 'string') throw new Error('Missing required parameter url (string)')
  const { token } = await defaultAzureCredential.getToken(GRAPH.API_SCOPE)
  const headers = { ...options?.headers, Authorization: `Bearer ${token}` }

  logger('info', ['graph', 'pagedRequest', `Making request to ${url}`])
  let currentResponse = await axios.get(url, { headers })
  const result = {
    '@odata.context': currentResponse.data['@odata.context'],
    value: currentResponse.data.value,
    count: currentResponse.data['@odata.count'] || currentResponse.data.value.length
  }
  logger('info', ['graph', 'pagedRequest', `Got response with ${result.count} items`])
  while (currentResponse.data['@odata.nextLink']) {
    logger('info', ['graph', 'pagedRequest', 'Got nextLink, making another request to get some more'])
    currentResponse = await axios.get(currentResponse.data['@odata.nextLink'], { headers })
    if (!currentResponse.data?.value || !Array.isArray(currentResponse.data?.value)) {
      throw new Error(`Expected an array in data.value in response, got: ${JSON.stringify(currentResponse.data)}`)
    }
    result.value = [...result.value, ...currentResponse.data.value]
    logger('info', ['graph', 'pagedRequest', `Got another response with ${currentResponse.data.value.length} items`])
  }
  result.count = result.value.length
  logger('info', ['graph', 'pagedRequest', `Got a total of ${result.count} items - enjoy them!`])
  return result
}

export const getListUrlParts = (listUrl) => {
  if (!listUrl || typeof listUrl !== 'string') throw new Error('Missing required parameter listUrl (string)')
  const url = new URL(listUrl)

  const validFormat = `https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/{sitename}/lists/{listname}`
  if (url.hostname !== `${SHAREPOINT.TENANT_NAME}.sharepoint.com`) throw new Error('listUrl must be a valid Sharepoint URL')
  const pathparts = url.pathname.split('/').slice(1)
  if (pathparts.length < 4) throw new Error(`listUrl must be a valid Sharepoint URL on the format ${validFormat}, got: ${listUrl}`)
  if (pathparts[0].toLowerCase() !== 'sites') throw new Error(`listUrl must be a valid Sharepoint URL on the format ${validFormat}, got: ${listUrl}`)
  if (pathparts[2].toLowerCase() !== 'lists') throw new Error(`listUrl must be a valid Sharepoint URL on the format ${validFormat}, got: ${listUrl}`)

  const urlEncodedSiteName = pathparts[1]
  const urlEncodedlistName = pathparts[3]
  return {
    urlEncodedSiteName,
    urlEncodedlistName
  }
}

/** @typedef {z.infer<typeof ListInfo>} ListInfo */
export const ListInfo = z.object({
  siteId: z.string(),
  siteName: z.string(),
  listId: z.string(),
  listDisplayName: z.string(),
  listName: z.string(),
  listUrl: z.url()
})

/**
 *
 * @param {string} listUrl
 * @returns {Promise<ListInfo>}
 */
export const getListInfo = async (listUrl) => {
  const { urlEncodedSiteName, urlEncodedlistName } = getListUrlParts(listUrl)
  const siteName = decodeURIComponent(urlEncodedSiteName)
  const listName = decodeURIComponent(urlEncodedlistName)
  const listConfigCache = createSimpleCache('./.list-info')
  const cacheKey = `${siteName}-${listName}`
  const cachedListInfo = listConfigCache.get(cacheKey)
  if (cachedListInfo) {
    logger('info', ['graph', 'getListInfo', `Found cached list info for ${listName} in site ${siteName}, checking if it is still valid`])
    const requiredFields = ['siteId', 'listId', 'listDisplayName', 'listName', 'listUrl']
    const missingFields = []
    for (const field of requiredFields) {
      if (!cachedListInfo[field]) {
        missingFields.push(field)
      }
    }
    if (missingFields.length > 0) {
      logger('info', ['graph', 'getListInfo', `Cached list info is missing required fields: ${missingFields.join(', ')}, probably outdated... fetching new list info`])
    } else {
      logger('info', ['graph', 'getListInfo', 'Cached list info is valid, returning cached list info'])
      return cachedListInfo
    }
  }
  const siteLists = await pagedRequest(`${GRAPH.API_URL}/sites/${SHAREPOINT.TENANT_NAME}.sharepoint.com:/sites/${urlEncodedSiteName}:/lists`)
  const listUrlWeAreLookingFor = `https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/${urlEncodedSiteName}/lists/${urlEncodedlistName}`
  const listWeAreLookingFor = siteLists.value.find(list => list.webUrl.toLowerCase() === listUrlWeAreLookingFor.toLowerCase())
  if (!listWeAreLookingFor) throw new Error(`Could not find list with webUrl ${listUrlWeAreLookingFor} in site ${siteName}, please check the URL ${listUrl}`)
  const listInfo = ListInfo.parse({
    siteId: listWeAreLookingFor.parentReference.siteId,
    siteName,
    listId: listWeAreLookingFor.id,
    listDisplayName: listWeAreLookingFor.displayName,
    listName: listWeAreLookingFor.name,
    listUrl: listWeAreLookingFor.webUrl
  })
  listConfigCache.set(cacheKey, listInfo)
  return listInfo
}

/** @typedef {z.infer<typeof BatchRequests>} BatchRequests */
export const BatchRequests = z.array(z.array(z.object({
  id: z.string(),
  referenceId: z.string().optional(),
  method: z.enum(['GET', 'PATCH', 'POST', 'DELETE', 'PUT']),
  url: z.string(),
  body: z.any().optional(),
  headers: z.any().optional()
})))

/**
 *
 * @param {{ method: ("GET"|"PATCH"|"POST"|"DELETE"|"PUT"), url: string, body: [object], headers: [object], referenceId: [string] }[]} requests
 * @returns {BatchRequests}
 */
export const createBatchRequests = (requests) => {
  if (!requests || !Array.isArray(requests) || requests.length < 1) throw new Error('Missing required parameter requests (array) with at least one request')
  const methods = ['GET', 'PATCH', 'POST', 'DELETE', 'PUT']
  const batches = []
  const batchSize = 20
  let currentBatch = []
  for (const [index, item] of requests.entries()) {
    if (!item.method || !methods.includes(item.method)) throw new Error(`"method" must be one of ${methods.join(', ')}. Something is wrong...`)
    if (!item.url) throw new Error('"url" is missing from parameters. Something is wrong...')
    if (index > 0 && index % batchSize === 0) {
      batches.push(currentBatch)
      currentBatch = []
    }
    const request = {
      id: index.toString(),
      method: item.method,
      url: item.url
    }
    if (item.body) {
      request.body = item.body
      if (item.headers) {
        request.headers = item.headers
      } else {
        request.headers = {
          'Content-Type': 'application/json'
        }
      }
    }
    if (item.referenceId) {
      request.referenceId = item.referenceId
    }
    currentBatch.push(request)
  }
  batches.push(currentBatch)

  return BatchRequests.parse(batches)
}
