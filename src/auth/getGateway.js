const axios = require('axios').default
const WebSocket = require('ws')

const isDev = !!process.env.DEV
const entry = `wss://${isDev ? 'sandbox.' : ''}api.sgroup.qq.com/websocket/`

/**
 * @typedef GatewayInfo
 * @prop { string } url
 * @prop { number } shards
 * @prop { Object } session_start_limie
 * @prop { number } session_start_limie.total
 * @prop { number } session_start_limie.remaining
 * @prop { number } session_start_limie.reset_after
 * @prop { number } session_start_limie.max_concurrency
 */
/**
 * @returns { GatewayInfo }
 */
const getGateway = async ({
  accessToken = '',
  appId = '',
}) => {
  try {
    const { data } = await axios.get(`https://${isDev ? 'sandbox.' : ''}api.sgroup.qq.com/gateway/bot`, {
      headers: {
        'Authorization': `QQBot ${accessToken}`,
        'X-Union-Appid': appId,
      }
    })
    return data
  } catch (e) {
    console.log('Err!', e.message, accessToken, appId)
  }
}

module.exports = getGateway
// getGateway().then(console.log)