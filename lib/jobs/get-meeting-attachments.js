import { logger } from '@vtfk/logger'
import { createSimpleCache } from '../simple-cache.js'
import { getListItemAttachmentData, getListItemAttachments } from '../smart/smart-sp-requests.js'
import { z } from 'zod/v4'

/** @typedef {z.infer<typeof GetMeetingAttachmentsResult>} GetMeetingAttachmentsResult */
export const GetMeetingAttachmentsResult = z.object({
  attachmentCacheDir: z.string(),
  itemAttachments: z.array(z.object({
    itemId: z.string(),
    attachments: z.array(z.object({
      uri: z.string(),
      name: z.string(),
      extension: z.string(),
      cacheKey: z.string(),
      index: z.number()
    }))
  }))
})

/**
 * @param {import("../smart/smart-meetings").SmartMeeting} meeting
 */
export const getMeetingAttachments = async (meeting) => {
  if (!meeting || !meeting.items || !Array.isArray(meeting.items)) {
    throw new Error('Invalid meeting or meeting items')
  }

  const attachmentCacheDir = `./.smart-archive/attachments/${meeting.meetingId}`
  const attachmentCache = createSimpleCache(attachmentCacheDir)
  /** @type {GetMeetingAttachementsResult} */
  const result = {
    attachmentCacheDir,
    itemAttachments: []
  }

  for (const item of meeting.items.filter(item => item.hasAttachments)) {
    if (!item || !item.id) {
      throw new Error(`item or item.id is missing in meeting ${meeting.meetingId}: ${JSON.stringify(item)}`)
    }
    logger('info', ['smart', 'getMeetingAttachments', `Getting attachments for item ${item.id}`])
    const itemAttachmentsResponse = await getListItemAttachments(meeting.listInfo, item.id)
    if (!itemAttachmentsResponse || !Array.isArray(itemAttachmentsResponse.d?.results)) {
      throw new Error(`Failed to get attachments for item ${item.id} in meeting ${meeting.meetingId}. Response: ${JSON.stringify(itemAttachmentsResponse)}`)
    }
    const itemAttachments = itemAttachmentsResponse.d.results.map((attachment, index) => {
      if (!attachment?.__metadata?.uri) {
        throw new Error(`Attachment __metadata.uri is missing for item ${item.id} in meeting ${meeting.meetingId}: ${JSON.stringify(attachment)}`)
      }
      if (!attachment.FileName || typeof attachment.FileName !== 'string') {
        throw new Error(`Attachment FileName is missing or not a string for item ${item.id} in meeting ${meeting.meetingId}: ${JSON.stringify(attachment)}`)
      }
      return {
        uri: attachment.__metadata.uri,
        name: attachment.FileName,
        extension: attachment.FileName.split('.').pop(),
        cacheKey: `${item.id}-${index}.json`,
        index
      }
    })
    logger('info', ['smart', 'getMeetingAttachments', `Found ${itemAttachments.length} attachments for item ${item.id}`])
    for (const attachment of itemAttachments) {
      logger('info', ['smart', 'getMeetingAttachments', `Processing attachment ${attachment.name} for item ${item.id}`])
      if (!attachmentCache.has(attachment.cacheKey)) {
        logger('info', ['smart', 'getMeetingAttachments', `Downloading attachment ${attachment.name} for item ${item.id}`])
        const attachmentData = await getListItemAttachmentData(`${attachment.uri}/$value`)
        attachmentCache.set(attachment.cacheKey, { base64: attachmentData })
      } else {
        logger('info', ['smart', 'getMeetingAttachments', `Attachment ${attachment.name} for item ${item.id} in meeting ${meeting.meetingId} already cached, skipping download`])
      }
    }
    result.itemAttachments.push({
      itemId: item.id,
      attachments: itemAttachments
    })
  }
  logger('info', ['Finished processing attachments'])
  return GetMeetingAttachmentsResult.parse(result)
}
