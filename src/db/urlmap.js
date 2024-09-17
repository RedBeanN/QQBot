const { resolve } = require('path')
const sqlite = require('promised-sqlite3')
const { existsSync, mkdirSync } = require('fs')
const { randomBytes } = require('crypto')

/**
 * @typedef UrlMap
 * @prop { string } url
 * @prop { string } hash
 */
const randomHash = () => {
  return randomBytes(4).toString('hex')
}

const urlmap = {
  _baseDir: __dirname,
  _db: null,
  _init (dbDir = urlmap._baseDir) {
    if (urlmap._db) return urlmap._db
    const dbpath = resolve(dbDir, 'db/url.sqlite')
    console.log(`DBPath: ${dbpath}`)
    if (!existsSync(resolve(dbDir, 'db'))) {
      mkdirSync(resolve(dbDir, 'db'), { recursive: true })
    }
    urlmap._db = new Promise(async resolve => {
      const db = await sqlite.AsyncDatabase.open(dbpath)
      await db.run(
        "CREATE TABLE IF NOT EXISTS url (url TEXT PRIMARY KEY UNIQUE, hash TEXT)"
      )
      resolve(db)
    })
    return urlmap._db
  },
  /** @returns { Promise<UrlMap|undefined> } */
  async getByHash (hash = '') {
    const db = await urlmap._init()
    return db.get(
      "SELECT * FROM url WHERE hash = ?",
      hash,
    )
  },
  /** @returns { Promise<UrlMap|undefined> } */
  async getByUrl (url = 0) {
    const db = await urlmap._init()
    return db.get(
      "SELECT * FROM url WHERE url = ?",
      url,
    )
  },
  async createHash () {
    const db = await urlmap._init()
    let hash = randomHash()
    while (true) {
      const fromDb = await urlmap.getByHash(hash)
      if (!fromDb) {
        break
      }
    }
    return hash
  },
  async createHashForUrl (url = '') {
    const db = await urlmap._init()
    const fromDb = await urlmap.getByUrl(url)
    if (fromDb) {
      return fromDb
    }
    const hash = await urlmap.createHash()
    console.log(`Create ${hash} for ${url}`)
    await db.run(
      "INSERT INTO url (hash, url) VALUES (?, ?)",
      hash,
      url,
    )
    return {
      hash, url,
    }
  },
  async getUrl (hash = 0) {
    const url = await urlmap.getByHash(hash)
    if (!url) {
      return {
        error: true,
        message: 'Hash not found'
      }
    }
    return url.url
  },
  async getHash (url = '') {
    const { hash } = await urlmap.createHashForUrl(url)
    return hash
  },
}
module.exports = urlmap
