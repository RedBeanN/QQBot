const getApiByEvent = (event) => {
  // if is guild channel
  switch (event.t) {
    // if is friend
    case 'C2C_MESSAGE_CREATE':
      return `/v2/users/${event.d.author.user_openid}/`
    // friend event
    case 'FRIEND_ADD':
    case 'C2C_MSG_RECEIVE':
      return `/v2/users/${event.d.openid}/`
    // if is group
    case 'GROUP_AT_MESSAGE_CREATE':
    case 'GROUP_MESSAGE_CREATE':
    case 'GROUP_ADD_ROBOT':
    case 'GROUP_MSG_RECEIVE':
      return `/v2/groups/${event.d.group_openid}/`
    // if is guild private
    case 'DIRECT_MESSAGE_CREATE':
      return `/dms/${event.d.guild_id}/`
    case 'AT_MESSAGE_CREATE':
    case 'MESSAGE_CREATE':
      return `/channels/${event.d.channel_id}/`
  }
}
module.exports = getApiByEvent
