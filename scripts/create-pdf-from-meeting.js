// Creates only a meeting-pdf from a finished-meeting item. Fixes items with md field as well if missing

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { ARCHIVE, PDF } from '../config.js'
import { turndownService } from '../lib/helpers/turndown-html-to-md.js'
import axios from 'axios'

// Config
const inputMeetingsDir = './ignore/create-pdf-from-meetings'
const outputMeetingsDir = `${inputMeetingsDir}/result`
// End config

/**
*
 * @param {import('../lib/smart/smart-meetings.js').SmartMeeting} meeting
 */
const createPdf = async (meeting) => {
  const itemAttachments = meeting.archiveFlowStatus.jobs.getMeetingAttachments.result?.itemAttachments
  if (!itemAttachments || !Array.isArray(itemAttachments)) {
    throw new Error(`Job getMeetingAttachments has not been run or did not return valid attachments for meeting ${meeting.meetingId}`)
  }
  const pdfMeetingItems = meeting.items.map(item => {
    const attachments = itemAttachments.find(attachment => attachment.itemId === item.id)?.attachments || []
    if (!item.descriptionMd) {
      item.descriptionMd = turndownService.turndown(item.description)
    }
    if (!item.decisionMd) {
      item.decisionMd = turndownService.turndown(item.decision)
    }

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
      paragraph: meeting.meetingConfig.ARCHIVE.DOCUMENT_PARAGRAPH || ARCHIVE.DOCUMENT_DEFAULT_VALUES.PARAGRAPH,
      meetingTitle: meeting.meetingConfig.MEETING_ARENA,
      meetingItems: pdfMeetingItems
    }
  }

  // Create pdf
  const { data } = await axios.post(PDF.API_URL, pdfData, { headers: { 'x-functions-key': PDF.API_KEY } })
  if (!data?.data || !data.data.base64) {
    throw new Error('Something is wrong with response from PDF generation: No base64 data returned')
  }

  return data.data.base64
}

if (!existsSync(inputMeetingsDir)) {
  mkdirSync(inputMeetingsDir, { recursive: true })
}

if (!existsSync(outputMeetingsDir)) {
  mkdirSync(outputMeetingsDir, { recursive: true })
}

const meetingFiles = readdirSync(inputMeetingsDir).filter(file => file.endsWith('.json'))

for (const meetingFile of meetingFiles) {
  const filePath = `${inputMeetingsDir}/${meetingFile}`
  const meeting = JSON.parse(readFileSync(filePath, 'utf-8'))
  const pdfBase64 = await createPdf(meeting)

  // write as pdf to output dir
  const outputFilePath = `${outputMeetingsDir}/${meetingFile.replace('.json', '.pdf')}`
  const pdfBuffer = Buffer.from(pdfBase64, 'base64')
  writeFileSync(outputFilePath, pdfBuffer)
}

console.log('PDF generation completed')
