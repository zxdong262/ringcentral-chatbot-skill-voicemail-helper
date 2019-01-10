/**
 * User class
 */

import Sequelize from 'sequelize'
import RingCentral from 'ringcentral-js-concise'
import delay from 'timeout-as-promise'
import copy from 'json-deep-copy'
import {processMail} from './voicemail-process'

import sequelize from './sequelize'

export const subscribeInterval = () => '/restapi/v1.0/subscription/~?threshold=59&interval=15'

export const User = sequelize.define('user', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  token: {
    type: Sequelize.JSON
  },
  data: {
    type: Sequelize.JSON
  }
})

User.init = async ({ code, token, data }) => {
  const rc = new RingCentral(
    process.env.RINGCENTRAL_CHATBOT_CLIENT_ID,
    process.env.RINGCENTRAL_CHATBOT_CLIENT_SECRET,
    process.env.RINGCENTRAL_SERVER
  )
  if (code) { // public bot
    await rc.authorize({
      code,
      redirectUri: process.env.RINGCENTRAL_CHATBOT_SERVER + '/rc/oauth'
    })
    const token = rc.token()
    return User.create({
      id: token.owner_id,
      token,
      data: {}
    })
  } else if (token) { // private bot
    rc.token(token)
    const r = await rc.get('/restapi/v1.0/account/~/extension/~')
    return User.create({
      id: r.data.id,
      token: { ...token, owner_id: r.data.id },
      data
    })
  }
}

Object.defineProperty(User.prototype, 'rc', {
  get: function () {
    const rc = new RingCentral(
      process.env.RINGCENTRAL_APP_CLIENT_ID,
      process.env.RINGCENTRAL_APP_CLIENT_SECRET,
      process.env.RINGCENTRAL_SERVER
    )
    rc.token(this.token)
    return rc
  }
})

User.prototype.check = async function () {
  try {
    await this.rc.get('/restapi/v1.0/account/~/extension/~')
    return true
  } catch (e) {
    if (!e.data) {
      throw e
    }
    const errorCode = e.data.errorCode
    if (errorCode === 'OAU-232' || errorCode === 'CMN-405') {
      await this.remove()
      console.log(`User user ${this.id} had been deleted`)
      return false
    }
    throw e
  }
}

User.prototype.authorizeUri = function (groupId, botId) {
  return this.rc.authorizeUri(process.env.RINGCENTRAL_BOT_SERVER + '/rc/oauth', {
    state: groupId + ':' + botId,
    responseType: 'code'
  })
}

User.prototype.ensureWebHook = async function () {
  const r = await this.rc.get('/restapi/v1.0/subscription')
  for (const sub of r.data.records) {
    if (sub.deliveryMode.address === process.env.RINGCENTRAL_CHATBOT_SERVER + '/rc/webhook') {
      if (sub.status !== 'Active') {
        await this.rc.delete(`/restapi/v1.0/subscription/${sub.id}`)
      } else {
        return
      }
    }
  }
  await this.setupWebHook()
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
        expiresIn: 1799,
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

User.prototype.removeGroup = async function (groupId) {
  const inst = await User.findById(this.id)
  const data = copy(inst.data)
  delete data[groupId]
  await User.update({
    data
  }, {
    where: {
      id: this.id
    }
  })
}

User.prototype.addGroup = async function (groupId, botId) {
  const inst = await User.findById(this.id)
  const data = copy(inst.data)
  let hasNoGroup = Object.keys(data).length === 0
  data[groupId] = botId
  await User.update({
    data
  }, {
    where: {
      id: this.id
    }
  })
  if (hasNoGroup) {
    await this.ensureWebHook()
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

User.prototype.sendVoiceMailInfo = async function (processedMailInfo = '') {
  for (const groupId of Object.keys(this.groups)) {
    const botId = this.groups[groupId]
    const bot = await store.getBot(botId)
    await bot.sendMessage(
      groupId,
      { text: processedMailInfo }
    )
  }
}

User.prototype.processVoiceMail = async function (newMailCount) {
  if (!Object.keys(this.data)) {
    return
  }
  let voiceMails = await this.getVoiceMails(newMailCount)
  let userId = this.id
  let headers = this.rc._bearerAuthorizationHeader()
  for (let mail of voiceMails) {
    let msg = await processMail(mail, headers)
    await this.sendVoiceMailInfo(
      resultFormatter(userId, msg || {})
    )
  }
}
