import { logConfig, logger } from '@vtfk/logger'
import { getListInfo } from './lib/graph.js'
import { getMeetingAttachments } from './lib/jobs/get-meeting-attachments.js'
import { createSimpleCache } from './lib/simple-cache.js'
import { repackSmartListItems } from './lib/smart/smart-meeting-items.js'
import { createMeetingQueue } from './lib/smart/smart-meetings.js'
import { getSmartItemsReadyForArchive } from './lib/smart/smart-sp-requests.js'
import { SMART_SAKSLISTER } from './lib/smart/smart-sakslister.js'
import { statSync } from 'fs'
import { syncMeetingArchiveCase } from './lib/jobs/sync-archive-meeting.js'
import { createPdf } from './lib/jobs/create-pdf.js'
import { archiveMeeting } from './lib/jobs/archive-meeting.js'
import { setMeetingItemsToArchived } from './lib/jobs/set-meeting-items-to-archived.js'
import { SMART, SMART_CACHE } from './config.js'
import { createStatistic } from './lib/jobs/create-statistic.js'
import { cleanUpMeeting } from './lib/jobs/cleanup-meeting.js'
import { createLocalLogger } from './lib/helpers/local-logger.js'

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
    prefix: `${meeting.meetingConfig.MEETING_ARENA} - ${meeting.meetingConfig.DEMO_MODE ? 'DEMO -' : ''} ${meeting.meetingId} - ${jobName}`
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

// Main script execution
logConfig({
  teams: {
    onlyInProd: false
  },
  localLogger: createLocalLogger('smart-archive-meetings')
})

logger('info', ['---------- Starting smart archive meetings script ----------'])

for (const meetingConfig of SMART_SAKSLISTER) {
  logConfig({
    prefix: `${meetingConfig.MEETING_ARENA}${meetingConfig.DEMO_MODE ? '- DEMO' : ''}`
  })
  const listInfo = await getListInfo(meetingConfig.LIST_URL)
  const readySmartListItems = await getSmartItemsReadyForArchive(listInfo)
  logger('info', [`Got ${readySmartListItems.value.length} items ready for archive - filtering out items that does not have status: ${SMART.READY_FOR_ARCHIVE_ITEM_STATUSES.join(', ')}`])
  const newMeetingItems = repackSmartListItems(readySmartListItems.value).filter(item => SMART.READY_FOR_ARCHIVE_ITEM_STATUSES.includes(item.itemStatus))
  // writeFileSync('./ignore/new-meeting-items.json', JSON.stringify(newMeetingItems, null, 2))
  logger('info', [`Filtered down to ${newMeetingItems.length} items that are ready for archive - creating meeting queue`])
  const meetingQueueCache = createSimpleCache(SMART_CACHE.QUEUE_DIR_NAME)
  const meetingQueue = createMeetingQueue(meetingConfig, listInfo, meetingQueueCache, newMeetingItems)
  logger('info', [`Created meeting queue with ${meetingQueue.length} meetings - filtering out meetings that are not ready for retry or has run too many times`])
  const now = new Date()
  const readyForRunMeetingQueue = meetingQueue.filter(meeting => {
    if (meeting.archiveFlowStatus.runs > SMART.RETRY_INTERVAL_MINUTES.length) {
      logger('warn', [`Meeting has run too many times (${meeting.archiveFlowStatus.runs}), skipping. Someone must check this meeting manually.`])
      return false // Skip meetings that have run too many times
    }
    if (new Date(meeting.archiveFlowStatus.nextRun) > now) {
      logger('info', [`Meeting is not ready for run, waiting until ${meeting.archiveFlowStatus.nextRun}`])
      return false // Skip meetings that are not ready for run
    }
    return true // Meeting is ready for run
  })
  logger('info', [`Filtered down to ${readyForRunMeetingQueue.length} meetings that are ready for run - slicing down to max ${SMART.MAX_MEETINGS_PER_ARENA_PER_RUN} meetings per run`])

  const meetingsToHandle = readyForRunMeetingQueue.slice(0, SMART.MAX_MEETINGS_PER_ARENA_PER_RUN)
  logger('info', [`Handling ${meetingsToHandle.length} meetings in this run`])

  for (const meeting of meetingsToHandle) {
    logConfig({
      prefix: `${meeting.meetingConfig.MEETING_ARENA} - ${meeting.meetingId}`
    })
    meeting.archiveFlowStatus.failed = false // Reset failed status for new runs
    {
      const jobName = 'getMeetingAttachments'
      await handleJob(meeting, jobName, async () => await getMeetingAttachments(meeting), meetingQueueCache)
    }
    {
      const jobName = 'syncMeetingArchiveCase'
      await handleJob(meeting, jobName, async () => await syncMeetingArchiveCase(meeting), meetingQueueCache)
    }
    {
      const jobName = 'createPdf'
      await handleJob(meeting, jobName, async () => await createPdf(meeting), meetingQueueCache)
    }
    {
      const jobName = 'archiveMeeting'
      await handleJob(meeting, jobName, async () => await archiveMeeting(meeting), meetingQueueCache)
    }
    {
      const jobName = 'setMeetingItemsToArchived'
      await handleJob(meeting, jobName, async () => await setMeetingItemsToArchived(meeting), meetingQueueCache)
    }
    {
      const jobName = 'createStatistic'
      await handleJob(meeting, jobName, async () => await createStatistic(meeting), meetingQueueCache)
    }
    {
      const jobName = 'cleanUpMeeting'
      await handleJob(meeting, jobName, async () => await cleanUpMeeting(meeting, meetingQueueCache), meetingQueueCache)
    }
  }
}

logConfig({
  prefix: 'post-processing'
})

const finishedCache = createSimpleCache(SMART_CACHE.FINISHED_DIR_NAME)
logger('info', ['Cleaning up finished meetings from cache'])
const finishedMeetings = finishedCache.files().map(file => {
  const filePath = `${finishedCache.cacheDirectory}/${file}`
  const now = new Date()
  const fileDate = statSync(filePath).mtime
  const daysDifference = Math.floor((now - fileDate) / (1000 * 60 * 60 * 24))
  if (daysDifference > SMART_CACHE.FINISHED_RETENTION_DAYS) {
    logger('info', [`File ${file} was last modified ${daysDifference} days ago, which is above limit: ${SMART_CACHE.FINISHED_RETENTION_DAYS}. Deleting finished meeting from cache.`])
    finishedCache.delete(file.replace('.json', '')) // Remove the file from cache
  } else {
    logger('info', [`File ${file} was last modified ${daysDifference} days ago, which is not above limit: ${SMART_CACHE.FINISHED_RETENTION_DAYS}. Keeping finished meeting in cache.`])
  }
})
logger('info', ['Finished cleaning up finished meetings from cache'])

logConfig({
  prefix: undefined // Reset prefix
})
logger('info', ['---------- Script finished ----------'])
