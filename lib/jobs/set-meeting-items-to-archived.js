import { z } from 'zod/v4'
import { BatchRequests } from '../graph.js'
import { FinishedItems, updateSmartListItems } from '../smart/smart-sp-requests.js'
import { logger } from '@vtfk/logger'
import { smartItemFields } from '../smart/smart-meeting-items.js'

export const SetMeetingItemsToArchivedResult = z.object({
  finishedItems: FinishedItems
})

export const SetMeetingItemsToArchivedInfo = z.object({
  batchRequests: BatchRequests,
  finishedItems: FinishedItems,
  failedItems: z.array(z.any())
})

/**
 *
 * @param {import('../smart/smart-meetings').SmartMeeting} meeting
 */
export const setMeetingItemsToArchived = async (meeting) => {
  const finishedItems = meeting.archiveFlowStatus.jobs.setMeetingItemsToArchived.info?.finishedItems || []
  if (!Array.isArray(finishedItems)) {
    throw new Error('finishedItems must exist and be an array da...')
  }
  if (finishedItems.length === meeting.items.length) {
    logger('info', [`All items in meeting ${meeting.meetingId} have already been updated appearently. Nothing to do.`])
    return SetMeetingItemsToArchivedResult.parse({
      finishedItems
    })
  }
  const itemsToUpdate = meeting.items.filter(item => !finishedItems.some(finishedItem => finishedItem.itemId === item.id))
  if (itemsToUpdate.length === 0) {
    throw new Error('FinishedItems.length is not equal to meeting.items.length, but no items are to be updated?? WHAT. Nothing to do.')
  }
  logger('info', [`Preparing to update ${itemsToUpdate.length} items in Sharepoint-list`])

  const prettyArchivedDate = new Date(meeting.archiveFlowStatus.jobs.archiveMeeting.finishedTimestamp).toLocaleDateString('nb-NO', { year: 'numeric', month: '2-digit', day: '2-digit' })

  const fieldsToUpdate = {
    [smartItemFields.archiveStatus.name]: `Arkivert - ${prettyArchivedDate}`,
    [smartItemFields.documentNumber.name]: meeting.archiveFlowStatus.jobs.archiveMeeting.result.documentNumber,
    [smartItemFields.reArchive.name]: smartItemFields.reArchive.falseValue
  }
  const result = await updateSmartListItems(meeting.listInfo, itemsToUpdate.map(item => item.id), fieldsToUpdate)

  // OBS her er vi litt støgge og setter info direkte i meeting-objektet, for å holde track på hva vi har gjort allerede om noe feiler. Neste kjøring filtrerer ut de som er ferdig oppdatert
  finishedItems.push(...result.finishedItems)
  meeting.archiveFlowStatus.jobs.setMeetingItemsToArchived.info = SetMeetingItemsToArchivedInfo.parse({
    batchRequests: result.batchRequests,
    finishedItems,
    failedItems: result.failedItems
  })
  logger('info', [`Updated ${result.finishedItems.length} items in Sharepoint-list`, `Failed to update ${result.failedItems.length} items`])

  // Det er HER vi validerer at alle items er oppdatert, og at vi ikke har noen som ikke er oppdatert - batchrequester kan feile, og vi sjekker derfor at hvert eneste item er oppdatert
  const failedItemIds = meeting.items.filter(item => !finishedItems.some(finishedItem => finishedItem.itemId === item.id)).map(item => item.id)

  if (failedItemIds.length > 0) {
    throw new Error(`Failed to update ${failedItemIds.length} items in Sharepoint-list. Ids: ${failedItemIds.join(', ')}. Check meeting.archiveFlowStatus.jobs.setMeetingItemsToArchived.info for details.`)
  }
  return SetMeetingItemsToArchivedResult.parse({
    finishedItems
  })
}
