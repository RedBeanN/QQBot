const NodeMirai = require("node-mirai-sdk")
const QQBot = require(".")
const { toMiraiEvent } = require("./toMiraiEvent")
const { OpCode } = require("./types")
const { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync, createWriteStream } = require('fs')
const { randomBytes } = require('crypto')
const { resolve } = require('path')
const initServer = require('./server')
const idmap = require('./db/idmap')

const unsupport = (msg) => {
  console.warn(`Unsupported method ${msg}`)
}
/** @param { ReadableStream } stream */
const streamToBuffer = async (stream) => {
  const bufs = []
  for await (const data of stream) {
    bufs.push(data)
  }
  return Buffer.concat(bufs)
}
const moveFileTo = (image, dist) => {
  if (typeof image === 'string') {
    if (existsSync(image)) {
      copyFileSync(image, dist)
      return true
    } else {
      if (image.startsWith('base64')) {
        writeFileSync(dist, Buffer.from(image.replace(/^data:image\/(png|jpg);base64,/, ''), 'base64'))
        return true
      } else if (image.startsWith('http')) {
        // TODO: Don't save web files! Just send it by url
      }
    }
  } else if (image instanceof Buffer) {
    writeFileSync(dist, image)
    return true
  } else if ('pipe' in image) {
    return new Promise((resolve) => {
      const stream = createWriteStream(dist)
      image.pipe(stream)
      image.on('close', () => resolve(true))
      image.on('error', () => resolve(false))
    })
  }
}

