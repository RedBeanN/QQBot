const debug = require('debug')('mirai-event')

const getApi = require('./getApi')
const idmap = require('./db/idmap')
const urlmap = require('./db/urlmap')

let messageId = 1

const toMiraiMessage = (content = '', attachments = []) => {
  const messages = []
  if (content) {
    messages.push({
      type: 'Plain',
      text: content,
    })
  }
  for (const att of (attachments || [])) {
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
const channelMiraiMessage = async (event, bot) => {
  const { attachments, mentions} = event.d
  let content = event.d.content
  debug('Mentions', mentions)
  const messages = []
  if (content) {
    const matched = content.match(/<@!\d+>/g)
    if (matched && matched.length) {
      for (const t of matched) {
        const realId = t.substring(3, t.indexOf('>'))
        let virtId = await idmap.getVirtualId(realId)
        if (realId === bot?.botId && virtId !== bot.qq) {
          await idmap.updateVirtualId(virtId, bot.qq)
          debug(`Change virtualId for ${realId} from ${virtId} to ${bot.qq}`)
          virtId = bot.qq
        }
        content = content.replace(t, '')
        const info = mentions?.find(i => i.id === realId)
        messages.push({
          type: 'At',
          target: virtId,
          display: info?.username || realId,
          avatar: info?.avatar,
        })
      }
      content = content.trim()
      if (content) {
        messages.push({
          type: 'Plain',
          text: content,
        })
      }
    } else {
      messages.push({ type: 'Plain', text: content })
    }
  }
  for (const att of (attachments || [])) {
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
const fromMiraiMessage = async messages => {
  let content = '', image = undefined
  const attachments = []
  if (typeof messages === 'string') {
    return {
      content: messages,
      // msg_type: 0
    }
  }
  for (const m of messages) {
    switch (m.type) {
      case 'Plain':
        content += m.text
        break
      case 'Image':
        if (image) break
        else image = m.url
        break
      case 'At': {
        const realId = await idmap.getRealId(m.target)
        if (realId) {
          /**
           * TODO:
           * @see https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/text-chain.html
           * 文档说的格式是 <qqbot-at-user id="" />
           * 但现在用这个发出去的是纯文本, 天知道什么时候改
           */
          content += `<@!${realId}>`
        } else {
          console.warn(`Failed to get realId from ${m.target}`)
        }
      }
    }
  }
  const ret = {
    content,
    // msg_type: attachments.length ? 1 : 0,
  }
  if (image) {
    // ret.image = image
    ret.file_image = image
  }
  return ret
}
const escapeUrls = async (msg = '', host = '') => {
  const matches = msg.match(/(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z]{2,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g)
  if (!matches) return msg
  // console.log(matches)
  for (const str of matches) {
    if (str.includes(host)) {
      continue
    }
    const hash = await urlmap.getHash(str.startsWith('http') ? str : 'http://' + str)
    const url = `https://${host}/url/${hash}`
    debug(`Change url from ${str} to ${url}`)
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
const ChannelMessage = async (event, bot) => {
  const { author, content, attachments, channel_id, member, guild_id, id } = event.d
  const messageChain = await channelMiraiMessage(event, bot)
  const api = getApi(event)
  const isGroup = event.t !== 'DIRECT_MESSAGE_CREATE' && Boolean(channel_id && member)
  const senderId = await idmap.getVirtualId(author.id)
  const sender = isGroup
    ? {
      id: senderId,
      memberName: member.nick,
      specialTitle: member.roles?.[0],
      permission: member.roles?.[0],
      joinTimestamp: (new Date(member.joined_at)).valueOf(),
      lastSpeakTimestamp: Date.now(),
      group: {
        id: await idmap.getVirtualId(channel_id),
        name: await idmap.getVirtualId(channel_id),
        permission: 'MEMBER'
      }
    }
    : {
      id: senderId,
      openid: author.id,
      name: author.username,
      remark: author.username,
      avatar: author.avatar,
    }
  const reply = async msg => {
    const pack = await fromMiraiMessage(msg)
    const url = `${getApi(event)}messages`
    return bot._sendRequestPack(url, {
      ...pack,
      msg_id: event.d.id,
    })
  }
  debug('emit event', isGroup, messageChain)
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

const asFriend = async (event, bot) => {
  const openId = event.d?.author?.union_openid || event.d?.openid
  const virtualId = await idmap.getVirtualId(openId)
  if (!openId) {
    console.error(`Error: Cannot parse ${JSON.stringify(event)} as friendAdd event`)
  }
  const api = getApi(event)
  let seq = 0
  const reply = async msg => {
    const pack = await replyPack(msg, bot.server)
    if (Array.isArray(pack)) {
      let lastRes = null
      for (const p of pack) {
        lastRes = await bot._sendRequestPack(`${api}messages`, {
          ...p,
          event_id: event.id,
          msg_seq: seq++,
        })
      }
      return lastRes
    } else {
      return bot._sendRequestPack(`${api}messages`, {
        ...pack,
        event_id: event.d.id,
        msg_seq: seq++,
      })
    }
  }
  return {
    friend: {
      id: virtualId,
      nickname: openId,
      remark: openId,
    },
    reply
  }
}
const asGroup = async (event, bot) => {
  const openId = event.d?.group_openid
  const userId = event.d?.op_member_openid
  if (!openId) {
    console.error(`Error: Cannot parse ${JSON.stringify(event)} as groupAdd event`)
  }
  const groupId = await idmap.getVirtualId(openId)
  const api = getApi(event)
  let seq = 0
  const reply = async msg => {
    const pack = await replyPack(msg, bot.server)
    if (Array.isArray(pack)) {
      let lastRes = null
      for (const p of pack) {
        lastRes = await bot._sendRequestPack(`${api}messages`, {
          ...p,
          event_id: event.id,
          msg_seq: seq++,
        })
      }
      return lastRes
    } else {
      return bot._sendRequestPack(`${api}messages`, {
        ...pack,
        event_id: event.id,
        msg_seq: seq++,
      })
    }
  }
  return {
    group: {
      id: groupId,
      name: openId,
      permission: 'MEMBER'
    },
    operator: userId ? {
      id: await idmap.getVirtualId(userId),
      memberName: userId,
      permission: 'ADMINISTRATOR',
      group: {
        id: groupId,
        name: openId,
        permission: 'MEMBER', // mirai-api-http里这个是bot在群里的权限，只能是MEMBER
      }
    } : null,
    reply,
  }
}
const toMiraiEvent = async (event, bot) => {
  if (typeof event !== 'object' || event === null) return null
  switch (event.t) {
    case 'MESSAGE_CREATE':
    case 'AT_MESSAGE_CREATE':
    case 'DIRECT_MESSAGE_CREATE':
      return ChannelMessage(event, bot)
    case 'GROUP_AT_MESSAGE_CREATE':
    case 'GROUP_MESSAGE_CREATE': // 私域群消息，不用at触发，未测试
      return GroupMessage(event, bot)
    case 'C2C_MESSAGE_CREATE':
      return FriendMessage(event, bot)
    case 'READY':
      return {
        type: 'online',
        qq: bot.qq,
        user: event.d.user,
      }
    case 'FRIEND_ADD':
      return {
        type: 'friendAdd',
        ...(await asFriend(event, bot)),
      }
    case 'FRIEND_DEL':
      return {
        type: 'friendDelete',
        ...(await asFriend(event, bot)),
      }
    case 'GROUP_ADD_ROBOT': {
      const evt = await asGroup(event, bot)
      return {
        type: 'joinGroup',
        ...evt,
        invitor: evt.operator,
      }
    }
    case 'GROUP_DEL_ROBOT': return {
      type: 'leaveKick',
      ...(await asGroup(event, bot))
    }
    case 'C2C_MSG_REJECT':
      return {
        type: 'disablePush',
        ...(await asFriend(event, bot)),
      }
    case 'C2C_MSG_RECEIVE':
      return {
        type: 'enablePush',
        ...(await asFriend(event, bot)),
      }
    case 'GROUP_MSG_REJECT':
      return {
        type: 'groupDisablePush',
        ...(await asGroup(event, bot))
      }
    case 'GROUP_MSG_RECEIVE':
      return {
        type: 'groupEnablePush',
        ...(await asGroup(event, bot)),
      }
    case 'MESSAGE_AUDIT_REJECT': {
      console.warn('Warning: message audit rejected', JSON.stringify(event))
      return {
        type: 'messageAuditRejected',
        data: event?.d || event,
      }
      return
    }
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