import axios from 'axios'
import { defaultAzureCredential } from '../azure-auth.js'
import { ARCHIVE } from '../../config.js'
import { logger } from '@vtfk/logger'
import { z } from 'zod/v4'
import { createSimpleCache } from '../simple-cache.js'

export const ArchiveMeetingResult = z.object({
  recno: z.number(),
  documentNumber: z.string(),
  searchTitle: z.string(),
  isEtterarkivering: z.boolean()
})

/**
 *
 * @param {import("../smart/smart-meetings").SmartMeeting} meeting
 */
export const archiveMeeting = async (meeting) => {
  logger('info', ['Checking if meeting has been archived before'])
  // Check if meeting has already been archived - if so, this must be marked as "etterarkivering"
  if (isNaN(new Date(meeting.meetingDate))) throw new Error('Invalid meetingDate in meeting. Must be a valid date string.')

  const customGetDocumentTitle = meeting.meetingConfig.ARCHIVE.GET_DOCUMENT_TITLE
  if (customGetDocumentTitle && typeof customGetDocumentTitle !== 'function') {
    throw new Error(`ARCHIVE.GET_DOCUMENT_TITLE must be a function, got ${typeof customGetDocumentTitle} instead. Please check the configuration.`)
  }

  const prettyMeetingDate = new Date(meeting.meetingDate).toLocaleDateString('nb-NO', { year: 'numeric', month: '2-digit', day: '2-digit' })

  const documentTitle = customGetDocumentTitle ? customGetDocumentTitle(meeting) : `Møtereferat - ${meeting.meetingConfig.MEETING_ARENA} - ${prettyMeetingDate}`
  if (typeof documentTitle !== 'string' || documentTitle.length < 5) {
    throw new Error(`Invalid document title generated: "${documentTitle}". It must be a string with at least 5 characters. Please check the meeting-configs function ARCHIVE.GET_DOCUMENT_TITLE`)
  }

  const { token } = await defaultAzureCredential.getToken(ARCHIVE.API_SCOPE)

  let isEtterarkivering = false
  if (!meeting.archiveFlowStatus.jobs.syncMeetingArchiveCase.result) throw new Error('Job syncMeetingArchiveCase has not been run or did not return valid result - check flow status')
  const caseNumber = meeting.archiveFlowStatus.jobs.syncMeetingArchiveCase.result.caseNumber
  if (!meeting.archiveFlowStatus.jobs.syncMeetingArchiveCase.result.caseCreated) {
    logger('info', ['Meeting case was not created, so we check if meeting has been archived before'])
    const searchBody = {
      service: 'DocumentService',
      method: 'GetDocuments',
      parameter: {
        Title: documentTitle,
        CaseNumber: meeting.archiveFlowStatus.jobs.syncMeetingArchiveCase.result.caseNumber
      }
    }
    logger('info', [`Searching for documents with title: ${documentTitle} in case: ${caseNumber}`])
    const searchResponse = await axios.post(`${ARCHIVE.API_URL}/archive`, searchBody, { headers: { Authorization: `Bearer ${token}` } })
    const foundDocuments = searchResponse.data
    if (!Array.isArray(foundDocuments)) throw new Error(`Expected an array of documents, but got: ${JSON.stringify(foundDocuments)}`)
    const validDocuments = foundDocuments.filter(d => ['J', 'A'].includes(d.StatusCode) && d.CaseNumber === meeting.archiveFlowStatus.jobs.syncMeetingArchiveCase.result.caseNumber)
    if (validDocuments.length > 0) {
      logger('info', [`Found ${validDocuments.length} documents with title ${documentTitle} in case ${caseNumber} - setting isEtterarkivering to true`])
      isEtterarkivering = true
    } else {
      logger('info', [`No documents found with title ${documentTitle} in case ${caseNumber}, isEtterarkivering is false`])
    }
  }

  logger('info', ['Loading meeting pdf from cache'])
  const pdfResult = meeting.archiveFlowStatus.jobs.createPdf.result
  if (!pdfResult || !pdfResult.cacheKey || !pdfResult.pdfCacheDir) {
    throw new Error('Job createPdf has not been run or did not return valid result - check flow status')
  }
  const pdfCache = createSimpleCache(pdfResult.pdfCacheDir)
  const pdfBase64 = pdfCache.get(pdfResult.cacheKey)
  if (!pdfBase64) {
    throw new Error('PDF cache does not contain base64 data for meeting, something is wrong... re-run createPdf job')
  }
  // Get meeting attachments from cache
  logger('info', ['Pdf loaded from cache, loading meeting attachments from cache'])

  const getMeetingAttachmentsResult = meeting.archiveFlowStatus.jobs.getMeetingAttachments.result
  if (!getMeetingAttachmentsResult || !getMeetingAttachmentsResult.attachmentCacheDir || !Array.isArray(getMeetingAttachmentsResult.itemAttachments)) {
    throw new Error('Job getMeetingAttachments has not been run or did not return valid attachments - check flow status')
  }
  const attachmentCache = createSimpleCache(getMeetingAttachmentsResult.attachmentCacheDir)
  for (const itemAttachments of getMeetingAttachmentsResult.itemAttachments) {
    for (const attachment of itemAttachments.attachments) {
      logger('info', [`Loading attachment ${attachment.name} from file-cache into memory`])
      const attachmentData = attachmentCache.get(attachment.cacheKey)
      if (!attachmentData || !attachmentData.base64) {
        throw new Error(`Attachment cache does not contain base64 data for attachment ${attachment.name}, something is wrong... re-run getMeetingAttachments job`)
      }
    }
  }
  logger('info', ['Attachments loaded from cache, generating archive document payload'])

  const archiveDocumentTitle = isEtterarkivering ? `${documentTitle} - Etterarkivering` : documentTitle

  // EXternal id må være unik - må sjekke om det er etterarkivering eller ikke, og sette basert på det
  const createBody = {
    service: 'DocumentService',
    method: 'CreateDocument',
    parameter: {
      AccessCode: meeting.meetingConfig.ARCHIVE.DOCUMENT_ACCESS_CODE || ARCHIVE.DOCUMENT_DEFAULT_VALUES.ACCESS_CODE,
      AccessGroup: meeting.meetingConfig.ARCHIVE.DOCUMENT_ACCESS_GROUP || ARCHIVE.DOCUMENT_DEFAULT_VALUES.ACCESS_GROUP,
      Paragraph: meeting.meetingConfig.ARCHIVE.DOCUMENT_PARAGRAPH || ARCHIVE.DOCUMENT_DEFAULT_VALUES.PARAGRAPH,
      Archive: 'Saksdokument',
      CaseNumber: meeting.archiveFlowStatus.jobs.syncMeetingArchiveCase.result.caseNumber,
      Category: 'Internt notat uten oppfølging',
      DocumentDate: meeting.meetingDate,
      Files: [
        {
          Base64Data: pdfBase64,
          Format: 'PDF',
          Status: 'F',
          Title: documentTitle,
          VersionFormat: 'A'
        }
      ],
      Status: 'J',
      Title: archiveDocumentTitle,
      UnofficialTitle: archiveDocumentTitle
    }
  }

  // Add attachments if they exist
  const attachments = getMeetingAttachmentsResult.itemAttachments.flatMap(item => item.attachments.map(attachment => {
    const validExtensionFormat = ARCHIVE.VALID_FILE_EXTENSIONS.find(ext => ext.toLowerCase() === attachment.extension.toLowerCase())
    if (!validExtensionFormat) {
      logger('warn', [`Attachment ${attachment.name} has an extension that is not valid in P360: ${attachment.extension}, will use unknown format: ${ARCHIVE.UNKNOWN_FILE_FORMAT_EXTENSION}`])
    }
    return {
      Base64Data: attachmentCache.get(attachment.cacheKey).base64,
      Format: attachment.extension.toUpperCase(),
      Status: 'F',
      Title: attachment.name,
      VersionFormat: (attachment.extension.toLowerCase() === 'pdf') ? 'P' : null // Dersom vedlegget er PDF lar vi p360 konvertere, fordi vi ikke vet om det er pdf/a format. Hvis ikke, lar vi fileformat kodetabellen i 360 ordne dette for oss, ved å sende inn null
    }
  }))
  if (attachments.length > 0) {
    createBody.parameter.Files.push(...attachments)
    logger('info', [`Added ${attachments.length} attachments to the document payload`])
  } else {
    logger('info', ['No attachments found for meeting, skipping attachment payload'])
  }

  if (meeting.meetingConfig.ARCHIVE.RESPONSIBLE_PERSON_EMAIL) {
    createBody.parameter.ResponsiblePersonEmail = meeting.meetingConfig.ARCHIVE.RESPONSIBLE_PERSON_EMAIL
  } else if (meeting.meetingConfig.ARCHIVE.RESPONSIBLE_ENTERPRISE_RECNO) {
    createBody.parameter.ResponsibleEnterpriseRecno = meeting.meetingConfig.ARCHIVE.RESPONSIBLE_ENTERPRISE_RECNO
  } else {
    throw new Error(`Either RESPONSIBLE_ENTERPRISE_RECNO or RESPONSIBLE_PERSON_EMAIL must be provided in the ARCHIVE configuration for ${meeting.meetingConfig.MEETING_ARENA}.`)
  }
  const createResponse = await axios.post(`${ARCHIVE.API_URL}/archive`, createBody, { headers: { Authorization: `Bearer ${token}` } })
  const createdDocument = createResponse.data
  if (!createdDocument || !createdDocument.Recno || !createdDocument.DocumentNumber) {
    throw new Error(`CreateDocument did not return Recno or / and DocumentNumber, something is wrong... Response: ${JSON.stringify(createResponse.data)}`)
  }
  logger('info', [`Created new document with title: ${archiveDocumentTitle}, DocumentNumber: ${createdDocument.DocumentNumber}, Recno: ${createdDocument.Recno}`])
  logger('info', ['Wiping memory cache for pdf and attachments, for memory reasons'])
  try {
    attachmentCache.clearMemory()
    pdfCache.clearMemory()
    logger('info', ['Memory caches wiped'])
  } catch (error) {
    logger('warn', [`Error clearing memory caches: ${error.message}`])
  }

  return ArchiveMeetingResult.parse({
    recno: createdDocument.Recno,
    documentNumber: createdDocument.DocumentNumber,
    searchTitle: documentTitle,
    isEtterarkivering
  })
}
