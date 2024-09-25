const express = require('express')
const urlmap = require('../db/urlmap')
const { resolve } = require('path')
const { existsSync, unlink, readFileSync } = require('fs')
const { createServer } = require('https')

const debug = require('debug')('apiserver')
const initServer = (tmpdir = resolve(__dirname, 'tmp'), port = 25635, credentials) => {
  const app = express()
  app.get('/url/:hash', async (req, res) => {
    debug('[Server]', 'url', req.params.hash)
    if (!req.params.hash || req.params.hash.length !== 8) {
      return res.status(404).end('404 Not Found')
    }
    const realUrl = await urlmap.getUrl(req.params.hash)
    debug('[Server]', req.params.hash, realUrl)
    if (typeof realUrl !== 'string') {
      return res.status(404).end('404 Not Found')
    }
    return res.redirect(301, realUrl)
  })
  app.get('/image/:imageId', async (req, res) => {
    const filepath = resolve(tmpdir, req.params.imageId)
    debug('[Server]', 'image', req.params.imageId, filepath)
    if (!existsSync(filepath)) {
      return res.status(404).end('404 Not Found')
    }
    res.sendFile(filepath)
    // res.on('close', () => setTimeout(() => unlink(filepath, () => {}), 1000))
  })
  if (typeof credentials === 'object' && credentials.crt && credentials.key) {
    const options = {
      cert: readFileSync(credentials.crt).toString(),
      key: readFileSync(credentials.key).toString(),
    }
    const server = createServer(options, app)
    server.listen(port)
  } else {
    app.listen(port)
  }
}
module.exports = initServer
