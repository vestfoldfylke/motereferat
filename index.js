import { logConfig, logger } from '@vtfk/logger'
import { getListInfo } from './lib/graph.js'
import { getMeetingAttachments } from './lib/jobs/get-meeting-attachments.js'
import { createSimpleCache } from './lib/simple-cache.js'
import { repackSmartListItems } from './lib/smart/smart-meeting-items.js'
import { createMeetingQueue } from './lib/smart/smart-meetings.js'
import { getListItemAttachments, getSmartItemsReadyForArchive } from './lib/smart/smart-sp-requests.js'
import { SMART_SAKSLISTER } from './motereferat-config/sakslister.js'
import { writeFileSync } from 'fs'
import { syncMeetingArchiveCase } from './lib/jobs/sync-archive-meeting.js'
import { createPdf } from './lib/jobs/create-pdf.js'
import { archiveMeeting } from './lib/jobs/archive-meeting.js'

/**
 *
 * @param {import('./lib/smart/smart-meetings.js').SmartMeeting} meeting
 * @param {string} jobName
 * @param {function} jobFunction
 * @returns
 */
const handleJob = async (meeting, jobName, jobFunction) => {
  if (!meeting) throw new Error('Meeting is required')
  if (!meeting.meetingId) throw new Error('Meeting must have a meetingId')
  if (!meeting.archiveFlowStatus) throw new Error('Meeting must have an archiveFlowStatus')
  if (!meeting.archiveFlowStatus.jobs) throw new Error('Meeting must have an archiveFlowStatus with jobs')
  if (!jobName || typeof jobName !== 'string') throw new Error('jobName must be a non-empty string')
  if (!meeting.archiveFlowStatus.jobs[jobName]) throw new Error(`Job ${jobName} is not defined in meeting.archiveFlowStatus.jobs, something is wrong with the meeting archiveflow-status`)
  if (!jobFunction || typeof jobFunction !== 'function') throw new Error('jobFunction must be a function')

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
    jobStatus.lastError = errorData
    jobStatus.finished = false
    // Should props set nextRun and stuff here also
  }
}

for (const meetingConfig of SMART_SAKSLISTER) {
  logConfig({
    prefix: meetingConfig.MEETING_ARENA
  })
  const listInfo = await getListInfo(meetingConfig.LIST_URL)
  const readySmartListItems = await getSmartItemsReadyForArchive(listInfo)
  const newMeetingItems = repackSmartListItems(readySmartListItems.value)
  // writeFileSync('./ignore/new-meeting-items.json', JSON.stringify(newMeetingItems, null, 2))
  const meetingQueueCache = createSimpleCache('./.smart-archive/queue-cache')
  const meetingQueue = createMeetingQueue(meetingConfig, listInfo, meetingQueueCache, newMeetingItems)
  writeFileSync('./ignore/meeting-queue.json', JSON.stringify(meetingQueue, null, 2), 'utf8')

  for (const meeting of meetingQueue.filter(meeting => meeting.meetingId === 'ORG-SMARTMtereferat-Saksliste versjon 4-2024-01-25')) {
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
    meetingQueueCache.set(meeting.meetingId, meeting)
  }
}

/*
Trycatch driten
med common error handling i hver catch

hent inn meetingCache hvis ikke allerede gjort
for hver arkiv-liste i config
  hent listeinfo
  hent items som er klare for arkivering
  lag opp klare arkiv-møter basert på items og meetingCache
  for hvert klare arkiv-møte
    kjør arkiv-driten
repeat
*/
