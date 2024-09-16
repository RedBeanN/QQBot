const { MessageComponent } = require('node-mirai-sdk')
const { Plain } = MessageComponent

const debug = require('debug')('mirai-event')

const getApi = require('./getApi')
const idmap = require('./db/idmap')
const urlmap = require('./db/urlmap')

let messageId = 1

const toMiraiMessage = (content = '', attachments = []) => {
  const messages = []
  if (content) messages.push(Plain(content))
  for (const att of attachments) {
    if (att.content_type.startsWith('image')) {
      const { url, width, height, size } = att
      messages.push({
        type: 'Image',
        url: url.startsWith('http') ? url : ('http://' + url),
        width,
        height,
        size,
      })
    } else if (att.content_type.startsWith('file')) {
      const { filename, url, size } = att
      messages.push({
        type: 'File',
        filename,
        url,
        size,
      })
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
  const ret = {
    content,
    msg_type: attachments.length ? 1 : 0,
  }
  if (image) {
    ret.image = image
  }
  return ret
}
const escapeUrls = async (msg = '', host = '') => {
  const matches = msg.match(/(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g)
  if (!matches) return msg
  // console.log(matches)
  for (const str of matches) {
    if (str.includes(host)) {
      continue
    }
    const hash = await urlmap.getHash(str.startsWith('http') ? str : 'http://' + str)
    const url = `https://${host}/url/${hash}`
    msg = msg.replace(str, url)
  }
  return msg
}
const replyPack = async (messages, server) => {
  if (typeof messages === 'string') {
    return {
      content: await escapeUrls(messages, server),
      msg_type: 0
    }
  }
  const attachments = []
  let content = ''
  if (Array.isArray(messages)) {
    for (let chain of messages) {
      if (typeof chain === 'string') {
        chain = {
          type: 'Plain',
          text: chain,
        }
      }
      switch (chain.type) {
        case 'Plain': {
          const last = attachments[attachments.length - 1]
          if (last && !last.content) {
            last.content = chain.text
          } else {
            content += chain.text + '\n'
          }
          break
        }
        case 'Image': {
          if (content.trim()) {
            if (!attachments.length) {
              attachments.push({
                msg_type: 0,
                content,
              })
              content = ''
            } else {
              const last = attachments[attachments.le - 1]
              if (last && !last.content) {
                last.content = content.trim()
                content = ''
              }
            }
          }
          attachments.push({
            msg_type: 7,
            media: chain.imageId,
            content: content.trim(),
          })
          content = ''
          break
        }
      }
    }
  }
  if (attachments.length) {
    if (content.trim()) {
      attachments.push({
        msg_type: 0,
        content: content.trim(),
      })
    }
    // console.log(attachments)
    return attachments
  }
  return {
    msg_type: 0,
    content: await escapeUrls(content, server),
  }
}
const ChannelMessage = (event, bot) => {
  const { author, content, attachments, channel_id, group_openid, member, guild_id, id } = event.d
  const messageChain = toMiraiMessage(content, attachments)
  const api = getApi(event)
  const isGroup = Boolean(channel_id && member || group_openid)
  const sender = isGroup
    ? {
      id: author.id,
      memberName: member.nick,
      specialTitle: member.roles?.[0],
      permission: member.roles?.[0],
      joinTimestamp: (new Date(member.joined_at)).valueOf(),
      lastSpeakTimestamp: Date.now(),
      group: {
        id: channel_id || group_openid,
        name: channel_id || group_openid,
        permission: 'MEMBER'
      }
    }
    : {
      id: author.id,
      name: author.username,
      remark: author.username
    }
  const reply = async msg => {
    const pack = await fromMiraiMessage(msg)
    const url = `${getApi(event)}messages`
    return bot._sendRequestPack(url, {
      ...pack,
      msg_id: event.d.id,
    })
  }
  return {
    type: isGroup ? 'GroupMessage' : 'FriendMessage',
    messageId: event.d.id,
    sender,
    messageChain,
    reply,
    quoteReply: reply,
    recall () {},
    __meta: {
      api,
      msg_id: id
    }
  }
}
const FriendMessage = async (event, bot) => {
  const { id, author, content, timestamp, attachments } = event.d
  const messageChain = toMiraiMessage(content, attachments)
  const realId = author.user_openid
  const virtualId = await idmap.getVirtualId(realId)
  const sender = {
    id: virtualId,
    name: realId,
    remark: realId,
  }
  const api = getApi(event)
  const reply = async msg => {
    const pack = await replyPack(msg, bot.server)
    if (Array.isArray(pack)) {
      let lastRes = null
      for (const p of pack) {
        lastRes = await bot._sendRequestPack(`${api}messages`, {
          ...p,
          msg_id: event.d.id,
          msg_seq: message.__meta.msg_seq++,
        })
      }
      return lastRes
    } else {
      return bot._sendRequestPack(`${api}messages`, {
        ...pack,
        msg_id: event.d.id,
        msg_seq: message.__meta.msg_seq++,
      })
    }
  }
  const message = {
    type: 'FriendMessage',
    messageId: messageId++,
    sender, messageChain,
    reply, quoteReply: reply,
    recall () {},
    __meta: {
      api,
      msg_id: event.d.id,
      msg_seq: 0,
    },
  }
  return message
}
const GroupMessage = async (event, bot) => {
  const { id, author, content, timestamp, attachments, group_openid } = event.d
  const messageChain = toMiraiMessage(content, attachments)
  const api = getApi(event)
  const realSid = author.member_openid
  const virtualSid = await idmap.getVirtualId(realSid)
  const virtualGid = await idmap.getVirtualId(group_openid)
  const sender = {
    id: virtualSid,
    memberName: realSid,
    specialTitle: '',
    permission: 'MEMBER',
    joinTimestamp: 0,
    lastSpeakTimestamp: Date.now(),
    group: {
      id: virtualGid,
      name: group_openid,
      permission: 'MEMBER',
    },
  }
  const reply = async msg => {
    const pack = await replyPack(msg, bot.server)
    if (Array.isArray(pack)) {
      let lastRes = null
      for (const p of pack) {
        lastRes = await bot._sendRequestPack(`${api}messages`, {
          ...p,
          msg_id: event.d.id,
          msg_seq: message.__meta.msg_seq++,
        })
      }
      return lastRes
    } else {
      return bot._sendRequestPack(`${api}messages`, {
        ...pack,
        msg_id: event.d.id,
        msg_seq: message.__meta.msg_seq++,
      })
    }
  }
  const message = {
    type: 'GroupMessage',
    messageId: messageId++,
    sender, messageChain,
    reply, quoteReply: reply,
    recall () {},
    __meta: {
      api,
      msg_id: id,
      msg_seq: 0,
    },
  }
  return message
}
const toMiraiEvent = (event, bot) => {
  if (typeof event !== 'object' || event === null) return null
  switch (event.t) {
    case 'MESSAGE_CREATE':
      return ChannelMessage(event, bot)
    case 'GROUP_AT_MESSAGE_CREATE':
      return GroupMessage(event, bot)
    case 'C2C_MESSAGE_CREATE':
      return FriendMessage(event, bot)
    case 'READY':
      return {
        type: 'authed',
      }
    case 'FRIEND_ADD':
    case 'FRIEND_DEL':
    case 'GROUP_ADD_ROBOT':
    case 'GROUP_DEL_ROBOT':
      // TODO:
    default:
      debug(`Received unrecognized event ${event.t}`)
      return
  }
  return null
}

module.exports = {
  toMiraiEvent,
  fromMiraiMessage,
}
if (require.main === module) {
  const server = require('../config').server
  escapeUrls(process.argv[2] || 'baidu.com', `${server.host}`).then(console.log)
}