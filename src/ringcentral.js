/**
 * User class
 */

import RingCentral from 'ringcentral-js-concise'
import delay from 'timeout-as-promise'
import { Service, Bot } from 'ringcentral-chatbot/dist/models'
import { processMail } from './voicemail-process'
import resultFormatter from './message-format'

export const subscribeInterval = () => '/restapi/v1.0/subscription/~?threshold=59&interval=15'

export class User extends Service {}

User.init = async ({ code, groupId, botId }) => {
  const rc = new RingCentral(
    process.env.RINGCENTRAL_CLIENT_ID,
    process.env.RINGCENTRAL_CLIENT_SECRET,
    process.env.RINGCENTRAL_SERVER
  )
  await rc.authorize({
    code,
    redirectUri: process.env.RINGCENTRAL_CHATBOT_SERVER + '/rc/oauth'
  })
  const token = rc.token()
  let where = {
    name: 'ringcentral',
    userId: token.owner_id,
    groupId,
    botId
  }
  let user = await User.findOne({
    where
  })
  if (user) {
    await User.update({
      data: {
        token
      }
    }, {
      where
    })
    user.data = { token }
    return user
  }
  return User.create({
    name: 'ringcentral',
    userId: token.owner_id,
    groupId,
    botId,
    data: {
      token
    }
  })
}

Object.defineProperty(User.prototype, 'rc', {
  get: function () {
    const rc = new RingCentral(
      process.env.RINGCENTRAL_CLIENT_ID,
      process.env.RINGCENTRAL_CLIENT_SECRET,
      process.env.RINGCENTRAL_SERVER
    )
    rc.token((this.data || {}).token)
    return rc
  }
})

User.prototype.validate = async function () {
  try {
    await this.rc.get('/restapi/v1.0/account/~/extension/~')
    return true
  } catch (e) {
    if (!e.data) {
      throw e
    }
    const { errorCode } = e.data
    if (errorCode === 'OAU-232' || errorCode === 'CMN-405') {
      await this.check()
      await User.destroy({
        where: {
          userId: this.userId
        }
      })
      console.log(`User ${this.userId} had been deleted`)
      return false
    }
    throw e
  }
}

User.prototype.authorizeUri = function (groupId, botId) {
  return this.rc.authorizeUri(process.env.RINGCENTRAL_CHATBOT_SERVER + '/rc/oauth', {
    state: groupId + ':' + botId,
    responseType: 'code'
  })
}

User.prototype.ensureWebHook = async function (removeOnly = false) {
  const r = await this.rc.get('/restapi/v1.0/subscription')
  for (const sub of r.data.records) {
    if (sub.deliveryMode.address === process.env.RINGCENTRAL_CHATBOT_SERVER + '/rc/webhook') {
      await this.rc.delete(`/restapi/v1.0/subscription/${sub.id}`)
    }
  }
  if (!removeOnly) {
    await this.setupWebHook()
  }
}

User.prototype.setupWebHook = async function () {
  let done = false
  while (!done) {
    try {
      await this.rc.post('/restapi/v1.0/subscription', {
        eventFilters: [
          '/restapi/v1.0/account/~/extension/~/message-store',
          subscribeInterval()
        ],
        expiresIn: 121,
        deliveryMode: {
          transportType: 'WebHook',
          address: process.env.RINGCENTRAL_CHATBOT_SERVER + '/rc/webhook'
        }
      })
      done = true
    } catch (e) {
      const errorCode = e.data.errorCode
      if (errorCode === 'SUB-406') {
        await delay(10000)
        continue
      }
      throw e
    }
  }
}

User.prototype.getVoiceMails = async function (count) {
  const r = await this.rc.get('/restapi/v1.0/account/~/extension/~/message-store', {
    params: {
      messageType: 'VoiceMail',
      perPage: count
    }
  })
  return r.data.records
}

User.prototype.sendVoiceMailInfo = async function (processedMailInfo = '', users) {
  for (const user of users) {
    const { botId, groupId } = user
    const bot = await Bot.findByPk(botId)
    await bot.sendMessage(
      groupId,
      { text: processedMailInfo }
    )
  }
}

User.prototype.processVoiceMail = async function (newMailCount) {
  let users = await User.findAll({
    where: {
      userId: this.userId
    }
  })
  if (!users || !users.length) {
    return
  }
  let voiceMails = await this.getVoiceMails(newMailCount)
  let { userId, botId } = this
  let headers = this.rc._bearerAuthorizationHeader()
  for (let mail of voiceMails) {
    let msg
    try {
      msg = await processMail(mail, headers, botId)
      await this.sendVoiceMailInfo(
        resultFormatter(userId, msg || {}), users
      )
    } catch (e) {
      console.log(e)
    }
  }
}

User.prototype.getSubscriptions = async function () {
  const r = await this.rc.get('/restapi/v1.0/subscription')
  return r.data.records
}

User.prototype.refresh = async function () {
  try {
    let { rc } = this
    await rc.refresh()
    let token = rc.token()
    await User.update({
      data: {
        token
      }
    }, {
      where: {
        name: 'ringcentral',
        userId: this.userId
      }
    })
    this.data = { token }
    return true
  } catch (e) {
    console.log('User refresh token', e)
    await User.destroy({
      where: {
        name: 'ringcentral',
        userId: this.userId
      }
    })
    console.log(`User ${this.userId} refresh token has expired`)
    return false
  }
}
