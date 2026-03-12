import axios from 'axios'
import { ARCHIVE, PDF, SMART } from '../../config.js'
import { createSimpleCache } from '../simple-cache.js'
import { z } from 'zod/v4'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

// Init cache
const pdfCacheDir = './.smart-archive/pdfs'
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
      descriptionMd: item.descriptionMd,
      itemStatus: item.itemStatus,
      itemType: item.itemType,
      decisionText: item.decisionText,
      decisionMd: item.decisionMd,
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
      paragraph: meeting.meetingConfig.ARCHIVE.DOCUMENT_PARAGRAPH ?? ARCHIVE.DOCUMENT_DEFAULT_VALUES.PARAGRAPH,
      meetingTitle: meeting.meetingConfig.MEETING_ARENA,
      meetingItems: pdfMeetingItems
    }
  }
  // Create pdf
  const { data } = await axios.post(PDF.API_URL, pdfData, { headers: { 'x-functions-key': PDF.API_KEY } })
  if (!data?.data || !data.data.base64) {
    throw new Error('Something is wrong with response from PDF generation: No base64 data returned')
  }
  // Set in cache
  const cacheKey = meeting.meetingId
  pdfCache.set(cacheKey, data.data.base64)

  // If DEMO_RUN we save the pdf to ignore dir for debugging
  if (meeting.meetingConfig.DEMO_MODE) {
    const ignoreDir = SMART.DEMO_PDF_DIR
    if (!existsSync(ignoreDir)) {
      mkdirSync(ignoreDir, { recursive: true })
    }
    const filePath = `${ignoreDir}/DEMO_${meeting.meetingId}.pdf`
    const pdfBuff = Buffer.from(data.data.base64, 'base64')
    writeFileSync(filePath, pdfBuff)
  }

  return CreatePdfResult.parse({
    pdfCacheDir,
    cacheKey
  })
}
