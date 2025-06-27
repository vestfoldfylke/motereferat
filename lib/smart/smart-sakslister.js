import { z } from 'zod/v4'
import { SHAREPOINT } from '../config.js'
import { SMART_SAKSLISTER_CONFIG } from '../../motereferat-config/sakslister.js'

/** @typedef {z.infer<typeof MeetingConfig>} MeetingConfig */
export const MeetingConfig = z.object({
  MEETING_ARENA: z.string(),
  LIST_URL: z.url(),
  ARCHIVE: z.object({
    RESPONSIBLE_ENTERPRISE_RECNO: z.number().nullable().default(null),
    RESPONSIBLE_PERSON_EMAIL: z.email().nullable().default(null),
    DOCUMENT_ACCESS_GROUP: z.string(),
    CASE_ACCESS_CODE: z.string().optional(),
    CASE_ACCESS_GROUP: z.string().optional(),
    CASE_PARAGRAPH: z.string().optional(),
    DOCUMENT_ACCESS_CODE: z.string().optional(),
    DOCUMENT_PARAGRAPH: z.string().optional(),
    GET_CASE_TITLE: z.any().optional(), // Function to get case title, can be a string or a function (zod v4 does not support function validation directly in object, yet?)
    GET_DOCUMENT_TITLE: z.any().optional() // Function to get document title, can be a string or a function
  }),
  PDF: z.object({
    SECTOR: z.string()
  })
})

/** @type {MeetingConfig[]} */
export const SMART_SAKSLISTER = SMART_SAKSLISTER_CONFIG.map(config => {
  const meetingConfig = MeetingConfig.parse(config)
  if (meetingConfig.ARCHIVE.RESPONSIBLE_ENTERPRISE_RECNO === null && meetingConfig.ARCHIVE.RESPONSIBLE_PERSON_EMAIL === null) {
    throw new Error(`Error in configuration for ${meetingConfig.MEETING_ARENA}: Either RESPONSIBLE_ENTERPRISE_RECNO or RESPONSIBLE_PERSON_EMAIL must be provided in the ARCHIVE configuration.`)
  }
  if (!meetingConfig.LIST_URL.startsWith(`https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/`)) {
    throw new Error(`Invalid LIST_URL for ${meetingConfig.MEETING_ARENA}: Must start with https://${SHAREPOINT.TENANT_NAME}.sharepoint.com/sites/`)
  }
  // Check that all LIST_URL values are unique
  if (SMART_SAKSLISTER_CONFIG.filter(m => m.LIST_URL === meetingConfig.LIST_URL).length > 1) {
    throw new Error(`Duplicate LIST_URL found: ${meetingConfig.LIST_URL}. Each arena must have a unique LIST_URL.`)
  }
  // Check that all MEETING_ARENA values are unique
  if (SMART_SAKSLISTER_CONFIG.filter(m => m.MEETING_ARENA === meetingConfig.MEETING_ARENA).length > 1) {
    throw new Error(`Duplicate MEETING_ARENA found: ${meetingConfig.MEETING_ARENA}. Each arena must have a unique MEETING_ARENA.`)
  }
  if (meetingConfig.ARCHIVE.GET_CASE_TITLE && typeof meetingConfig.ARCHIVE.GET_CASE_TITLE !== 'function') {
    throw new Error(`ARCHIVE.GET_CASE_TITLE must be a function for ${meetingConfig.MEETING_ARENA}.`)
  }
  if (meetingConfig.ARCHIVE.GET_DOCUMENT_TITLE && typeof meetingConfig.ARCHIVE.GET_DOCUMENT_TITLE !== 'function') {
    throw new Error(`ARCHIVE.GET_DOCUMENT_TITLE must be a function for ${meetingConfig.MEETING_ARENA}.`)
  }
  return meetingConfig
})
