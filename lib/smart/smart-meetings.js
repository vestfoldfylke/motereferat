import { logger } from '@vtfk/logger'
import { SMART_CACHE } from '../../config.js'
import { getSmartItemsReadyForArchive } from './smart-sp-requests.js'
import { createSimpleCache } from '../simple-cache.js'
import { pagedRequest } from '../graph.js'

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
 * @typedef {Object} smartMeeting
 * @property {string} meetingId - The unique identifier for the meeting.
 * @property {string} meetingDate - The date of the meeting in ISO format (YYYY-MM-DD).
 * @property {import('./smart-meeting-items.js').SmartMeetingItem[]} items - An array of meeting items associated with the meeting.
 */

/**
 * @param {import("../graph.js").ListInfo} listInfo - Information about the SharePoint list, including siteId and listId.
 * @param {import('../simple-cache.js').SimpleCache} meetingCache  
 * @param {import('./smart-meeting-items.js').SmartMeetingItem[]} newMeetingItems 
 * @returns {smartMeeting[]}
 */
export const createMeetingQueue = (listInfo, meetingCache, newMeetingItems) => {
  if (!(listInfo && typeof listInfo === 'object' && listInfo.siteId && typeof listInfo.siteId === 'string' && listInfo.listId && typeof listInfo.listId === 'string')) throw new Error('Missing required parameters listInfo.siteId (string) and listInfo.listId (string)')
  if (!meetingCache || typeof meetingCache.get !== 'function') throw new Error('meetingCache must be a simple meeteing cache')
  if (!Array.isArray(newMeetingItems)) throw new Error('newMeetingItems must be an array of SmartMeetingItem objects')

  const newMeetings = []
  const cachedMeetings = []
  for (const item of newMeetingItems) {
    const meetingDate = item.meetingDate.substring(0, 10) // YYYY-MM-DD
    const meetingId = `${listInfo.siteName}-${listInfo.listName}-${meetingDate}`
    const alreadyQueued = cachedMeetings.some(meeting => meeting.meetingId === meetingId)
    if (alreadyQueued) continue
    const cachedMeeting = meetingCache.get(meetingId)
    if (cachedMeeting) {
      logger('info', ['smart', 'getReadyMeetings', `Found cached meeting ${meetingId}, adding to in progress meetings`])
      cachedMeetings.push(cachedMeeting)
      continue
    }
    // Meeting is not in cache, so we need to create a new one
    let currentMeeting = newMeetings.find(meeting => meeting.meetingDate === meetingDate)
    if (!currentMeeting) {
      currentMeeting = {
        meetingId,
        meetingDate,
        listInfo,
        items: []
      }
      newMeetings.push(currentMeeting)
    }
    currentMeeting.items.push(item)
  }
  /*
  for (const meeting of newMeetings) {
    meetingCache.set(meeting.meetingId, meeting) // no need to set them in cache unless they fail later?
  }
  */
  return [...cachedMeetings, ...newMeetings]
}

/**
 *
 * @param {import("../graph.js").ListInfo} listInfo
 */
export const getReadyForArchiveMeetings = async (listInfo) => {
  const smartMeetingsCache = createSimpleCache(SMART_CACHE.QUEUE_DIR_NAME)
  const readyItems = await getSmartItemsReadyForArchive(listInfo.siteId, listInfo.listId)
  
}
