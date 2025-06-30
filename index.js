import { logConfig, logger } from '@vtfk/logger'
import { getListInfo } from './lib/graph.js'
import { getMeetingAttachments } from './lib/jobs/get-meeting-attachments.js'
import { createSimpleCache } from './lib/simple-cache.js'
import { repackSmartListItems } from './lib/smart/smart-meeting-items.js'
import { createMeetingQueue } from './lib/smart/smart-meetings.js'
import { getSmartItemsReadyForArchive } from './lib/smart/smart-sp-requests.js'
import { SMART_SAKSLISTER } from './lib/smart/smart-sakslister.js'
import { writeFileSync } from 'fs'
import { syncMeetingArchiveCase } from './lib/jobs/sync-archive-meeting.js'
import { createPdf } from './lib/jobs/create-pdf.js'
import { archiveMeeting } from './lib/jobs/archive-meeting.js'
import { setMeetingItemsToArchived } from './lib/jobs/set-meeting-items-to-archived.js'
import { SMART } from './config.js'

/**
 *
 * @param {import('./lib/smart/smart-meetings.js').SmartMeeting} meeting
 * @param {string} jobName
 * @param {function} jobFunction
 * @param {import('./lib/simple-cache.js').SimpleCache} meetingCache
 * @returns
 */
const handleJob = async (meeting, jobName, jobFunction, meetingCache) => {
  if (!meeting) throw new Error('Meeting is required')
  if (!meeting.meetingId) throw new Error('Meeting must have a meetingId')
  if (!meeting.archiveFlowStatus) throw new Error('Meeting must have an archiveFlowStatus')
  if (!meeting.archiveFlowStatus.jobs) throw new Error('Meeting must have an archiveFlowStatus with jobs')
  if (!jobName || typeof jobName !== 'string') throw new Error('jobName must be a non-empty string')
  if (!meeting.archiveFlowStatus.jobs[jobName]) throw new Error(`Job ${jobName} is not defined in meeting.archiveFlowStatus.jobs, something is wrong with the meeting archiveflow-status`)
  if (!jobFunction || typeof jobFunction !== 'function') throw new Error('jobFunction must be a function')
  if (!meetingCache) throw new Error('meetingCache is required and must be a SimpleCache instance')
  if (meetingCache && typeof meetingCache.set !== 'function') throw new Error('meetingCache must be a SimpleCache instance with a set method')

  logConfig({
    prefix: `${meeting.meetingConfig.MEETING_ARENA} - ${meeting.meetingId} - ${jobName}`
  })

  /** @type {import('./lib/smart/archive-flow-status.js').JobStatus} */
  const jobStatus = meeting.archiveFlowStatus.jobs[jobName]

  const shouldRun = !meeting.archiveFlowStatus.finished && !meeting.archiveFlowStatus.failed && !jobStatus.finished
  if (!shouldRun) {
    logger('info', [`Job ${jobName} for meeting ${meeting.meetingId} is already finished or not applicable, skipping.`])
    return
  }

  try {
    logger('info', ['Starting job'])
    const result = await jobFunction()
    jobStatus.result = result
    jobStatus.finished = true
    jobStatus.finishedTimestamp = new Date().toISOString()
    logger('info', ['Job completed successfully.'])
  } catch (error) {
    const errorData = error.response?.data || error.stack || error.message
    logger('error', ['Error in job', errorData])
    meeting.archiveFlowStatus.failed = true
    meeting.archiveFlowStatus.nextRun = new Date(Date.now() + SMART.RETRY_INTERVAL_MINUTES[meeting.archiveFlowStatus.runs] * 60 * 1000).toISOString()
    meeting.archiveFlowStatus.runs += 1
    jobStatus.lastError = errorData
    jobStatus.finished = false
    meetingCache.set(meeting.meetingId, meeting) // Update cache with the current state of the meeting
  }
}

for (const meetingConfig of SMART_SAKSLISTER) {
  logConfig({
    prefix: meetingConfig.MEETING_ARENA
  })
  const listInfo = await getListInfo(meetingConfig.LIST_URL)
  const readySmartListItems = await getSmartItemsReadyForArchive(listInfo)
  logger('info', [`Got ${readySmartListItems.value.length} items ready for archive - filtering out items that does not have status: ${SMART.READY_FOR_ARCHIVE_ITEM_STATUSES.join(', ')}`])
  const newMeetingItems = repackSmartListItems(readySmartListItems.value).filter(item => SMART.READY_FOR_ARCHIVE_ITEM_STATUSES.includes(item.itemStatus))
  // writeFileSync('./ignore/new-meeting-items.json', JSON.stringify(newMeetingItems, null, 2))
  logger('info', [`Filtered down to ${newMeetingItems.length} items that are ready for archive - creating meeting queue`])
  const meetingQueueCache = createSimpleCache('./.smart-archive/queue-cache')
  const meetingQueue = createMeetingQueue(meetingConfig, listInfo, meetingQueueCache, newMeetingItems)
  logger('info', [`Created meeting queue with ${meetingQueue.length} meetings - filtering out meetings that are not ready for retry or has run too many times`])
  const now = new Date()
  const readyForRunMeetingQueue = meetingQueue.filter(meeting => {
    if (meeting.archiveFlowStatus.runs > SMART.RETRY_INTERVAL_MINUTES.length) {
      logger('warn', [`Meeting has run too many times (${meeting.archiveFlowStatus.runs}), skipping. Someone must check this meeting manually.`])
      return false // Skip meetings that have run too many times
    }
    if (new Date(meeting.archiveFlowStatus.nextRun) < now) {
      logger('info', [`Meeting is not ready for run, waiting until ${meeting.archiveFlowStatus.nextRun}`])
      return false // Skip meetings that are not ready for run
    }
    return true // Meeting is ready for run
  })
  logger('info', [`Filtered down to ${readyForRunMeetingQueue.length} meetings that are ready for run - slicing down to max ${SMART.MAX_MEETINGS_PER_ARENA_PER_RUN} meetings per run`])
  writeFileSync('./ignore/meeting-queue.json', JSON.stringify(readyForRunMeetingQueue, null, 2), 'utf8')

  const meetingsToHandle = readyForRunMeetingQueue.slice(0, SMART.MAX_MEETINGS_PER_ARENA_PER_RUN)
  logger('info', [`Handling ${meetingsToHandle.length} meetings in this run`])

  for (const meeting of meetingsToHandle) {
    logConfig({
      prefix: `${meeting.meetingConfig.MEETING_ARENA} - ${meeting.meetingId}`
    })
    meeting.archiveFlowStatus.failed = false // Reset failed status for new runs
    {
      const jobName = 'getMeetingAttachments'
      await handleJob(meeting, jobName, async () => await getMeetingAttachments(meeting))
    }
    {
      const jobName = 'syncMeetingArchiveCase'
      await handleJob(meeting, jobName, async () => await syncMeetingArchiveCase(meeting))
    }
    {
      const jobName = 'createPdf'
      await handleJob(meeting, jobName, async () => await createPdf(meeting))
    }
    {
      const jobName = 'archiveMeeting'
      await handleJob(meeting, jobName, async () => await archiveMeeting(meeting))
    }
    {
      const jobName = 'setMeetingItemsToArchived'
      await handleJob(meeting, jobName, async () => await setMeetingItemsToArchived(meeting))
    }
    // Så lager vi noe statistikk

    // Så rydder vi opp i cachen flytter til finished (om finished da)
  }
}
