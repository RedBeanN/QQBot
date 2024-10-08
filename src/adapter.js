const QQBot = require(".")
const { toMiraiEvent } = require("./toMiraiEvent")
const { OpCode } = require("./types")
const { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync, createWriteStream, createReadStream } = require('fs')
const { randomBytes, createHash } = require('crypto')
const { resolve, basename, extname } = require('path')
const initServer = require('./server')
const idmap = require('./db/idmap')
const { Readable } = require('stream')

const md5 = str => createHash('md5').update(str).digest('hex')
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
  dbdir = resolve(__dirname, 'db'),
  server = {
    host: 'localhost',
    port: 80,
    https: null,
  },
  isPrivate = false,
  sandbox = false,
}) => {
  idmap._baseDir = dbdir
  const bot = new QQBot({
    qq,
    appId,
    clientSecret,
    server,
    isPrivate,
    sandbox,
    tmpdir,
  })
  if (!existsSync(tmpdir)) {
    mkdirSync(tmpdir, { recursive: true })
  }
  const urlServer = initServer(tmpdir, server.port, server.https)
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
      switch (name) {
        case 'groupAdd':
          return instance.onEvent('joinGroup', callback)
        case 'groupDelete':
          return instance.onEvent('leaveKick', callback)
        default:
          return instance.onEvent(name, callback)
      }
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
          await handler(event, instance)
        }
      }
      if (!Array.isArray(events[name])) return
      for (const handler of events[name]) {
        await handler(event, instance)
      }
    },
    async uploadImage (image, message) {
      if (message.__meta.api.includes('/channels/') || message.__meta.api?.includes('/dms')) {
        // use multipart/form-data to upload
        const toUpload = typeof image === 'string'
          ? createReadStream(image)
          : image instanceof Buffer
            ? Readable.from(image)
            : image
        return {
          type: 'Image',
          url: toUpload,
        }
      }
      // if (message.__meta.api?.includes('/dms')) {
      //   const uid = randomBytes(8).toString('hex')
      //   const imageId = typeof image === 'string'
      //     ? uid + extname(image)
      //     : uid + '.png'
      //   const dist = resolve(tmpdir, imageId)
      //   const toUpload = typeof image === 'string'
      //     ? copyFileSync(image, dist)
      //     : image instanceof Buffer
      //       ? writeFileSync(dist, image)
      //       : writeFileSync(dist, (await streamToBuffer(image)))
      //   return {
      //     type: 'Image',
      //     url: `https://${bot.server}/image/${imageId}`,
      //   }
      // }
      const toUpload = typeof image === 'string'
        ? readFileSync(image, 'base64')
        : image instanceof Buffer
          ? image.toString('base64')
          : (await streamToBuffer(image)).toString('base64')
      const imageId = await bot._sendRequestPack(`${message.__meta.api}files`, {
        file_type: 1,
        srv_send_msg: false,
        file_data: toUpload,
      })
      return {
        type: 'Image',
        imageId,
      }
      // Old version: use url. Tencent will use this url to download image.
      // const imageId = randomBytes(8).toString('hex')
      // const url = `http://${server.host}:${server.port}/image/${imageId}`
      // const localPath = resolve(tmpdir, imageId)
      // const moved = await moveFileTo(image, localPath)
      // const res = await bot._sendRequestPack(`${message.__meta.api}files`, {
      //   file_type: 1,
      //   url,
      //   srv_send_msg: false,
      // })
      // // console.log('__res__', res)
      // return {
      //   // url,
      //   imageId: res,
      // }
    },
    async sendImageMessage (image, message) {
      const img = await this.uploadImage(image, message)
      const pack = message.__meta.api?.includes('/channel') || message.__meta.api?.includes('/dms') ? {
        file_image: img.url,
        msg_id: message.__meta.msg_id,
      } : {
        // content: ' ',
        msg_type: 7,
        // media: img.imageId,
        media: img.imageId,
        msg_id: message.__meta.msg_id,
        msg_seq: message.__meta.msg_seq++,
      }
      return bot._sendRequestPack(`${message.__meta.api}messages`, pack)
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
    getGroupList () { return [] },
    getBotProfile () { return unsupport('getBotProfile') },
    getFriendProfile () { return unsupport('getFriendProfile') },
    getGroupMemberProfile () { return unsupport('getGroupMemberProfile') },
    getMessageById () { return unsupport('getMessageById') },
    getGroupMemberList () { return [] },
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
    onSignal () { },
    onCommand () { return unsupport('onCommand') },
    startListeningEvents () { return unsupport('startListeningEvents') },
    // plugins
    // 这个插件系统需要大量改进
    plugins: [],
    getPlugins () {
      return this.plugins.map(i => i.name);
    },
    use (plugin) {
      if (!plugin.name || typeof plugin.name !== 'string' || plugin.name.length === 0) throw new Error(`[NodeMirai] Invalid plugin name ${plugin.name}. Plugin name must be a string.`);
      if (!plugin.callback || typeof plugin.callback !== 'function') throw new Error('[NodeMirai] Invalid plugin callback. Plugin callback must be a function.');
      if (this.getPlugins().includes(plugin.name)) throw new Error(`[NodeMirai] Duplicate plugin name ${plugin.name}`);
      this.plugins.push(plugin);
      // TODO: support string[]
      const event = typeof plugin.subscribe === 'string' ? plugin.subscribe : 'message';
      this.on(event, plugin.callback);
      console.log(`[NodeMirai] Installed plugin [ ${plugin.name} ]`);
    },
    remove (pluginName) {
      const pluginNames = this.getPlugins();
      if (pluginNames.includes(pluginName)) {
        const plugin = this.plugins[pluginNames.indexOf(pluginName)];
        for (let event in this.eventListeners) {
          for (let i in this.eventListeners[event]) {
            if (this.eventListeners.message[i] === plugin.callback) {
              this.eventListeners.message.splice(i, 1);
              console.log(`[NodeMirai] Uninstalled plugin [ ${plugin.name} ]`);
            }
          }
        }
      }
    }
  }
  return instance
}

module.exports = createAdapter
