import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createMeetingQueue, getMeetingDate } from '../lib/smart/smart-meetings.js'
import { createSimpleCache } from '../lib/simple-cache.js'

describe('getMeetingDate works as expected when', () => {
  it('has a valid date', () => {
    const date = getMeetingDate('2023-10-01T22:00:00Z')
    assert.strictEqual(date, '2023-10-02')
  })
  it('has a valid date with time', () => {
    const date = getMeetingDate('2023-10-01T23:00:00Z')
    assert.strictEqual(date, '2023-10-02')
  })
  it('has a valid date without time', () => {
    const date = getMeetingDate('2023-10-01')
    assert.strictEqual(date, '2023-10-01')
  })
  it('has an invalid date', () => {
    assert.throws(() => getMeetingDate('invalid-date'), {
      name: 'Error',
      message: 'Invalid date format'
    })
  })
})

describe('createMeetingQueue works as expected when', () => {
  const mockedListInfo = {
    siteId: 'enSite',
    listId: 'enListe',
    siteName: 'EnSiteDa',
    listName: 'EnListeDa'
  }
  const meetingCache = createSimpleCache()

  /** @type {import('../lib/smart/smart-meeting-items.js').SmartMeetingItem[]} */
  const newMeetingItems = [
    {
      id: '1',
      title: 'Meeting Item 1',
      meetingDate: '2023-10-01T22:00:00Z'
    },
    {
      id: '2',
      title: 'Meeting Item 2',
      meetingDate: '2023-10-01T22:00:00Z'
    },
    {
      id: '3',
      title: 'Meeting Item 3',
      meetingDate: '2023-10-02T23:00:00Z'
    }
  ]
  it('it has no cached meetings', () => {
    meetingCache.clear()
    const queue = createMeetingQueue(mockedListInfo, meetingCache, newMeetingItems)
    assert.strictEqual(queue.length, 2)
    assert.strictEqual(queue[0].meetingId, 'EnSiteDa-EnListeDa-2023-10-01')
    assert.strictEqual(queue[0].meetingDate, '2023-10-01')
    assert.strictEqual(queue[0].items.length, 2)
    assert.strictEqual(queue[1].meetingId, 'EnSiteDa-EnListeDa-2023-10-02')
    assert.strictEqual(queue[1].meetingDate, '2023-10-02')
    assert.strictEqual(queue[1].items.length, 1)
  })
  it('it has one cached meetings, which is also in newMeetingItems - should use cached meeting', () => {
    meetingCache.clear()
    const cachedMeeting = {
      meetingId: 'EnSiteDa-EnListeDa-2023-10-01',
      meetingDate: '2023-10-01',
      items: [
        {
          id: 'cached-item',
          title: 'Cached Item',
          meetingDate: '2023-10-01T22:00:00Z'
        }
      ]
    }
    meetingCache.set('EnSiteDa-EnListeDa-2023-10-01', cachedMeeting)
    const queue = createMeetingQueue(mockedListInfo, meetingCache, newMeetingItems)
    assert.strictEqual(queue.length, 2)
    assert.strictEqual(queue[0].meetingId, 'EnSiteDa-EnListeDa-2023-10-01')
    assert.strictEqual(queue[0].items.length, 1) // 2 new items in new meeting, but 1 in cached item - we prefere cached item
    assert.strictEqual(queue[0].items[0].id, 'cached-item')
    assert.strictEqual(queue[1].meetingId, 'EnSiteDa-EnListeDa-2023-10-02')
    assert.strictEqual(queue[1].meetingDate, '2023-10-02')
    assert.strictEqual(queue[1].items.length, 1)
  })
  it('it has two cached meetings, which is not in newMeetingItems - the one corresponding to the listid and siteid should be included in the cached meeting first in the queue, the other not be included at all', () => {
    meetingCache.clear()
    const cachedMeeting = {
      meetingId: 'EnSiteDa-EnListeDa-2023-10-06',
      meetingDate: '2023-10-06',
      items: [
        {
          id: 'cached-item',
          title: 'Cached Item',
          meetingDate: '2023-10-06T22:00:00Z'
        },
        {
          id: 'cached-item-2',
          title: 'Cached Item 2',
          meetingDate: '2023-10-06T22:00:00Z'
        },
        {
          id: 'cached-item-3',
          title: 'Cached Item 3',
          meetingDate: '2023-10-06T22:00:00Z'
        }
      ]
    }
    const anotherIrrelevantCachedMeeting = {
      meetingId: 'EnAnnenSiteDa-EnListeDa-2023-10-05',
      meetingDate: '2023-10-05',
      items: [
        {
          id: 'cached-item-4',
          title: 'Cached Item 4',
          meetingDate: '2023-10-05T22:00:00Z'
        }
      ]
    }
    meetingCache.set('EnSiteDa-EnListeDa-2023-10-06', cachedMeeting)
    meetingCache.set('EnAnnenSiteDa-EnListeDa-2023-10-05', anotherIrrelevantCachedMeeting)
    const queue = createMeetingQueue(mockedListInfo, meetingCache, newMeetingItems)
    assert.strictEqual(queue.length, 3)
    assert.strictEqual(queue[0].meetingId, 'EnSiteDa-EnListeDa-2023-10-06')
    assert.strictEqual(queue[0].meetingDate, '2023-10-06')
    assert.strictEqual(queue[0].items.length, 3)
    assert.strictEqual(queue[0].items[0].id, 'cached-item')
    assert.strictEqual(queue[1].meetingId, 'EnSiteDa-EnListeDa-2023-10-01')
    assert.strictEqual(queue.some(meeting => meeting.meetingId === 'EnAnnenSiteDa-EnListeDa-2023-10-05'), false)
  })
})
