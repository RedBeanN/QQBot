const { WebSocket, CLOSED, OPEN } = require('ws')
const { default: axios } = require('axios')
const getAccessToken = require('./auth/getAccessToken')
const getGateway = require('./auth/getGateway')
const { getClient } = require('./auth/getGateway')
const { OpCode } = require('./types')
const { resolve } = require('path')

const debug = require('debug')('qqbot')

const symAppId = Symbol('appId')
const symSecret = Symbol('clientSecret')

/**
 * @typedef { (event: any) => any } Handler
 */

class QQBot {
  /**
   * @param { object } config
   * @param { string } config.appId
   * @param { string } config.clientSecret
   * @param { number } config.server
   * @param { boolean } [config.isPrivate]
   * @param { boolean } [config.sandbox]
   */
  constructor ({
    appId,
    clientSecret,
    server,
    isPrivate = false,
    sandbox = false,
  }) {
    this[symAppId] = appId
    this[symSecret] = clientSecret
    this.sandboxMode = sandbox
    this.accessToken = ''
    this.accessTokenExpires = Date.now()
    /** @type { Map<number, Handler[]> } */
    this.eventHandlers = new Map()
    this.isPrivate = isPrivate
    this.syncCode = -1
    this.heartbeat = null
    this.sessionId = ''
    this.initted = false
    this.resuming = false
    this.server = server || '127.0.0.1'
    this.init()
  }
  get intents () {
    // const vals = [0, 1, 10, 12, 26, 27, 29]
    const vals = [0]
    if (this.isPrivate) {
      vals.push(9, 28)
    } else {
      vals.push(25, 30)
    }
    return vals.map(i => 1 << i).reduce((p, c) => p + c, 0)
  }
  async refreshAccessToken (force = false) {
    if (Date.now() < this.accessTokenExpires) {
      // 初始化的时候要强制刷新，否则返回现有的
      if (!force) {
        // debug(`Use old access token since not expired`)
        return this.accessToken
      }
    }
    const data = await getAccessToken({
      appId: this[symAppId],
      clientSecret: this[symSecret]
    })
    this.accessToken = data.access_token
    const time = new Date()
    // 到期前的60秒内才会刷新
    time.setSeconds(time.getSeconds() + Number(data.expires_in) - 50)
    debug(`Updated access token. Next time to update: ${time.toLocaleTimeString()}`)
    this.accessTokenExpires = time.valueOf()
    return this.accessToken
  }
  async init () {
    const token = await this.refreshAccessToken(true)
    this.wsGateWay = await getGateway({
      accessToken: token,
      appId: this[symAppId]
    })
    debug('gateway', this.wsGateWay)
    // debug('gateway reset at', this.wsGateWay.session_start_limit.reset_after / 60_000)
    if (this.wsGateWay.session_start_limit.remaining < 1) {
      console.error(`Cannot establish ws connection. Remaining session count is ${this.wsGateWay.session_start_limit.remaining}`)
      const r = this.wsGateWay.session_start_limit.reset_after
      const time = `${Math.floor(r / 3600_000)}h${Math.floor((r % 3600_000) / 60_000)}m${Math.floor((r % 60_000) / 1_000)}s${r % 1000}ms`
      console.error(`The limit will be reset after ${time}`)
      throw new Error('Abort: Session Limit Exceeded')
    }
    if (this.wsClient) {
      this.wsClient.removeAllListeners()
      this.wsClient.close()
      this.wsClient = null
    }
    this.wsClient = new WebSocket(this.wsGateWay.url)
    this.wsClient.on('message', msg => {
      const event = JSON.parse(msg)
      this._onEvent(event)
    })
    this.wsClient.on('close', (code, msg) => {
      debug(`WSClient closed with code ${code}: ${msg.toString()}`)
      // 4009	连接过期，请重连并执行 resume 进行重新连接
      // https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/error-trace/websocket.html
      if (code === 4009) {
        this.init()
      } else if (code === 4908) {
        // Resume duplicate
        // 直接重连
        this.initted = false
        this.init()
      } else {
        console.error(`WSClient closed with code ${code}: ${msg.toString()}`)
        throw new Error('Abort: WS Client Closed.')
      }
    })
    const onHello = (event) => {
      debug('onHello', event)
      this.off(OpCode.Hello, onHello)
      this._sendHeartBeat()
      if (this.initted) {
        this._sendResume()
        this.resuming = false
      } else {
        this._sendIdentify()
      }
      clearInterval(this.heartbeat)
      const interval = event.d?.heartbeat_interval || 30000
      debug(`Set heartbeat interval to ${interval}`)
      this.heartbeat = setInterval(() => {
        this.refreshAccessToken()
        this._sendHeartBeat()
      }, interval)
      setTimeout(() => this._sendHeartBeat(), 500)
      this.initted = true
    }
    this.on(OpCode.Hello, onHello)
  }
  async _sendRequestPack (url, pack) {
    debug('_sendRequestPack', `https://${this.sandboxMode ? 'sandbox.' : ''}api.sgroup.qq.com${url}`, pack)
    const { data } = await axios.post(`https://${this.sandboxMode ? 'sandbox.' : ''}api.sgroup.qq.com${url}`, pack, {
      headers: {
        Authorization: `QQBot ${this.accessToken}`,
        'X-Union-Appid': this[symAppId]
      }
    }).catch(e => {
      console.log(e?.response?.data)
      return {
        data: {
          error: true
        }
      }
    })
    return data
  }
  async _sendWsPack (pack) {
    if (this.wsClient.readyState === CLOSED) { // CLOSED
      debug('_sendWsPack wait for client reconnect', this.wsClient.readyState)
      while (this.wsClient.readyState !== OPEN) { // OPEN
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      debug('_sendWsPack client is ready!')
    }
    if (pack.op !== OpCode['Heartbeat']) {
      debug('_sendWsPack', pack)
    }
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
  async _sendResume () {
    if (this.resuming) {
      debug(`Skip _sendResume since is resuming`)
      return
    }
    this.resuming = true
    const pack ={
      op: OpCode['Resume'],
      d: {
        token: `QQBot ${this.accessToken}`,
        session_id: this.sessionId,
        seq: this.syncCode,
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
    if (event.t === 'READY') {
      const id = event.d?.session_id
      if (id) {
        this.sessionId = id
        this._user = event.d?.user
      }
    } else if (event.t === 'RESUMED') {
      this.resuming = false
      debug(`Resummed`)
    } else if (event.op === 7) { // { op: 7, type: 'Reconnect' }
      debug(`Server dispatch reconnect event`)
      // this._sendResume()
      return
    }
    // console.log('EVT', event)
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
