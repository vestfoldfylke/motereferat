import { z } from 'zod/v4'
import { SMART_CACHE } from '../../config.js'
import { createSimpleCache } from '../simple-cache.js'

export const CleanUpMeetingResult = z.object({
  cleanedUp: z.boolean()
})

/**
*
 * @param {import("../smart/smart-meetings").SmartMeeting} meeting
 * @param {import('../simple-cache.js').SimpleCache} meetingQueueCache
 */
export const cleanUpMeeting = async (meeting, meetingQueueCache) => {
  // First remove pdf from cache
  const pdfCache = createSimpleCache(meeting.archiveFlowStatus.jobs.createPdf.result.pdfCacheDir)
  pdfCache.delete(meeting.archiveFlowStatus.jobs.createPdf.result.cacheKey)

  // Then remove all attachments from cache
  const attachmentCache = createSimpleCache(meeting.archiveFlowStatus.jobs.getMeetingAttachments.result.attachmentCacheDir)
  for (const itemAttachment of meeting.archiveFlowStatus.jobs.getMeetingAttachments.result.itemAttachments) {
    for (const attachment of itemAttachment.attachments) {
      attachmentCache.delete(attachment.cacheKey)
    }
  }
  // Then we set status on meeting
  meeting.archiveFlowStatus.finished = true
  meeting.archiveFlowStatus.finishedTimestamp = new Date().toISOString()
  // Save it to finished cache
  const finishedCache = createSimpleCache(SMART_CACHE.FINISHED_DIR_NAME)
  finishedCache.set(meeting.meetingId, meeting)
  // Finally, we remove the meeting from the queue cache
  meetingQueueCache.delete(meeting.meetingId)
  // And we are done

  return CleanUpMeetingResult.parse({ cleanedUp: true })
}
