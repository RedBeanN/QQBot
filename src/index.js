const { WebSocket } = require('ws')
const { default: axios } = require('axios')
const getAccessToken = require('./auth/getAccessToken')
const getGateway = require('./auth/getGateway')
const { getClient } = require('./auth/getGateway')
const { OpCode } = require('./types')

const debug = require('debug')('qqbot')

const symAppId = Symbol('appId')
const symSecret = Symbol('clientSecret')

/**
 * @typedef { (event: any) => any } Handler
 */

class QQBot {
  /**
   * @param { string } appId
   * @param { string } clientSecret
   * @param { boolean } [isPrivate]
   */
  constructor (appId, clientSecret, isPrivate = false) {
    this[symAppId] = appId
    this[symSecret] = clientSecret
    this.accessToken = ''
    /** @type { Map<number, Handler[]> } */
    this.eventHandlers = new Map()
    this.isPrivate = isPrivate
    this.syncCode = -1
    this.heartbeat = null
    this.init()
  }
  get intents () {
    // const vals = [0, 1, 10, 12, 26, 27, 29]
    const vals = [0]
    if (this.isPrivate) {
      vals.push(9, 28)
    } else {
      vals.push(30)
    }
    return vals.map(i => 1 << i).reduce((p, c) => p + c, 0)
  }
  async refreshAccessToken () {
    this.accessToken = await getAccessToken({
      appId: this[symAppId],
      clientSecret: this[symSecret]
    })
    return this.accessToken
  }
  async init () {
    const token = await this.refreshAccessToken()
    this.wsGateWay = await getGateway({
      accessToken: token,
      appId: this[symAppId]
    })
    debug('gateway', this.wsGateWay)
    this.wsClient = new WebSocket(this.wsGateWay.url)
    this.wsClient.on('message', msg => {
      const event = JSON.parse(msg)
      this._onEvent(event)
    })
    const onHello = (event) => {
      debug('onHello', event)
      this.off(onHello)
      this._sendIdentify()
      clearInterval(this.heartbeat)
      this.heartbeat = setInterval(() => {
        this._sendHeartBeat()
      }, 30000)
    }
    this.on(OpCode.Hello, onHello)
  }
  async _sendRequestPack (url, pack) {
    debug('_sendRequestPack', url, pack)
    const { data } = await axios.post(`https://api.sgroup.qq.com${url}`, pack, {
      headers: {
        Authorization: `QQBot ${this.accessToken}`,
        'X-Union-Appid': this[symAppId]
      }
    })
    return data
  }
  async _sendWsPack (pack) {
    debug('_sendWsPack', pack)
    this.wsClient.send(JSON.stringify(pack))
  }
  async _sendIdentify () {
    const pack = {
      op: OpCode['Identify'],
      d: {
        token: 'QQBot ' + this.accessToken,
        intents: this.intents,
        shard: [0, 1], // 不分片
        properties: {
          dev: 'RedBeanN'
        },
      }
    }
    this._sendWsPack(pack)
  }
  async _sendHeartBeat () {
    const pack = {
      op: OpCode['Heartbeat'],
      d: this.syncCode === -1 ? null : this.syncCode
    }
    this._sendWsPack(pack)
  }
  async _onEvent (event) {
    if (typeof event !== 'object' || event === null) return
    const { op, s } = event
    if (typeof s === 'number') this.syncCode = s
    let type = 'Unknown'
    for (const ev in OpCode) {
      if (OpCode[ev] === op) {
        type = ev
        break
      }
    }
    event.type = type
    debug('onEvent', event)
    if (this.eventHandlers.has(op)) {
      let stopped = false
      event.stop = () => {
        stopped = true
      }
      const handlers = this.eventHandlers.get(op)
      for (const handler of handlers) {
        await handler(event)
        if (stopped) break
      }
    }
  }
  /**
   * @param { number } event
   * @param { Handler } callback
   */
  on (event, callback) {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, [])
    const handlers = this.eventHandlers.get(event)
    if (handlers.includes(callback)) return false
    handlers.push(callback)
    return true
  }
  /**
   * @param { number } event
   * @param { Handler } [callback]
   */
  off (event, callback) {
    if (!this.eventHandlers.has(event)) return false
    const handlers = this.eventHandlers.get(event)
    if (!callback) {
      handlers.splice(0)
      return true
    } else {
      const index = handlers.indexOf(callback)
      if (index !== -1) {
        handlers.splice(index, 1)
        return true
      }
      return false
    }
  }
}

module.exports = QQBot
