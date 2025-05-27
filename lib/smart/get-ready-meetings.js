import { logger } from '@vtfk/logger'
import { SMART_CACHE } from '../../config.js'
import { getSmartItemsReadyForArchive } from './smart-sp-list.js'
import { createSimpleCache } from '../simple-cache.js'

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

/**
 *
 * @param {import("../graph").ListInfo} listInfo
 */
export const getReadyMeetings = async (listInfo) => {
  const smartMeetingsCache = createSimpleCache(SMART_CACHE.QUEUE_DIR_NAME)
  const readyItems = await getSmartItemsReadyForArchive(listInfo.siteId, listInfo.listId)
  const newMeetings = []
  const inProgressMeetings = []
  for (const item of readyItems) {
    const meetingDate = item.meetingDate.substring(0, 10) // YYYY-MM-DD
    const meetingId = `${listInfo.siteName}-${listInfo.listName}-${meetingDate}`
    const alreadyInProgress = inProgressMeetings.some(meeting => meeting.meetingId === meetingId)
    if (alreadyInProgress) continue
    const cachedMeeting = smartMeetingsCache.get(meetingId)
    if (cachedMeeting) {
      logger('info', ['smart', 'getReadyMeetings', `Found cached meeting ${meetingId}, adding to in progress meetings`])
      inProgressMeetings.push(cachedMeeting)
      continue
    }
    // Meeting is not in cache, so we need to create a new one
    let currentMeeting = newMeetings.find(meeting => meeting.meetingDate === meetingDate)
    if (!currentMeeting) {
      currentMeeting = {
        meetingId,
        meetingDate,
        items: []
      }
      newMeetings.push(currentMeeting)
    }
    currentMeeting.items.push(item)
  }
  for (const meeting of newMeetings) {
    smartMeetingsCache.set(meeting.meetingId, meeting)
  }
  return [...inProgressMeetings, ...newMeetings]
}
