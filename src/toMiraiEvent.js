const { MessageComponent } = require('node-mirai-sdk')
const { Plain, Image } = MessageComponent

const toMiraiMessage = (content = '', attachments = []) => {
  const messages = []
  if (content) messages.push(Plain(content))
  for (const att of attachments) {
    if (att.content_type.startsWith('image')) {
      const { url, width, height } = att
      messages.push(Image({
        url: url.startsWith('http') ? url : ('http://' + url)
      }))
    }
  }
  return messages
}
const fromMiraiMessage = messages => {
  let content = '', image = undefined
  const attachments = []
  if (typeof messages === 'string') {
    return {
      content: messages,
      msg_type: 0
    }
  }
  for (const m of messages) {
    switch (m.type) {
      case 'Plain':
        content += Plain.value(m)
        break
      case 'Image':
        if (image) break
        else image = m.url
        break
    }
  }
  return {
    content,
    image,
    msg_type: attachments.length ? 1 : 0,
  }
}
const ChannelMessage = (event, bot) => {
  const { author, content, attachments, channel_id, member, guild_id, id } = event.d
  const messageChain = toMiraiMessage(content, attachments)
  const isGroup = channel_id && member
  const sender = isGroup
    ? {
      id: author.id,
      memberName: member.nick,
      specialTitle: member.roles?.[0],
      permission: member.roles?.[0],
      joinTimestamp: (new Date(member.joined_at)).valueOf(),
      lastSpeakTimestamp: Date.now(),
      group: {
        id: channel_id,
        name: channel_id,
        permission: 'MEMBER'
      }
    }
    : {
      id: author.id,
      name: author.username,
      remark: author.username
    }
  const reply = msg => {
    const pack = fromMiraiMessage(msg)
    const url = isGroup
      ? `/channels/${channel_id}/messages`
      : `/v2/users/${author.id}/messages`
    return bot._sendRequestPack(url, {
      content: pack.content,
      image: pack.image,
      msg_id: event.id,
    })
  }
  return {
    type: isGroup ? 'GroupMessage' : 'FriendMessage',
    sender,
    messageChain,
    reply,
    quoteReply: reply,
    recall () {}
  }
}
const toMiraiEvent = (event, bot) => {
  if (typeof event !== 'object' || event === null) return null
  switch (event.t) {
    case 'MESSAGE_CREATE':
      return ChannelMessage(event, bot)
  }
  return null
}

module.exports = {
  toMiraiEvent,
  fromMiraiMessage,
}
