import { logger } from '@vtfk/logger'
import { ArchiveFlowStatus, createDefaultArchiveFlowStatus } from './archive-flow-status.js'
import { MeetingConfig } from './smart-sakslister.js'
import { ListInfo } from '../graph.js'
import { z } from 'zod/v4'
import { SmartMeetingItem } from './smart-meeting-items.js'

export const getMeetingDate = (ISOstring) => {
  if (!ISOstring || typeof ISOstring !== 'string') throw new Error('Missing required parameter ISOstring (string)')
  const date = new Date(ISOstring)
  if (isNaN(date.getTime())) throw new Error('Invalid date format')
  if ([22, 23].includes(date.getUTCHours())) {
    // If the time is 22:00 or 23:00 UTC, we assume the meeting is on the next day - because UTC
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return date.toISOString().substring(0, 10) // YYYY-MM-DD
}

/** @typedef {z.infer<typeof SmartMeeting>} SmartMeeting */
export const SmartMeeting = z.object({
  meetingId: z.string(),
  meetingDate: z.iso.date(),
  queuedDate: z.iso.datetime(),
  meetingConfig: MeetingConfig,
  listInfo: ListInfo,
  items: z.array(SmartMeetingItem).nonempty(),
  archiveFlowStatus: ArchiveFlowStatus
})

/**
 * @param {import('../../motereferat-config/sakslister.js').MeetingConfig} meetingConfig - Configuration for the meeting.
 * @param {import("../graph.js").ListInfo} listInfo - Information about the SharePoint list, including siteId and listId.
 * @param {import('../simple-cache.js').SimpleCache} meetingCache
 * @param {import('./smart-meeting-items.js').SmartMeetingItem[]} newMeetingItems
 * @returns {SmartMeeting[]}
 */
export const createMeetingQueue = (meetingConfig, listInfo, meetingCache, newMeetingItems) => {
  // Validate parameters
  MeetingConfig.parse(meetingConfig)
  ListInfo.parse(listInfo)
  if (!Array.isArray(newMeetingItems)) throw new Error('newMeetingItems must be an array of SmartMeetingItem objects')
  const newMeetings = []
  const cachedMeetings = []
  for (const item of newMeetingItems) {
    const meetingDate = getMeetingDate(item.meetingDate)
    const meetingId = `${listInfo.siteName}-${listInfo.listName}-${meetingDate}`
    const alreadyQueued = cachedMeetings.some(meeting => meeting.meetingId === meetingId)
    if (alreadyQueued) continue
    const cachedMeeting = meetingCache.get(meetingId)
    if (cachedMeeting) {
      logger('info', ['smart', 'getReadyMeetings', `Found cached meeting ${meetingId}, adding to in cachedMeetings`])
      cachedMeetings.push(cachedMeeting)
      continue
    }
    // Meeting is not in cache, so we need to create a new one
    let currentMeeting = newMeetings.find(meeting => meeting.meetingDate === meetingDate)
    if (!currentMeeting) {
      currentMeeting = {
        meetingId,
        meetingDate,
        meetingConfig,
        queuedDate: new Date().toISOString(),
        listInfo,
        items: [],
        archiveFlowStatus: createDefaultArchiveFlowStatus()
      }
      newMeetings.push(currentMeeting)
    }
    currentMeeting.items.push(item)
  }
  // Then get other cached meetings for this list that are in progress, and add them to the cachedMeetings for the hell of it
  const cachedMeetingKeys = meetingCache.keys().filter(key => key.startsWith(`${listInfo.siteName}-${listInfo.listName}-`))
  const cachedMeetingIdsNotAlreadyAdded = cachedMeetingKeys.filter(key => !cachedMeetings.some(meeting => meeting.meetingId === key))
  for (const key of cachedMeetingIdsNotAlreadyAdded) {
    const cachedMeeting = meetingCache.get(key)
    if (!cachedMeeting) {
      throw new Error(`Cached meeting with key ${key} not found in cache, wtf`)
    }
    cachedMeetings.push(cachedMeeting)
  }
  return [...cachedMeetings, ...newMeetings].map(meeting => SmartMeeting.parse(meeting))
}