const createAdapter = ({
  qq = 3889000000,
  appId,
  clientSecret,
  tmpdir = resolve(__dirname, 'tmp'),
  server = {
    host: 'localhost',
    port: 80,
  },
  isPrivate = false,
}) => {
  const bot = new QQBot({
    appId,
    clientSecret,
    isPrivate,
  })
  if (!existsSync(tmpdir)) {
    mkdirSync(tmpdir, { recursive: true })
  }
  const urlServer = initServer(tmpdir, server.port)
  bot.on(OpCode.Dispatch, async event => {
    const ev = await toMiraiEvent(event, bot)
    // console.log(event, ev)
    if (ev) instance.emitEventListener(ev.type, ev)
  })
  const events = {
    message: []
  }
  const instance = {
    __bot: bot,
    qq,
    listen () {
      // We don't need to do any thing
      return
    },
    on (name, callback) {
      if (name === 'message') return instance.onMessage(callback)
      return instance.onEvent(name, callback)
    },
    onMessage (callback) {
      return instance.onEvent('message', callback)
    },
    onEvent (name, callback) {
      if (!events[name]) events[name] = []
      events[name].push(callback)
    },
    async emitEventListener (name, event) {
      if (name.endsWith('Message')) {
        for (const handler of events.message) {
          await handler(event)
        }
      }
      if (!Array.isArray(events[name])) return
      for (const handler of events[name]) {
        await handler(event, instance)
      }
    },
    /**
     * @param { string|Buffer|ReadableStream } image
     * @param { NodeMirai.message } message
     */
    async uploadImage (image, message) {
      const imageId = randomBytes(8).toString('hex')
      const url = `http://${server.host}:${server.port}/image/${imageId}`
      const localPath = resolve(tmpdir, imageId)
      const moved = await moveFileTo(image, localPath)
      // const toUpload = typeof image === 'string'
      //   ? readFileSync(image, 'base64url')
      //   : image instanceof Buffer
      //     ? image.toString('base64url')
      //     : (await streamToBuffer(image)).toString('base64url')
      const res = await bot._sendRequestPack(`${message.__meta.api}files`, {
        file_type: 1,
        url,
        srv_send_msg: false,
      })
      // console.log('__res__', res)
      return {
        // url,
        imageId: res,
      }
    },
    async sendImageMessage (image, message) {
      const img = await this.uploadImage(image, message)
      return bot._sendRequestPack(`${message.__meta.api}messages`, {
        // content: ' ',
        msg_type: 7,
        // media: img.imageId,
        media: img.imageId,
        msg_id: message.__meta.msg_id,
        msg_seq: message.__meta.msg_seq++,
      })
    },
    async sendMarkdown (md, message) {
      const api = message.__meta.api
      return bot._sendRequestPack(`${api}messages`, {
        msg_type: 2,
        markdown: md,
        // msg_id: message.__meta.msg_id,
      })
    },
    async getAvatar (senderId = 0) {
      const realId = await idmap.getRealId(senderId)
      if (typeof realId !== 'string') return null
      return `https://q.qlogo.cn/qqapp/${appId}/${realId}/640`
    },
    auth () { },
    verify () { },
    release () { return unsupport('release')},
    fetchMessage () { return unsupport('fetchMessage')},
    sendFriendMessage () { return unsupport('sendFriendMessage') },
    sendGroupMessage () { return unsupport('sendGroupMessage') },
    sendTempMessage () { return unsupport('sendTempMessage') },
    sendVoiceMessage () { return unsupport('sendVoiceMessage') },
    sendFlashImageMessage () { return unsupport('sendFlashImageMessage') },
    uploadVoice () { return unsupport('uploadVoice') },
    sendMessage () { return unsupport('sendMessage') },
    sendQuotedFriendMessage () { return unsupport('sendQuotedFriendMessage') },
    sendQuotedGroupMessage () { return unsupport('sendQuotedGroupMessage') },
    sendQuotedTempMessage () { return unsupport('sendQuotedTempMessage') },
    sendQuotedMessage () { return unsupport('sendQuotedMessage') },
    sendNudge () { return unsupport('sendNudge') },
    reply () { return unsupport('reply') },
    quoteReply () { return unsupport('quoteReply') },
    recall () { return unsupport('recall') },
    getFriendList () { return unsupport('getFriendList') },
    getGroupList () { return unsupport('getGroupList') },
    getBotProfile () { return unsupport('getBotProfile') },
    getFriendProfile () { return unsupport('getFriendProfile') },
    getGroupMemberProfile () { return unsupport('getGroupMemberProfile') },
    getMessageById () { return unsupport('getMessageById') },
    getGroupMemberList () { return unsupport('getGroupMemberList') },
    setGroupMute () { return unsupport('setGroupMute') },
    setGroupUnmute () { return unsupport('setGroupUnmute') },
    setGroupMuteAll () { return unsupport('setGroupMuteAll') },
    setGroupUnmuteAll () { return unsupport('setGroupUnmuteAll') },
    setGroupKick () { return unsupport('setGroupKick') },
    setGroupConfig () { return unsupport('setGroupConfig') },
    setEssense () { return unsupport('setEssense') },
    getGroupConfig () { return unsupport('getGroupConfig') },
    setGroupMemberInfo () { return unsupport('setGroupMemberInfo') },
    getGroupMemberInfo () { return unsupport('getGroupMemberInfo') },
    quit () { return unsupport('quit') },
    handleMemberJoinRequest () { return unsupport('handleMemberJoinRequest') },
    handleBotInvitedJoinGroupRequest () { return unsupport('handleBotInvitedJoinGroupRequest') },
    handleNewFriendRequest () { return unsupport('handleNewFriendRequest') },
    uploadFileAndSend () { return unsupport('uploadFileAndSend') },
    getGroupFileList () { return unsupport('getGroupFileList') },
    getGroupFileInfo () { return unsupport('getGroupFileInfo') },
    renameGroupFile () { return unsupport('renameGroupFile') },
    moveGroupFile () { return unsupport('moveGroupFile') },
    makeDir () { return unsupport('makeDir') },
    deleteGroupFile () { return unsupport('deleteGroupFile') },
    deleteFriend () { return unsupport('deleteFriend') },
    getManagers () { return unsupport('getManagers') },
    getManager () { return unsupport('getManager') },
    registerCommand () { return unsupport('registerCommand') },
    sendCommand () { return unsupport('sendCommand') },
    onSignal () { return unsupport('onSignal') },
    onCommand () { return unsupport('onCommand') },
    startListeningEvents () { return unsupport('startListeningEvents') },
    getPlugins () { return unsupport('getPlugins') },
    use () { return unsupport('use') },
  }
  return instance
}

module.exports = createAdapter
