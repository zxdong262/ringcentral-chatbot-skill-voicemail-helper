import createApp from 'ringcentral-chatbot/dist/apps'
import skill from '../src'

const handle = async event => {
  if (event.type === 'Message4Bot' && event.text.toLowerCase() === 'about') {
    const { bot, group } = event
    await bot.sendMessage(
      group.id,
      {
        text: `
I am a Glip chatbot, I can monitor and transcript your voicemail, and do some analysis. If you want me to monitor your voicemail, please reply "![:Person](${bot.id}) monitor"
`
      }
    )
  }
}

const app = createApp(handle, [ skill ])
app.get('/', (req, res) => res.send('server running'))

export default app
