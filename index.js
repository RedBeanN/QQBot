const { resolve } = require('path')
const createAdapter = require('./src/adapter')

module.exports = class Bot {
  /**
   * @param { object } config
   * @param { number } config.qq
   * @param { string } config.appId
   * @param { string } config.clientSecret
   * @param { string } [config.tmpdir]
   * @param { string } [config.dbdir]
   * @param { boolean } [config.isPrivate]
   * @param { boolean } [config.sandbox]
   * @param { object } [config.server]
   * @param { string } config.server.host
   * @param { number } config.server.port
   * @param { { crt: string, key: string } } [config.server.https]
   */
  constructor ({
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
  }) {
    const instance = createAdapter({
      qq,
      appId,
      clientSecret,
      tmpdir,
      dbdir,
      server,
      isPrivate,
      sandbox,
    })
    return instance
  }
}