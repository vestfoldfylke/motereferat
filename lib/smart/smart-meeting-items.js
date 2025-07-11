import { convert } from 'html-to-text'
import { stupidCharsRegex } from '../helpers/invisible-chars-regex.js'
import { z } from 'zod/v4'

export const smartItemFields = {
  title: {
    name: 'Title',
    required: false
  },
  description: {
    name: 'smart_BeskrivelseAvSak',
    required: false,
    hasHtml: true
  },
  itemStatus: {
    name: 'smart_Status',
    required: true
  },
  sorting: {
    name: 'smart_Sortering',
    required: false
  },
  itemType: {
    name: 'smart_Sakstype',
    required: true
  },
  decision: {
    name: 'smart_Beslutning',
    required: false,
    hasHtml: true
  },
  publishItem: {
    name: 'smart_PublisereReferat',
    required: true,
    publishValue: 'Ja'
  },
  publishAttachments: {
    name: 'smart_PublisereVedlegg',
    required: true
  },
  meetingDate: {
    name: 'smart_Motedato',
    required: true
  },
  itemResponsibleName: {
    name: 'smart_AnsvarligForOppfolging',
    required: false
  },
  itemResponsibleLookupId: {
    name: 'smart_AnsvarligForOppfolgingLookupId',
    required: false
  },
  documentNumber: {
    name: 'smart_DokumentNummer',
    required: false,
    notArchivedValue: 'Ikke arkivert'
  },
  archiveStatus: {
    name: 'smart_Arkiveringsstatus',
    required: false
  },
  reArchive: {
    name: 'smart_ArkiverPaaNytt',
    required: false
  },
  minutesId: {
    name: 'smart_ReferatID',
    required: false,
    fallback: null
  },
  elementVersion: {
    name: 'smart_Elementversjon',
    required: false
  },
  hasAttachments: {
    name: 'Attachments',
    required: true
  }
}

/** @typedef {z.infer<typeof SmartMeetingItem>} SmartMeetingItem */
export const SmartMeetingItem = z.object({
  id: z.string(),
  title: z.string().default('Tittel mangler'),
  description: z.string().default('Beskrivelse mangler'),
  descriptionText: z.string().nullable().default(null),
  itemStatus: z.enum(['Oppmeldt', 'Avsluttet', 'Utsatt til neste møte']),
  sorting: z.number().default(100),
  itemType: z.enum(['Beslutning', 'Diskusjon', 'Informasjon']),
  decision: z.string().default('Beslutning mangler'),
  decisionText: z.string().nullable().default(null),
  publishItem: z.enum(['Ja', 'Nei']),
  publishAttachments: z.enum(['Ja', 'Nei']),
  meetingDate: z.iso.datetime(),
  itemResponsibleName: z.string().default('Ingen ansvarlig'),
  itemResponsibleLookupId: z.string().nullable().default(null),
  documentNumber: z.string().default('Ikke arkivert'),
  archiveStatus: z.string().default('Ikke arkivert'),
  reArchive: z.enum(['Ja', 'Nei']).default('Nei'),
  minutesId: z.number().default(0),
  elementVersion: z.number().default(0),
  hasAttachments: z.boolean()
})

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
      if (fields[field] === undefined || fields[field] === null) {
        throw new Error(`Field ${field} is required on list-item, but missing from item ${item.id}`)
      }
    }
    const result = {
      id: item.id
    }
    for (const [key, value] of Object.entries(smartItemFields)) {
      if (value.required && (fields[value.name] === undefined || fields[value.name] === null)) {
        throw new Error(`Field ${value.name} is required but missing in item ${item.id}`)
      }
      result[key] = fields[value.name]
      if (value.hasHtml && typeof result[key] === 'string') {
        // Convert HTML to plain text
        const prettyText = convert(result[key]).replace(stupidCharsRegex, ' ')
        result[`${key}Text`] = prettyText
      }
    }
    return SmartMeetingItem.parse(result)
  })
  return meetingItems
}
