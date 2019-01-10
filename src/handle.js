import { User } from './user'

const handle = async event => {
  switch (event.type) {
    case 'Message4Bot':
      await handleMessage4Bot(event)
      break
    default:
      break
  }
}

const handleMessage4Bot = async event => {
  const { text, group, bot, userId } = event
  const groupId = group.id
  const reply = async text => bot.sendMessage(
    groupId, { text: text.trim() }
  )
  const botId = bot.id
  let user
  switch (text.toLowerCase()) {
    case 'unmonitor':
      user = await User.findByPk(userId)
      if (user) {
        await user.removeGroup(groupId)
        await reply(`![:Person](${userId}), stopped monitoring your voicemail!\nIf you want me to monitor your voicemail again, please reply "![:Person](${botId}) monitor"`)
      } else {
        await reply(`![:Person](${userId}), If you want me to monitor your voicemail, please reply "![:Person](${botId}) monitor" first.`)
      }
      break
    case 'monitor':
      user = await User.findByPk(userId)
      if (user && await user.check()) {
        await user.addGroup(groupId, botId)
        await user.ensureWebHook()
        await reply(`![:Person](${userId}), now your voicemail is monitored!\nIf you want me to **stop monitor** your voicemail, please reply "![:Person](${botId}) unmonitor"`)
      } else {
        const user = new User()
        const authorizeUri = user.authorizeUri(groupId, botId)
        await reply(`![:Person](${userId}), [click here](${authorizeUri}) to authorize me to access your RingCentral data first.`)
      }
      break
    default:
      break
  }
}

export default handle
