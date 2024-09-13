const express = require('express')
const urlmap = require('../db/urlmap')
const { resolve } = require('path')
const { existsSync, unlink } = require('fs')

const debug = require('debug')('apiserver')
const initServer = (tmpdir = resolve(__dirname, 'tmp'), port = 25635) => {
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
    debug('[Server]', 'image', req.params.imageId)
    const filepath = resolve(tmpdir, req.params.imageId)
    if (!existsSync(filepath)) {
      return res.status(404).end('404 Not Found')
    }
    res.sendFile(filepath)
    res.on('close', () => setTimeout(() => unlink(filepath, () => {}), 1000))
  })
  app.listen(port)
}
module.exports = initServer
