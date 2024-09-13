const getApiByEvent = (event) => {
  // if is guild channel
  switch (event.t) {
    case 'C2C_MESSAGE_CREATE':
      // if is friend
      return `/v2/users/${event.d.author.user_openid}/`
    case 'GROUP_AT_MESSAGE_CREATE':
      // if is group
      return `/v2/groups/${event.d.group_openid}/`
    case 'DIRECT_MESSAGE_CREATE':
      // if is guild private
      return `/dms/${event.d.author.id}`
    case 'AT_MESSAGE_CREATE':
    case 'MESSAGE_CREATE':
      return `/channels/${event.d.channel_d}/`
  }
}
module.exports = getApiByEvent
