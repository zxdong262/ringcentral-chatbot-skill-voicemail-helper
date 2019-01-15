/**
 * read voicemail and process it
 */

import _ from 'lodash'
import crypto from 'crypto'
import { speech2text } from 'audio-analysis-service/dist/url2text'
import { textAnalysis } from 'audio-analysis-service/dist/text-analysis'
import { Service } from 'ringcentral-chatbot/dist/models'

/**
 * process voice mail
 * @param {object} mail
 * @param {object} rc
 */
export async function processMail (mail, headers, botId) {
  let url = _.get(mail, 'attachments[0].uri')
  if (!url) {
    return ''
  }
  let md5 = crypto.createHash('md5').update(url).digest('hex')
  let cached = await Service.findOne({
    where: {
      userId: md5,
      name: 'cache'
    }
  })
  if (cached) {
    console.log('use cache for', url, md5)
    return cached.result
  }
  let text = await speech2text(
    url, headers
  )
  if (!_.isString(text)) {
    return ''
  }
  let result = await textAnalysis(text)
  if (!result || !result.text) {
    return ''
  }
  await Service.create({
    userId: md5,
    botId,
    result
  })
  return result
}
