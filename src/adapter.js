const NodeMirai = require("node-mirai-sdk")
const QQBot = require(".")
const { toMiraiEvent } = require("./toMiraiEvent")
const { OpCode } = require("./types")
const { readFileSync } = require('fs')

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

const createAdapter = (appId, secret, isPrivate = true) => {
  const bot = new QQBot(appId, secret, isPrivate)
  bot.on(OpCode.Dispatch, event => {
    const ev = toMiraiEvent(event, bot)
    console.log(event, ev)
    if (ev) instance.emitEventListener(ev.type, ev)
  })
  const events = {
    message: []
  }
  const instance = {
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
      const senderId = message?.sender?.id || message
      if (typeof senderId !== 'number' || isNaN(senderId)) {
        throw new Error(`Error @ uploadImage: Expect pass message with sender.id but got ${senderId}`)
      }
      const toUpload = typeof image === 'string'
        ? 'base64://' + readFileSync(image, 'base64')
        : image instanceof Buffer
          ? 'base64://' + image.toString('base64')
          : 'base64://' + (await streamToBuffer(image)).toString('base64')
      const res = await bot._sendRequestPack(`/v2/users/${senderId}/files`, {
        file_type: 1,
        url: toUpload,
        srv_send_msg: false,
      })
      return {
        url: toUpload,
        imageId: res.file_info,
      }
    },
    async sendImageMessage (image, message) {
      const img = await this.uploadImage(image, message)
      return bot._sendRequestPack(``)
    },
    auth () { return unsupport('auth')},
    verify () { return unsupport('verify')},
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
