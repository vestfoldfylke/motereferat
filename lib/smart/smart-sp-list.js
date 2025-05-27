import { GRAPH } from '../../config.js'
import { defaultAzureCredential } from '../azure-auth.js'
import axios from 'axios'

const itemFields = {
  title: {
    name: 'Title',
    required: false,
    fallback: 'Tittel mangler'
  },
  description: {
    name: 'smart_BeskrivelseAvSak',
    required: false,
    fallback: 'Beskrivelse mangler'
  },
  caseStatus: {
    name: 'smart_Status',
    required: true
  },
  sorting: {
    name: 'smart_Sortering',
    required: false,
    fallback: 100
  },
  caseType: {
    name: 'smart_Sakstype',
    required: true
  },
  decision: {
    name: 'smart_Beslutning',
    required: false,
    fallback: 'Beslutning mangler'
  },
  publishCase: {
    name: 'smart_PublisereReferat',
    required: true
  },
  publishAttachment: {
    name: 'smart_PublisereVedlegg',
    required: true
  },
  meetingDate: {
    name: 'smart_Motedato',
    required: true
  },
  caseResponsibleName: {
    name: 'smart_AnsvarligForOppfolging',
    required: false,
    fallback: 'Ingen ansvarlig'
  },
  caseResponsibleLookupId: {
    name: 'smart_AnsvarligForOppfolgingLookupId',
    required: false,
    fallback: null
  },
  documentNumber: {
    name: 'smart_DokumentNummer',
    required: false,
    fallback: 'Ikke arkivert'
  },
  archiveStatus: {
    name: 'smart_Arkiveringsstatus',
    required: false,
    fallback: 'Ikke arkivert'
  },
  reArchive: {
    name: 'smart_ArkiverPaaNytt',
    required: false,
    fallback: 'Nei'
  },
  minutesId: {
    name: 'smart_ReferatID',
    required: false,
    fallback: null
  },
  elementVersion: {
    name: 'smart_Elementversjon',
    required: false,
    fallback: 'Ingen versjon?'
  }
}

export const getSmartItemsReadyForArchive = async (siteId, listId) => {
  if (!(siteId && typeof siteId === 'string' && listId && typeof listId === 'string')) throw new Error('Missing required parameters siteId (string) and listId (string)')

  // Ny funksjonalitet: kopiere sak fra et møte til et annet. NOTE hvorfor skrev jeg dette her?

  // Need to select all fields in order to get smart_AnsvarligForOppfolging, else will only get the lookup id
  const expand = `fields($select=${Object.values(itemFields).map(value => value.name).join(',')})`
  const select = 'id,fields'

  // We want all items that are not yet archived, more than a week old, and set to publish
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
  const filterQuery = `(fields/${itemFields.documentNumber.name} eq '${itemFields.documentNumber.fallback}' and fields/${itemFields.publishCase.name} eq 'Ja' and fields/${itemFields.meetingDate.name} lt '${oneWeekAgo.toISOString()}')`

  const { token } = await defaultAzureCredential.getToken(GRAPH.API_SCOPE)

  /** @type {import('axios').AxiosRequestHeaders} */
  const headers = {
    Authorization: `Bearer ${token}`,
    Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' // Oh god, we need this to be able to filter on fields that are not indexed (e.g. all fields in fields on regular lists made by humans...)
  }

  const graphResponse = await axios.get(`${GRAPH.API_URL}/sites/${siteId}/lists/${listId}/items?expand=${expand}&$filter=${filterQuery}&$select=${select}`, { headers })

  /** @type {{ id: string, fields: Object }[]} */
  const readyListItems = graphResponse.data.value
  // writeFileSync('./ignore/readyListItems.json', JSON.stringify(readyListItems.data, null, 2))
  const meetingCases = readyListItems.map((item) => {
    const { fields } = item
    for (const field of Object.values(itemFields).filter(item => item.required).map(item => item.name)) {
      if (!fields[field]) {
        throw new Error(`Field ${field} is required on list-item, but missing from item ${item.id}`)
      }
    }
    return {
      id: item.id,
      title: fields[itemFields.title.name] || itemFields.title.fallback,
      description: fields[itemFields.description.name] || itemFields.description.fallback,
      caseStatus: fields[itemFields.caseStatus.name],
      sorting: fields[itemFields.sorting.name] || itemFields.sorting.fallback,
      caseType: fields[itemFields.caseType.name],
      decision: fields[itemFields.decision.name] || itemFields.decision.fallback,
      publishCase: fields[itemFields.publishCase.name],
      publishAttachment: fields[itemFields.publishAttachment.name],
      meetingDate: fields[itemFields.meetingDate.name],
      caseResponsibleName: fields[itemFields.caseResponsibleName.name] || itemFields.caseResponsibleName.fallback,
      caseResponsibleLookupId: fields[itemFields.caseResponsibleLookupId.name] || itemFields.caseResponsibleLookupId.fallback,
      documentNumber: fields[itemFields.documentNumber.name] || itemFields.documentNumber.fallback,
      archiveStatus: fields[itemFields.archiveStatus.name] || itemFields.archiveStatus.fallback,
      reArchive: fields[itemFields.reArchive.name] || itemFields.reArchive.fallback,
      minutesId: fields[itemFields.minutesId.name] || itemFields.minutesId.fallback,
      elementVersion: fields[itemFields.elementVersion.name] || itemFields.elementVersion.fallback
    }
  })
  return meetingCases
}

export const setupSmartListUpdateItems = async (siteId, listId, documentNumber, itemIds) => {
  if (!(siteId && typeof siteId === 'string' && listId && typeof listId === 'string' && documentNumber && typeof documentNumber === 'string' && itemIds && Array.isArray(itemIds))) throw new Error('Missing required parameters siteId (string), listId (string), documentNumber (string) and itemIds (array)')
  if (itemIds.length < 1) throw new Error('itemIds must be an array with at least one item')

  const batches = createBatchRequests(itemIds.map((itemId) => ({
    method: 'PATCH',
    url: `/sites/${siteId}/lists/${listId}/items/${itemId}/fields`,
    body: {
      fields: {
        [itemFields.documentNumber.name]: documentNumber,
        [itemFields.archiveStatus.name]: itemFields.archiveStatus.fallback,
        [itemFields.reArchive.name]: itemFields.reArchive.fallback
      }
    }
  })))

  return batches
}

/**
 *
 * @param {import('../graph.js').BatchRequest[]} batches
 */
const updateSmartListItems = async (batches) => {
  if (!(siteId && typeof siteId === 'string' && listId && typeof listId === 'string' && listUrl && typeof listUrl === 'string')) throw new Error('Missing required parameters siteId (string), listId (string) and listUrl (string)')
  throw new Error('not yet implemented')
}
