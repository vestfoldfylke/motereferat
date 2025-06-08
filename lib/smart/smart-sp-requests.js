import { GRAPH, SHAREPOINT } from '../../config.js'
import { defaultAzureCredential } from '../azure-auth.js'
import { pagedRequest } from '../graph.js'
import { smartItemFields } from './smart-meeting-items.js'
import axios from 'axios'

/**
 * 
 * @param {import('../graph.js').ListInfo} listInfo
 */
export const getSmartItemsReadyForArchive = async (listInfo) => {
  if (!(listInfo && typeof listInfo === 'object' && listInfo.siteId && typeof listInfo.siteId === 'string' && listInfo.listId && typeof listInfo.listId === 'string')) throw new Error('Missing required parameters listInfo.siteId (string) and listInfo.listId (string)')
  // Ny funksjonalitet: kopiere sak fra et møte til et annet. NOTE hvorfor skrev jeg dette her?

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

export const setupSmartListUpdateItems = async (siteId, listId, documentNumber, itemIds) => {
  if (!(siteId && typeof siteId === 'string' && listId && typeof listId === 'string' && documentNumber && typeof documentNumber === 'string' && itemIds && Array.isArray(itemIds))) throw new Error('Missing required parameters siteId (string), listId (string), documentNumber (string) and itemIds (array)')
  if (itemIds.length < 1) throw new Error('itemIds must be an array with at least one item')

  const batches = createBatchRequests(itemIds.map((itemId) => ({
    method: 'PATCH',
    url: `/sites/${siteId}/lists/${listId}/items/${itemId}/fields`,
    body: {
      fields: {
        [smartItemFields.documentNumber.name]: documentNumber,
        [smartItemFields.archiveStatus.name]: smartItemFields.archiveStatus.fallback,
        [smartItemFields.reArchive.name]: smartItemFields.reArchive.fallback
      }
    }
  })))

  return batches
}

// https://${sharepointCredentials.tenantName}.sharepoint.com/sites/${fileUpload.siteName}/_api/web/lists/getbytitle('ListTitle')/items(1)/AttachmentFiles
export const getListItemAttachmments = async (listInfo, itemId) => {
  // if (!(listInfo && typeof listInfo === 'object' && listInfo.siteId && typeof listInfo.siteId === 'string' && listInfo.listId && typeof listInfo.listId === 'string')) throw new Error('Missing required parameters listInfo.siteId (string) and listInfo.listId (string)')
  const { token } = await defaultAzureCredential.getToken(SHAREPOINT.REST_API_SCOPE)
  // https://${options.tenantName}.sharepoint.com/.default
  const url2 = `https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/ORG-SMARTMtereferat/_api/web/lists(guid'1b8300f7-3de1-4c5c-86be-4ef80364a5f4')/items(35)/AttachmentFiles('Kvittering_LSN-OKP-YE9.pdf')/$value`
  const url = `https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/ORG-SMARTMtereferat/_api/web/lists(guid'1b8300f7-3de1-4c5c-86be-4ef80364a5f4')/items(35)/AttachmentFiles`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json;odata=verbose'
  }
  const { data: nope } = await axios.get(url2, { headers, responseType: 'arraybuffer' })
  const base64 = Buffer.from(nope).toString('base64')
  const { data } = await axios.get(url, { headers })
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
