import axios from 'axios'
import { defaultAzureCredential } from '../azure-auth.js'
import { ARCHIVE } from '../../config.js'
import { logger } from '@vtfk/logger'
import { z } from 'zod/v4'

export const SyncMeetingArchiveCaseResult = z.object({
  recno: z.number(),
  caseNumber: z.string(),
  searchInfo: z.string(),
  caseCreated: z.boolean()
})

/**
 *
 * @param {import("../smart/smart-meetings").SmartMeeting} meeting
 */
export const syncMeetingArchiveCase = async (meeting) => {
  if (meeting.meetingConfig.DEMO_MODE) {
    logger('info', ['Running in DEMO_MODE - no changes will be made, mocking response'])
    return SyncMeetingArchiveCaseResult.parse({
      recno: 123,
      caseNumber: 'DEMO-CASE-123',
      searchInfo: 'DEMO_SEARCH_INFO',
      caseCreated: true
    })
  }
  // Get case by externalId - create if not exists - return caseNumber, perfecto
  const meetingYear = new Date(meeting.meetingDate).getFullYear()
  if (isNaN(meetingYear)) throw new Error(`Invalid meetingDate in meeting ${meeting.meetingId}: ${meeting.meetingDate}. Must be a valid date string.`)

  const customGetCaseTitle = meeting.meetingConfig.ARCHIVE.GET_CASE_TITLE
  if (customGetCaseTitle && typeof customGetCaseTitle !== 'function') {
    throw new Error(`ARCHIVE.GET_CASE_TITLE must be a function, got ${typeof customGetCaseTitle} instead. Please check the configuration.`)
  }
  const caseTitle = customGetCaseTitle ? customGetCaseTitle(meeting) : `Møtereferater - ${meeting.meetingConfig.MEETING_ARENA} - ${meetingYear}`
  if (typeof caseTitle !== 'string' || caseTitle.length < 5) {
    throw new Error(`Invalid case title generated: "${caseTitle}". It must be a string with at least 5 characters. Please check the meeting-configs function ARCHIVE.GET_CASE_TITLE`)
  }

  const ARCHIVE_CONSTANTS = {
    CASE_TYPE: 'Sak',
    ARCHIVE_CODE: {
      CODE: '035',
      TYPE: 'FELLESKLASSE PRINSIPP'
    }
  }

  const searchBody = {
    service: 'CaseService',
    method: 'GetCases',
    parameter: {
      Title: caseTitle,
      CaseType: ARCHIVE_CONSTANTS.CASE_TYPE,
      ArchiveCode: ARCHIVE_CONSTANTS.ARCHIVE_CODE.CODE,
      IncludeDocuments: false
    }
  }

  const searchInfo = `title: ${caseTitle}, caseType: ${ARCHIVE_CONSTANTS.CASE_TYPE}, archiveCode: ${ARCHIVE_CONSTANTS.ARCHIVE_CODE.CODE}`
  logger('info', [`Searching for case with ${searchInfo}`])
  const { token } = await defaultAzureCredential.getToken(ARCHIVE.API_SCOPE)
  const searchResponse = await axios.post(`${ARCHIVE.API_URL}/archive`, searchBody, { headers: { Authorization: `Bearer ${token}` } })
  const foundCases = searchResponse.data
  if (!Array.isArray(foundCases)) throw new Error(`Expected an array of cases, but got: ${JSON.stringify(foundCases)}`)
  const openCases = foundCases.filter(c => ['Under behandling', 'Reservert'].includes(c.Status))

  if (openCases.length > 0) {
    if (openCases.length > 1) {
      logger('warn', [`Found multiple open cases with ${searchInfo}, but just using the first one. Found cases: ${openCases.map(c => c.CaseNumber).join(', ')}`])
    }
    const existingCase = openCases[0]
    logger('info', [`Found existing case with ${searchInfo}: CaseNumber: ${existingCase.CaseNumber}, Recno: ${existingCase.Recno}`])
    return SyncMeetingArchiveCaseResult.parse({
      recno: existingCase.Recno,
      caseNumber: existingCase.CaseNumber,
      searchInfo,
      caseCreated: false
    })
  }
  logger('info', [`No open cases found with ${searchInfo}, creating a new case`])
  const createBody = {
    service: 'CaseService',
    method: 'CreateCase',
    parameter: {
      AccessCode: meeting.meetingConfig.ARCHIVE.CASE_ACCESS_CODE || ARCHIVE.CASE_DEFAULT_VALUES.ACCESS_CODE,
      AccessGroup: meeting.meetingConfig.ARCHIVE.CASE_ACCESS_GROUP || ARCHIVE.CASE_DEFAULT_VALUES.ACCESS_GROUP,
      Paragraph: meeting.meetingConfig.ARCHIVE.CASE_PARAGRAPH || ARCHIVE.CASE_DEFAULT_VALUES.PARAGRAPH,
      CaseType: 'Sak',
      Title: caseTitle,
      Status: 'B',
      ArchiveCodes: [
        {
          ArchiveCode: ARCHIVE_CONSTANTS.ARCHIVE_CODE.CODE,
          ArchiveType: ARCHIVE_CONSTANTS.ARCHIVE_CODE.TYPE,
          Sort: 1
        }
      ]
    }
  }
  if (meeting.meetingConfig.ARCHIVE.RESPONSIBLE_PERSON_EMAIL) {
    createBody.parameter.ResponsiblePersonEmail = meeting.meetingConfig.ARCHIVE.RESPONSIBLE_PERSON_EMAIL
  } else if (meeting.meetingConfig.ARCHIVE.RESPONSIBLE_ENTERPRISE_RECNO) {
    createBody.parameter.ResponsibleEnterpriseRecno = meeting.meetingConfig.ARCHIVE.RESPONSIBLE_ENTERPRISE_RECNO
  } else {
    throw new Error(`Either RESPONSIBLE_ENTERPRISE_RECNO or RESPONSIBLE_PERSON_EMAIL must be provided in the ARCHIVE configuration for ${meeting.meetingConfig.MEETING_ARENA}.`)
  }
  const createResponse = await axios.post(`${ARCHIVE.API_URL}/archive`, createBody, { headers: { Authorization: `Bearer ${token}` } })
  const createdCase = createResponse.data
  if (!createdCase || !createdCase.Recno || !createdCase.CaseNumber) {
    throw new Error(`CreateCase did not return Recno or / and CaseNumber, something is wrong... Response: ${JSON.stringify(createResponse.data)}`)
  }
  logger('info', [`Created new case with ${searchInfo}: CaseNumber: ${createdCase.CaseNumber}, Recno: ${createdCase.Recno}`])
  return SyncMeetingArchiveCaseResult.parse({
    recno: createdCase.Recno,
    caseNumber: createdCase.CaseNumber,
    searchInfo,
    caseCreated: true
  })
}
