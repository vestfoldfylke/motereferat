import axios from "axios"
import { PDF } from "../../config.js"
import { createSimpleCache } from "../simple-cache.js"
import { z } from "zod/v4"

// Init cache
const pdfCacheDir = `./.smart-archive/pdfs`
const pdfCache = createSimpleCache(pdfCacheDir)

export const CreatePdfResult = z.object({
  pdfCacheDir: z.string(),
  cacheKey: z.string()
})

/**
*
 * @param {import("../smart/smart-meetings").SmartMeeting} meeting
 */
export const createPdf = async (meeting) => {
  const itemAttachments = meeting.archiveFlowStatus.jobs.getMeetingAttachments.result?.itemAttachments
  if (!itemAttachments || !Array.isArray(itemAttachments)) {
    throw new Error(`Job getMeetingAttachments has not been run or did not return valid attachments for meeting ${meeting.meetingId}`)
  }
  const pdfMeetingItems = meeting.items.map(item => {
    const attachments = itemAttachments.find(attachment => attachment.itemId === item.id)?.attachments || []
    return {
      title: item.title,
      descriptionText: item.descriptionText,
      itemStatus: item.itemStatus,
      itemType: item.itemType,
      decisionText: item.decisionText,
      itemResponsibleName: item.itemResponsibleName,
      attachments: attachments.map(att => ({ fileName: att.name }))
    }
  })
  const pdfData = {
    system: 'smart',
    template: 'motereferatV2',
    language: 'nb',
    type: '2',
    version: 'B',
    data: {
      meetingDate: meeting.meetingDate,
      sector: meeting.meetingConfig.PDF.SECTOR,
      meetingCaseNumber: meeting.archiveFlowStatus.jobs.syncMeetingArchiveCase.result.caseNumber,
      paragraph: meeting.meetingConfig.paragraph || 'juhuuu',
      meetingTitle: meeting.meetingConfig.MEETING_ARENA,
      meetingItems: pdfMeetingItems
    }
  }
  // Create pdf
  const { data } = await axios.post(PDF.API_URL, pdfData, { headers: { 'x-functions-key': PDF.API_KEY } })
  if (!data?.data || !data.data.base64) {
    throw new Error(`Something is wrong with response from PDF generation: No base64 data returned`)
  }
  // Set in cache
  const cacheKey = meeting.meetingId
  pdfCache.set(cacheKey, data.data.base64)

  return CreatePdfResult.parse({
    pdfCacheDir,
    cacheKey
  })
}
