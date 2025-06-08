import { convert } from "html-to-text"
import { stupidCharsRegex } from "../helpers/invisible-chars-regex.js"

export const smartItemFields = {
  title: {
    name: 'Title',
    required: false,
    fallback: 'Tittel mangler'
  },
  description: {
    name: 'smart_BeskrivelseAvSak',
    required: false,
    fallback: 'Beskrivelse mangler',
    hasHtml: true,
  },
  itemStatus: {
    name: 'smart_Status',
    required: true
  },
  sorting: {
    name: 'smart_Sortering',
    required: false,
    fallback: 100
  },
  itemType: {
    name: 'smart_Sakstype',
    required: true
  },
  decision: {
    name: 'smart_Beslutning',
    required: false,
    fallback: 'Beslutning mangler',
    hasHtml: true
  },
  publishItem: {
    name: 'smart_PublisereReferat',
    required: true,
    publishValue: 'Ja',
  },
  publishAttachment: {
    name: 'smart_PublisereVedlegg',
    required: true
  },
  meetingDate: {
    name: 'smart_Motedato',
    required: true
  },
  itemResponsibleName: {
    name: 'smart_AnsvarligForOppfolging',
    required: false,
    fallback: 'Ingen ansvarlig'
  },
  itemResponsibleLookupId: {
    name: 'smart_AnsvarligForOppfolgingLookupId',
    required: false,
    fallback: null
  },
  documentNumber: {
    name: 'smart_DokumentNummer',
    required: false,
    fallback: 'Ikke arkivert',
    notArchivedValue: 'Ikke arkivert'
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
  },
  hasAttachments: {
    name: 'Attachments',
    required: true
  }
}

/**
 * @typedef {Object} SmartMeetingItem
 * @property {string} id - The unique identifier for the meeting item.
 * @property {string} title - The title of the meeting item.
 * @property {string} description - The description of the meeting item.
 * @property {string} descriptionText - The plain text version of the description, converted from HTML.
 * @property {string} itemStatus - The status of the item.
 * @property {number} sorting - The sorting order of the item.
 * @property {string} itemType - The type of the item.
 * @property {string} decision - The decision made on the item.
 * @property {string} decisionText - The plain text version of the decision, converted from HTML.
 * @property {'Ja'|'Nei'} publishItem - Indicates if the item should be published.
 * @property {'Ja'|'Nei'} publishAttachment - Indicates if the attachment should be published.
 * @property {string} meetingDate - The date of the meeting in ISO format.
 * @property {string} itemResponsibleName - The name of the person responsible for following up the item.
 * @property {string|null} itemResponsibleLookupId - The lookup ID of the person responsible for following up the item.
 * @property {string} documentNumber - The document number associated with the item.
 * @property {string} archiveStatus - The archiving status of the item.
 * @property {'Ja'|'Nei'} reArchive - Indicates if the item should be re-archived.
 * @property {string|null} minutesId - The ID of the meeting minutes.
 * @property {string} elementVersion - The version of the element. 
 */

/**
 * 
 * @param {Object[]} listItems 
 * @returns {SmartMeetingItem[]}
 */
export const repackSmartListItems = (listItems) => {
  if (!Array.isArray(listItems)) throw new Error('listItems must be an array')
  
  const meetingItems = listItems.map((item) => {
    const { fields } = item
    if (!fields || typeof fields !== 'object') {
      throw new Error(`Item ${item.id} does not have valid fields`)
    }
    for (const field of Object.values(smartItemFields).filter(item => item.required).map(item => item.name)) {
      if (!fields[field]) {
        throw new Error(`Field ${field} is required on list-item, but missing from item ${item.id}`)
      }
    }
    const result = {
      id: item.id,
    }
    for (const [key, value] of Object.entries(smartItemFields)) {
      if (value.required && !fields[value.name]) {
        throw new Error(`Field ${value.name} is required but missing in item ${item.id}`)
      }
      result[key] = fields[value.name] ?? value.fallback
      if (value.hasHtml && typeof result[key] === 'string') {
        // Convert HTML to plain text
        const prettyText = convert(result[key]).replace(stupidCharsRegex, ' ')
        result[`${key}Text`] = prettyText
      }
    }
    return result
  })
  return meetingItems
}
