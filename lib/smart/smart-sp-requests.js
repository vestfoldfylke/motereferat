import { logger } from '@vtfk/logger'
import { GRAPH, SHAREPOINT } from '../../config.js'
import { defaultAzureCredential } from '../azure-auth.js'
import { createBatchRequests, ListInfo, pagedRequest } from '../graph.js'
import { smartItemFields } from './smart-meeting-items.js'
import axios from 'axios'
import { z } from 'zod/v4'
// import { writeFileSync } from 'fs'

/**
 *
 * @param {import('../graph.js').ListInfo} listInfo
 */
export const getSmartItemsReadyForArchive = async (listInfo) => {
  ListInfo.parse(listInfo) // Validate that listInfo is a valid ListInfo object, let garbage-collector clean up the return value

  // Need to select all fields in order to get smart_AnsvarligForOppfolging, else will only get the lookup id
  const expand = `fields($select=${Object.values(smartItemFields).map(value => value.name).join(',')})`
  const select = 'id,fields'

  // We want all items that are not yet archived, more than a week old, and set to publish
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
  const filterQuery = `((fields/${smartItemFields.documentNumber.name} eq '${smartItemFields.documentNumber.notArchivedValue}' or fields/${smartItemFields.reArchive.name} eq '${smartItemFields.publishItem.publishValue}') and fields/${smartItemFields.publishItem.name} eq '${smartItemFields.publishItem.publishValue}' and fields/${smartItemFields.meetingDate.name} lt '${oneWeekAgo.toISOString()}')`

  /** @type {import('axios').AxiosRequestHeaders} */
  const headers = {
    Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' // Oh god, we need this to be able to filter on fields that are not indexed (e.g. all fields in fields on regular lists made by humans...)
  }
  const listItemsUrl = `${GRAPH.API_URL}/sites/${listInfo.siteId}/lists/${listInfo.listId}/items?expand=${expand}&$filter=${filterQuery}&$select=${select}`
  const listItemsResponse = await pagedRequest(listItemsUrl, { headers })

  if (!listItemsResponse || !Array.isArray(listItemsResponse.value)) {
    throw new Error(`Failed to get items from list ${listInfo.listId} on site ${listInfo.siteId}. Response: ${JSON.stringify(listItemsResponse)}`)
  }
  return listItemsResponse
}

/**
 *
 * @param {import('../graph.js').ListInfo} listInfo
 * @param {*} itemId
 */
export const getListItemAttachments = async (listInfo, itemId) => {
  ListInfo.parse(listInfo) // Validate that listInfo is a valid ListInfo object, let garbage-collector clean up the return value
  if (!itemId || isNaN(Number(itemId))) throw new Error('itemId must be a numerical value')
  const { token } = await defaultAzureCredential.getToken(SHAREPOINT.REST_API_SCOPE)
  const url = `https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/${listInfo.siteName}/_api/web/lists(guid'${listInfo.listId}')/items(${itemId})/AttachmentFiles`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json;odata=verbose'
  }
  const { data } = await axios.get(url, { headers })
  return data
}

/**
 *
 * @param {string} attachmentUri uri from __metadata.uri in getListItemAttachments
 */
export const getListItemAttachmentData = async (attachmentUri) => {
  if (!attachmentUri || typeof attachmentUri !== 'string') throw new Error('attachmentUri must be a valid string')
  if (!attachmentUri.toLowerCase().startsWith(`https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/`.toLowerCase()) || !attachmentUri.toLowerCase().includes('/_api/web/lists(guid') || !attachmentUri.toLowerCase().endsWith('/$value'.toLowerCase())) {
    throw new Error(`attachmentUri must be a valid SharePoint REST API attachment URL on the format: https://{tenantName}.sharepoint.com/sites/{siteName}/_api/Web/Lists(guid'{listGuid}')/Items({itemId})/AttachmentFiles('{fileName})/$value' but got: ${attachmentUri}`)
  }
  const { token } = await defaultAzureCredential.getToken(SHAREPOINT.REST_API_SCOPE)
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json;odata=verbose'
  }
  const { data } = await axios.get(attachmentUri, { headers, responseType: 'arraybuffer' })
  if (!data || !(data instanceof Buffer)) {
    throw new Error(`Failed to get attachment data from SharePoint for URI: ${attachmentUri}`)
  }
  const base64 = Buffer.from(data).toString('base64')
  return base64
}

