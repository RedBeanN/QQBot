# QQBot

腾讯官方 [QQ 机器人](https://bot.q.qq.com/wiki/#) 平台 API 的 `NodeJS` 实现, 接口大致与 [`node-mirai-sdk`](https://github.com/RedBeanN/node-mirai) 相仿

## 快速入门

### 注册官方平台

首先你需要到 [QQ开放平台](https://q.qq.com/) 注册并创建一个机器人, 然后在机器人管理端的开发→开发设置中找到 `机器人QQ号` `AppID` `AppSecret`(首次使用需要重新生成, 请注意保管好该Secret)并保存下来

### 安装

```sh
npm install qqbot # use npm
yarn add qqbot # use yarn

```

### 开始使用

```js
// index.js
const { resolve } = require('path')
const { createReadStream } = require('fs')
const Bot = require('qqbot')

const qq = 'YOUR_QQ'
const appId = 'YOUR_APP_ID'
const clientSecret = 'YOUR_CLIENT_SECRET'

const bot = new Bot({
  qq,
  appId,
  clientSecret,
  tmpdir: resolve(__dirname, 'tmp'),
  /**
   * 用于发送 url, 需要 ssl, TODO
   */
  server: {
    host: 'localhost',
    port: 80,
  },
  isPrivate: false,
  // 新创建的机器人强制公网ip, 开发时需要设置sandbox=true才能在非公网环境下连接
  sandbox: true,
})
bot.onMessage(async message => {
  console.log('onMessage', message)
  /**
   * 收到的信息大致如下
   * {
   *   type: 'FriendMessage',
   *   messageId: 1,
   *   sender: {
   *     id: 12345,             // 由本地自动生成的int id, 不是qq号
   *     name: 'ABCDABCDABCD',  // 这是平台返回的原始openid
   *     remark: 'ABCDABCDABCD' // 同上, 用户头像`https://q.qlogo.cn/qqapp/${appId}/${realId}/640`
   *   },
   *   messageChain: [ { type: 'Plain', text: 'test' } ],
   *   reply: [AsyncFunction: reply],
   *   __meta: // 内部使用，无需关心
   * }
   */
  // 复读用户发的内容
  message.reply(message.messageChain)
  // 回复文字
  message.reply('测试文字')
  const imageToSend = resolve(__dirname, 'test.jpg')
  // 发送图片, 注意要把 message 作为参数传进去, 发给好友和群的接口是不同的
  bot.sendImageMessage(imageToSend, message)
  // 先上传图片获取图片信息
  const image = await bot.uploadImage(imageToSend, message)
  const image2 = await bot.uploadImage(createReadStream(), message)
  // 回复图文
  // 注意图片只能一张一张发，所以图文混合会分段发送，单次发送是一张图片+一段文字
  // 平台规定单条消息最多只能回复5次, 多了会报错
  message.reply([image, '一些文字', image2, '另一些文字'])
})
```

```sh
node index.js
```

### 测试

```sh
export DEBUG=qqbot # macOS / Linux / Unix
$env:DEBUG="qqbot" # Windows PowerShell
node index.js
```

## 其他说明

### 关于 `idmap`

由于官方 API 返回的 `openid` 是一串字符串, 大部分机器人框架是用的是 qq 号, 为了便于使用, `QQBot` 内部使用 `idmap` 来将 `openid` 映射到唯一的 `int id`.

如果你需要自己更新 `id` (比如让用户自行绑定 qq 号), 可以直接引入 `idmap` 模块进行修改.

```js
const idmap = require('qqbot/src/db/idmap')
// 获取 int id 对应的 openid
const realId = await idmap.getRealId(12345)
// 获取 openid 对应的 int id, 如果不存在会立即创建一个新的 int id
const virtualId = await idmap.getVirtualId('ABCDABCD')
// 更新 int id, 原本 id 是 12345 的用户现在会变成 23456
await idmap.updateVirtualId(12345, 23456)
```

### 关于 `urlmap`

官方要求机器人发送的 url 必须是管理端设置好的消息 url (管理端→开发→开发设置→消息url设置), `QQBot` 会自动转化 url 为你的本地 url, 需要的配置为

```js
const bot = new Bot({
  server: {
    host: 'server_address',
    port: 443,
    certs: {
      key: './https.key',
      crt: './https.crt'
    }
  },
  // ...
})
```

由于官方强制 https, 你需要自建 https 服务并把 `/url` 重定向到对应的 `${server.host}:${server.port}/url`, 或者传入 `https` 证书由 `QQBot` 处理.

请注意: 你的 `server_address` 必须是已ICP备案的域名, 且 ssl 证书不能过期.
*邮箱也会被当成url, 别发*

你可以从 `qqbot/src/db/urlmap` 中获得相关的接口用于管理你自己的 url

```js
const urlmap = require('qqbot/src/db/urlmap')
// 获取 url 对应的 hash, 没有会创建新的
const hash = await urlmap.getHash(url)
// 获取 hash 对应的 url, 没有找到时返回的是 { error: true }
const url = await urlmap.getUrl(hash)
```
