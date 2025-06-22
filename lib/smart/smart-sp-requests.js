import { GRAPH, SHAREPOINT } from '../../config.js'
import { defaultAzureCredential } from '../azure-auth.js'
import { ListInfo, pagedRequest } from '../graph.js'
import { smartItemFields } from './smart-meeting-items.js'
import axios from 'axios'

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
  const filterQuery = `(fields/${smartItemFields.documentNumber.name} eq '${smartItemFields.documentNumber.notArchivedValue}' and fields/${smartItemFields.publishItem.name} eq '${smartItemFields.publishItem.publishValue}' and fields/${smartItemFields.meetingDate.name} lt '${oneWeekAgo.toISOString()}')`

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

// WIP
export const setupSmartListUpdateItems = async (siteId, listId, documentNumber, itemIds) => {
  if (!(siteId && typeof siteId === 'string' && listId && typeof listId === 'string' && documentNumber && typeof documentNumber === 'string' && itemIds && Array.isArray(itemIds))) throw new Error('Missing required parameters siteId (string), listId (string), documentNumber (string) and itemIds (array)')
  if (itemIds.length < 1) throw new Error('itemIds must be an array with at least one item')

  const batches = createBatchRequests(itemIds.map((itemId) => ({
    method: 'PATCH',
    url: `/sites/${siteId}/lists/${listId}/items/${itemId}/fields`,
    body: {
      fields: {
        [smartItemFields.documentNumber.name]: documentNumber,
        [smartItemFields.archiveStatus.name]: 'Arkivert - dagens dato ellerno',
        [smartItemFields.reArchive.name]: smartItemFields.reArchive.fallback
      }
    }
  })))

  return batches
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
    throw new Error(`Failed to get attachment data from SharePoint for URI: ${uri}`)
  }
  const base64 = Buffer.from(data).toString('base64')
  return base64
}

/**
 *
 * @param {import('../graph.js').BatchRequest[]} batches
 */
const updateSmartListItems = async (batches) => {
  if (!(siteId && typeof siteId === 'string' && listId && typeof listId === 'string' && listUrl && typeof listUrl === 'string')) throw new Error('Missing required parameters siteId (string), listId (string) and listUrl (string)')
  throw new Error('not yet implemented')
}
