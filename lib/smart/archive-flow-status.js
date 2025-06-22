import { z } from "zod/v4"
import { GetMeetingAttachmentsResult } from "../jobs/get-meeting-attachments.js"
import { SyncMeetingArchiveCaseResult } from "../jobs/sync-archive-meeting.js"
import { CreatePdfResult } from "../jobs/create-pdf.js"


/** @typedef {z.infer<typeof JobStatus>} JobStatus */
const JobStatus = z.object({
  finished: z.boolean().default(false),
  finishedTimestamp: z.string().nullable().default(null),
  lastError: z.any().nullable().default(null),
})

const GetMeetingAttachmentsJob = JobStatus.extend({
  result: GetMeetingAttachmentsResult.nullable().default(null)
})

const SyncMeetingArchiveCaseJob = JobStatus.extend({
  result: SyncMeetingArchiveCaseResult.nullable().default(null)
})

const CreatePdfJob = JobStatus.extend({
  result: CreatePdfResult.nullable().default(null) // Placeholder
})

const ArchiveMeetingJob = JobStatus.extend({
  result: z.string().nullable().default(null) // Placeholder
})

const SetStatusOnMeetingItemsJob = JobStatus.extend({
  result: z.string().nullable().default(null) // Placeholder
})

/** @typedef {z.infer<typeof ArchiveFlowStatus>} ArchiveFlowStatus */
export const ArchiveFlowStatus = z.object({
  finished: z.boolean().default(false),
  failed: z.boolean().default(false),
  runs: z.number().default(0),
  nextRun: z.iso.datetime().default(() => new Date().toISOString()),
  jobs: z.object({
    getMeetingAttachments: GetMeetingAttachmentsJob,
    syncMeetingArchiveCase: SyncMeetingArchiveCaseJob,
    createPdf: CreatePdfJob,
    archiveMeeting: ArchiveMeetingJob,
    setStatusOnMeetingItems: SetStatusOnMeetingItemsJob,
  })
})

export const createDefaultArchiveFlowStatus = () => {
  const defaultStatus = {
    jobs: {
      getMeetingAttachments: {},
      syncMeetingArchiveCase: {},
      createPdf: {},
      archiveMeeting: {},
      setStatusOnMeetingItems: {},
    }
  }
  return ArchiveFlowStatus.parse(defaultStatus)
}
