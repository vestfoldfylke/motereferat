import { z } from 'zod/v4'
import { GetMeetingAttachmentsResult } from '../jobs/get-meeting-attachments.js'
import { SyncMeetingArchiveCaseResult } from '../jobs/sync-archive-meeting.js'
import { CreatePdfResult } from '../jobs/create-pdf.js'
import { ArchiveMeetingResult } from '../jobs/archive-meeting.js'
import { SetMeetingItemsToArchivedInfo, SetMeetingItemsToArchivedResult } from '../jobs/set-meeting-items-to-archived.js'
import { CreateStatisticResult } from '../jobs/create-statistic.js'
import { CleanUpMeetingResult } from '../jobs/cleanup-meeting.js'

/** @typedef {z.infer<typeof JobStatus>} JobStatus */
const JobStatus = z.object({
  finished: z.boolean().default(false),
  finishedTimestamp: z.string().nullable().default(null),
  lastError: z.any().nullable().default(null)
})

const GetMeetingAttachmentsJob = JobStatus.extend({
  result: GetMeetingAttachmentsResult.nullable().default(null)
})

const SyncMeetingArchiveCaseJob = JobStatus.extend({
  result: SyncMeetingArchiveCaseResult.nullable().default(null)
})

const CreatePdfJob = JobStatus.extend({
  result: CreatePdfResult.nullable().default(null)
})

const ArchiveMeetingJob = JobStatus.extend({
  result: ArchiveMeetingResult.nullable().default(null)
})

const setMeetingItemsToArchivedJob = JobStatus.extend({
  info: SetMeetingItemsToArchivedInfo.nullable().default(null),
  result: SetMeetingItemsToArchivedResult.nullable().default(null)
})

const createStatisticJob = JobStatus.extend({
  result: CreateStatisticResult.nullable().default(null)
})

const cleanUpMeetingJob = JobStatus.extend({
  result: CleanUpMeetingResult.nullable().default(null)
})

/** @typedef {z.infer<typeof ArchiveFlowStatus>} ArchiveFlowStatus */
export const ArchiveFlowStatus = z.object({
  finished: z.boolean().default(false),
  finishedTimestamp: z.iso.datetime().nullable().default(null),
  failed: z.boolean().default(false),
  runs: z.number().default(0),
  nextRun: z.iso.datetime().default(() => new Date().toISOString()),
  jobs: z.object({
    getMeetingAttachments: GetMeetingAttachmentsJob,
    syncMeetingArchiveCase: SyncMeetingArchiveCaseJob,
    createPdf: CreatePdfJob,
    archiveMeeting: ArchiveMeetingJob,
    setMeetingItemsToArchived: setMeetingItemsToArchivedJob,
    createStatistic: createStatisticJob,
    cleanUpMeeting: cleanUpMeetingJob
  })
})

export const createDefaultArchiveFlowStatus = () => {
  const defaultStatus = {
    jobs: {
      getMeetingAttachments: {},
      syncMeetingArchiveCase: {},
      createPdf: {},
      archiveMeeting: {},
      setMeetingItemsToArchived: {},
      createStatistic: {},
      cleanUpMeeting: {}
    }
  }
  return ArchiveFlowStatus.parse(defaultStatus)
}