/** @typedef {z.infer<typeof FinishedItems>} FinishedItems */
export const FinishedItems = z.array(z.object({
  itemId: z.string(),
  requestId: z.string(),
  status: z.number(),
  data: z.any().nullable().default(null)
}))

/**
 *
 * @param {ListInfo} listInfo
 * @param {string[]} itemIds
 * @param {*} fields
 * @returns {Promise<{ finishedItems: FinishedItems, failedItems: any[], batchRequests: BatchRequests }>}
 */
export const updateSmartListItems = async (listInfo, itemIds, fields) => {
  // Validate inputs
  ListInfo.parse(listInfo)
  if (!Array.isArray(itemIds) || itemIds.length < 1) throw new Error('itemIds must be a non-empty array of item IDs')
  if (!fields || typeof fields !== 'object') throw new Error('fields must be a valid object with field names and values')
  if (Object.keys(fields).length < 1) throw new Error('fields must contain at least one field to update')
  const batchRequests = createBatchRequests(itemIds.map((itemId) => ({
    referenceId: itemId,
    method: 'PATCH',
    url: `/sites/${listInfo.siteId}/lists/${listInfo.listId}/items/${itemId}/fields`,
    body: fields
  })))

  const finishedItems = []
  const failedItems = []
  const { token } = await defaultAzureCredential.getToken(GRAPH.API_SCOPE)
  for (const requests of batchRequests) {
    let responses
    try {
      const { data } = await axios.post(`${GRAPH.API_URL}/$batch`, { requests }, { headers: { Authorization: `Bearer ${token}` } })
      if (!data || !data.responses || !Array.isArray(data.responses)) {
        throw new Error('Batch request failed did not return valid responses, but gave 200??')
      }
      responses = data.responses
      // writeFileSync(`./ignore/batch-responses.${new Date().getTime()}.json`, JSON.stringify(data, null, 2)) // For debugging purposes
    } catch (error) {
      logger('error', ['Batch request failed - will have to retry', error.response?.data || error.stack || error.message])
      continue // Skip this batch, we will retry later
    }
    for (const response of responses) {
      const currentRequest = requests.find(req => req.id === response.id)
      if (!currentRequest) {
        logger('error', ['Batch request response did not match any of our request ids - what?', 'responseId', response.id])
        continue // Skip this response, we cannot process it without a valid request id
      }
      const itemId = currentRequest.referenceId
      if (!itemId) {
        logger('error', ['Batch request response did not match itemId for any request - what?', 'responseId', response.id])
        continue // Skip this response, we cannot process it without a valid itemId - will be retried later, but probably not work anyway so someone should do something
      }
      if (response.status >= 200 && response.status < 300) {
        finishedItems.push({
          requestId: response.id,
          itemId,
          status: response.status,
          data: response.body || null
        })
      } else {
        failedItems.push({
          itemId,
          ...response
        })
        logger('error', [`Batch request failed for requestId ${response.id}`, `itemId: ${itemId}`, `with status ${response.status}`, `code: ${response.body?.error?.code}`, `message: ${response.body?.error?.message}`, 'Must be retried'])
      }
    }
  }
  return {
    finishedItems: FinishedItems.parse(finishedItems),
    failedItems,
    batchRequests
  }
}

export const runBatchRequests = async (batches) => {
  if (!Array.isArray(batches) || batches.length < 1) throw new Error('batches must be a non-empty array of BatchRequest objects')

  const { token } = await defaultAzureCredential.getToken(SHAREPOINT.REST_API_SCOPE)
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json;odata=verbose',
    'Content-Type': 'application/json'
  }

  const url = `${GRAPH.API_URL}/$batch`
  const response = await axios.post(url, { requests: batches }, { headers })

  if (!response.data || !response.data.responses || !Array.isArray(response.data.responses)) {
    throw new Error(`Failed to run batch requests. Response: ${JSON.stringify(response.data)}`)
  }

  return response.data.responses
}
