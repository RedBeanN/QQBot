const axios = require('axios').default

const getAccessToken = async ({
  appId = '',
  clientSecret = ''
}) => {
  const { data } = await axios.post('https://bots.qq.com/app/getAppAccessToken', {
    appId,
    clientSecret
  })
  return data?.access_token || ''
}

module.exports = getAccessToken
