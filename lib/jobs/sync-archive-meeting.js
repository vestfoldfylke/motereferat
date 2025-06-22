import axios from "axios";
import { defaultAzureCredential } from "../azure-auth.js";
import { ARCHIVE } from "../../config.js";
import { logger } from "@vtfk/logger";
import { z } from "zod/v4";

export const SyncMeetingArchiveCaseResult = z.object({
  recno: z.number(),
  caseNumber: z.string(),
  caseExternalId: z.string(),
  caseCreated: z.boolean()
})

/**
 * 
 * @param {import("../smart/smart-meetings").SmartMeeting} meeting 
 */
export const syncMeetingArchiveCase = async (meeting) => {
  // Get case by externalId - create if not exists - return caseNumber, perfecto
  const meetingYear = new Date(meeting.meetingDate).getFullYear()
  if (isNaN(meetingYear)) throw new Error(`Invalid meetingDate in meeting ${meeting.meetingId}: ${meeting.meetingDate}. Must be a valid date string.`)
  const caseExternalId = `${meeting.meetingConfig.ARCHIVE.CASE_EXTERNAL_ID_PREFIX}-${meetingYear}`
  const searchBody = {
    service: 'CaseService',
    method: 'GetCases',
    parameter: {
      ExternalId: {
        Id: caseExternalId,
        Type: ARCHIVE.CASE_EXTERNAL_ID_TYPE
      }
    }
  }
  logger('info', [`Searching for case with externalId ${caseExternalId}`])
  const { token } = await defaultAzureCredential.getToken(ARCHIVE.API_SCOPE)
  const searchResponse = await axios.post(`${ARCHIVE.API_URL}/archive`, searchBody, { headers: { Authorization: `Bearer ${token}` } })
  const foundCases = searchResponse.data
  if (!Array.isArray(foundCases)) throw new Error(`Expected an array of cases, but got: ${JSON.stringify(foundCases)}`)
  const openCases = foundCases.filter(c => ['Under behandling', 'Reservert'].includes(c.Status))
  if (openCases.length > 0) {
    if (openCases.length > 1) {
      logger('warn', [`Found multiple open cases with externalId ${caseExternalId}, should probs not happen, but just using the first one. Found cases: ${openCases.map(c => c.CaseNumber).join(', ')}`])
    }
    const existingCase = openCases[0]
    logger('info', [`Found existing case with externalId ${caseExternalId}: CaseNumber: ${existingCase.CaseNumber}, Recno: ${existingCase.Recno}`])
    return SyncMeetingArchiveCaseResult.parse({
      recno: existingCase.Recno,
      caseNumber: existingCase.CaseNumber,
      caseExternalId,
      caseCreated: false
    })
  }
  logger('info', [`No open cases found with externalId ${caseExternalId}, creating a new case`])
  const createBody = {
    service: 'CaseService',
    method: 'CreateCase',
    parameter: {
      CaseType: 'Sak',
      Title: `Møtereferater - ${meeting.meetingConfig.MEETING_ARENA} - ${meetingYear}`,
      Status: 'B',
      ExternalId: {
        Id: caseExternalId,
        Type: ARCHIVE.CASE_EXTERNAL_ID_TYPE
      },
      ArchiveCodes: [
        {
          ArchiveCode: '035',
          ArchiveType: 'FELLESKLASSE PRINSIPP',
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
  logger('info', [`Created new case with externalId ${caseExternalId}: CaseNumber: ${createdCase.CaseNumber}, Recno: ${createdCase.Recno}`])
  return SyncMeetingArchiveCaseResult.parse({
    recno: createdCase.Recno,
    caseNumber: createdCase.CaseNumber,
    caseExternalId,
    caseCreated: true
  })
}
