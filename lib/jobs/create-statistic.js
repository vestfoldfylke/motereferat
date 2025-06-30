import axios from 'axios'
import { STATISTICS } from '../../config.js'
import { z } from 'zod/v4'
import { getPackageInfo } from '../helpers/get-package-info.js'

export const CreateStatisticResult = z.object({
  acknowledged: z.boolean(),
  insertedId: z.string()
})

/**
*
 * @param {import("../smart/smart-meetings").SmartMeeting} meeting
 */
export const createStatistic = async (meeting) => {
  const packageInfo = getPackageInfo()
  const statisticData = {
    system: 'SMART-møtereferat', // Required when not using system in param (url). System name. New system creates a new collection
    engine: `${packageInfo.name} - ${packageInfo.version}`, // Required. e.g. from package json
    company: meeting.meetingConfig.PDF.SECTOR, // Required. Sector
    description: 'Arkivering av SMART-møtereferat.', // Required. A description of what the statistic element represents
    projectId: '67', // Optional. If not set, will be set to "ingen prosjekttilknytning"
    type: 'mote-arkivering', // Required. A short searchable type-name that distinguishes the statistic element
    externalId: meeting.meetingId, // Optional. ID in the external {system}
    meetingArena: meeting.meetingConfig.MEETING_ARENA,
    meetingDate: meeting.meetingDate,
    documentNumber: meeting.archiveFlowStatus.jobs.archiveMeeting.result.documentNumber,
    isEtterarkivering: meeting.archiveFlowStatus.jobs.archiveMeeting.result.isEtterarkivering
  }

  const { data } = await axios.post(STATISTICS.API_URL, statisticData, { headers: { 'x-functions-key': STATISTICS.API_KEY } })

  return CreateStatisticResult.parse(data)
}
