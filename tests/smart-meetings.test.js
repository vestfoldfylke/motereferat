import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createMeetingQueue, getMeetingDate } from '../lib/smart/smart-meetings.js'
import { createSimpleCache } from '../lib/simple-cache.js'
import { ListInfo } from '../lib/graph.js'
import { createDefaultArchiveFlowStatus } from '../lib/smart/archive-flow-status.js'
import { MeetingConfig } from '../lib/smart/smart-sakslister.js'

const createMockMeetingItem = (id, title, meetingDate) => {
  /** @type {import('../lib/smart/smart-meeting-items.js').SmartMeetingItem} */
  const item = {
    id,
    title,
    meetingDate,
    archiveStatus: 'Bubu',
    itemType: 'Beslutning',
    itemStatus: 'Avsluttet',
    itemResponsibleName: 'Test Ansvarlig',
    description: 'Huhuhu',
    descriptionText: 'Test beskrivelse',
    decision: 'Test vedtak',
    decisionText: 'Test vedtak',
    documentNumber: 'Ikke arkivert',
    elementVersion: 1,
    hasAttachments: false,
    itemResponsibleLookupId: null,
    minutesId: 0,
    publishAttachments: 'Nei',
    publishItem: 'Ja',
    sorting: 100,
    reArchive: 'Nei'
  }
  return item
}

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
  const mockedListInfo = ListInfo.parse({
    siteId: 'enSite',
    listId: 'enListe',
    siteName: 'EnSiteDa',
    listName: 'EnListeDa',
    listUrl: 'https://example.com/sites/EnSiteDa/EnListeDa',
    listDisplayName: 'En Liste Da'
  })
  const mockedMeetingConfig = MeetingConfig.parse({
    MEETING_ARENA: 'En Møte Arena',
    ENABLED: true,
    LIST_URL: 'https://example.com/sites/EnSiteDa/EnListeDa',
    ARCHIVE: {
      EXTERNAL_ID_PREFIX: 'ORG-SMARTMtereferat-test',
      RESPONSIBLE_ENTERPRISE_RECNO: 123,
      DOCUMENT_ACCESS_GROUP: 'Test Dokument Tilgangsgruppe'
    },
    PDF: {
      SECTOR: 'Test seksjon'
    }
  })

  const meetingCache = createSimpleCache()

  /** @type {import('../lib/smart/smart-meeting-items.js').SmartMeetingItem[]} */
  const newMeetingItems = [
    createMockMeetingItem('1', 'Meeting Item 1', '2023-10-01T22:00:00Z'),
    createMockMeetingItem('2', 'Meeting Item 2', '2023-10-01T22:00:00Z'),
    createMockMeetingItem('3', 'Meeting Item 3', '2023-10-02T23:00:00Z')
  ]
  it('it has no cached meetings', () => {
    meetingCache.clear()
    const queue = createMeetingQueue(mockedMeetingConfig, mockedListInfo, meetingCache, newMeetingItems)
    assert.strictEqual(queue.length, 2)
    assert.strictEqual(queue[0].meetingId, 'EnSiteDa-EnListeDa-2023-10-02')
    assert.strictEqual(queue[0].meetingDate, '2023-10-02')
    assert.strictEqual(queue[0].items.length, 2)
    assert.strictEqual(queue[1].meetingId, 'EnSiteDa-EnListeDa-2023-10-03')
    assert.strictEqual(queue[1].meetingDate, '2023-10-03')
    assert.strictEqual(queue[1].items.length, 1)
  })
  it('it has one cached meetings, which is also in newMeetingItems - should use cached meeting', () => {
    meetingCache.clear()
    /** @type {import('../lib/smart/smart-meetings.js').SmartMeeting} */
    const cachedMeeting = {
      meetingId: 'EnSiteDa-EnListeDa-2023-10-02',
      meetingDate: '2023-10-02',
      archiveFlowStatus: createDefaultArchiveFlowStatus(),
      listInfo: mockedListInfo,
      meetingConfig: mockedMeetingConfig,
      queuedDate: new Date().toISOString(),
      items: [
        createMockMeetingItem('cached-item', 'Cached Item', '2023-10-01T22:00:00Z')
      ]
    }
    meetingCache.set('EnSiteDa-EnListeDa-2023-10-02', cachedMeeting)
    const queue = createMeetingQueue(mockedMeetingConfig, mockedListInfo, meetingCache, newMeetingItems)
    assert.strictEqual(queue.length, 2)
    assert.strictEqual(queue[0].meetingId, 'EnSiteDa-EnListeDa-2023-10-02')
    assert.strictEqual(queue[0].items.length, 1) // 2 new items in new meeting, but 1 in cached item - we prefere cached item
    assert.strictEqual(queue[0].items[0].id, 'cached-item')
    assert.strictEqual(queue[1].meetingId, 'EnSiteDa-EnListeDa-2023-10-03')
    assert.strictEqual(queue[1].meetingDate, '2023-10-03')
    assert.strictEqual(queue[1].items.length, 1)
  })
  it('it has two cached meetings, which is not in newMeetingItems - the one corresponding to the listid and siteid should be included in the cached meeting first in the queue, the other not be included at all', () => {
    meetingCache.clear()
    const cachedMeeting = {
      meetingId: 'EnSiteDa-EnListeDa-2023-10-06',
      meetingDate: '2023-10-06',
      archiveFlowStatus: createDefaultArchiveFlowStatus(),
      listInfo: mockedListInfo,
      meetingConfig: mockedMeetingConfig,
      queuedDate: new Date().toISOString(),
      items: [
        createMockMeetingItem('cached-item', 'Cached Item', '2023-10-05T22:00:00Z'),
        createMockMeetingItem('cached-item-2', 'Cached Item 2', '2023-10-05T22:00:00Z'),
        createMockMeetingItem('cached-item-3', 'Cached Item 3', '2023-10-05T22:00:00Z')
      ]
    }
    const anotherIrrelevantCachedMeeting = {
      meetingId: 'EnAnnenSiteDa-EnListeDa-2023-10-05',
      meetingDate: '2023-10-05',
      archiveFlowStatus: createDefaultArchiveFlowStatus(),
      listInfo: mockedListInfo,
      meetingConfig: mockedMeetingConfig,
      queuedDate: new Date().toISOString(),
      items: [
        createMockMeetingItem('cached-item-4', 'Cached Item 4', '2023-10-05T00:00:00Z')
      ]
    }
    meetingCache.set('EnSiteDa-EnListeDa-2023-10-06', cachedMeeting)
    meetingCache.set('EnAnnenSiteDa-EnListeDa-2023-10-05', anotherIrrelevantCachedMeeting)
    const queue = createMeetingQueue(mockedMeetingConfig, mockedListInfo, meetingCache, newMeetingItems)
    assert.strictEqual(queue.length, 3)
    assert.strictEqual(queue[0].meetingId, 'EnSiteDa-EnListeDa-2023-10-06')
    assert.strictEqual(queue[0].meetingDate, '2023-10-06')
    assert.strictEqual(queue[0].items.length, 3)
    assert.strictEqual(queue[0].items[0].id, 'cached-item')
    assert.strictEqual(queue[1].meetingId, 'EnSiteDa-EnListeDa-2023-10-02')
    assert.strictEqual(queue.some(meeting => meeting.meetingId === 'EnAnnenSiteDa-EnListeDa-2023-10-05'), false)
  })
})
