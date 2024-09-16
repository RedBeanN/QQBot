const createAdapter = require('./src/adapter')

module.exports = class Bot {
  constructor ({
    qq = 3889000000,
    appId,
    clientSecret,
    tmpdir = resolve(__dirname, 'tmp'),
    server = {
      host: 'localhost',
      port: 80,
    },
    isPrivate = false,
    sandbox = false,
  }) {
    const instance = createAdapter({
      qq,
      appId,
      clientSecret,
      tmpdir,
      server,
      isPrivate,
      sandbox,
    })
    return instance
  }
}