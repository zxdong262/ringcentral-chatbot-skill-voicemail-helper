import express from 'express'
import { Bot } from 'ringcentral-chatbot/dist/models'
import { User, subscribeInterval } from './ringcentral'
import _ from 'lodash'

const app = express()

function shouldSyncVoiceMail (event) {
  let isStoreMsg = /\/account\/[\d~]+\/extension\/[\d~]+\/message-store/.test(
    _.get(event, 'body.event') || ''
  )
  if (!isStoreMsg) {
    return
  }
  let body = _.get(event, 'body.body') || {}
  let { changes = [] } = body
  // only new voice mail counts
  let voiceMailUpdates = changes.filter(c => c.type === 'VoiceMail' && c.newCount > 0)
  return voiceMailUpdates.length
}

app.get('/rc/oauth', async (req, res) => {
  const { code, state } = req.query
  const [groupId, botId] = state.split(':')
  let user = await User.findOne({
    where: {
      name: 'ringcentral',
      groupId,
      botId
    }
  })
  if (!user) {
    user = await User.init({ code, groupId, botId })
  }
  await user.ensureWebHook()
  let { userId } = user
  const bot = await Bot.findByPk(botId)
  await bot.sendMessage(
    groupId,
    {
      text: `![:Person](${userId}), you have successfully authorized me to access your RingCentral data!`
    }
  )
  await bot.sendMessage(
    groupId,
    {
      text: `![:Person](${userId}), your voicemail is monitored!\nIf you want me to **stop monitor** your voicemail, please reply "![:Person](${botId}) unmonitor"`
    }
  )
  res.send(
    '<div style="text-align: center;font-size: 20px;border: 5px solid #08c;padding: 30px;">You have authorized the bot to access your RingCentral data! Please close this page and get back to Glip</div>'
  )
})

app.post('/rc/webhook', async (req, res) => {
  let message = req.body
  let newMailCount = shouldSyncVoiceMail(req)
  let isRenewEvent = _.get(message, 'event') === subscribeInterval()
  if (newMailCount || isRenewEvent) {
    const userId = (message.body.extensionId || message.ownerId).toString()
    let user = await User.findOne({
      where: {
        name: 'ringcentral',
        userId
      }
    })
    // get reminder event, do token renew and subscribe renew
    if (user && isRenewEvent) {
      await user.refresh()
      await user.ensureWebHook()
    } else if (user) {
      await user.processVoiceMail(newMailCount)
    }
  }
  res.set({
    'validation-token': req.get('validation-token') || req.get('Validation-Token')
  })
  res.send('WebHook got')
})

app.get('/rc/users', async (req, res) => {
  let users = await User.findAll({
    where: {
      name: 'ringcentral'
    }
  })
  let out = ''
  for (let user of users) {
    let sub = await user.getSubscriptions()
    out = out + '<pre>' +
    JSON.stringify(users, null, 2) + '</pre><pre>' +
    JSON.stringify(sub, null, 2) + '</pre>'
  }
  res.send(out)
})

app.get('/rc/test', async (req, res) => {
  let { id } = req.query
  let user = await User.findByPk(id)
  if (user) {
    await user.processVoiceMail(1)
  }
  res.send('ok')
})

export default app
