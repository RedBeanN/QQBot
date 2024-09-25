# QQBot 可用事件类型

## `message`

消息事件

| 字段 | 类型 | 说明 |
| ---- | ---- | --- |
| type | `'GroupMessage'`|`'FriendMessage` | 群聊/私聊 |
| messageId | number | 消息id |
| sender | object | 见下表 |
| messageChain | array | 消息数组 |
| reply | function | 回复此消息的快捷方法 |
| quoteReply | function | 同`reply`, 兼容 `node-mirai-sdk` |

### `sender`

type = `GroupMessage` 时

| 字段 | 类型 | 说明 |
| ---- | ---- | --- |
| id | number | 发送者的虚拟 id |
| memberName | string | 发送者的 openid |
| permission | string | 兼容 `node-mirai-sdk` 的发送者权限, 固定为 `MEMBER` |
| group | object | 群信息 |
| group.id | number | 群组的虚拟 id |
| group.name | string | 群组的 openid |
| group.permission | string | 兼容 `node-mirai-sdk` 的 bot 权限, 固定为 `MEMBER` |

type = `FriendMessage` 时

| 字段 | 类型 | 说明 |
| ---- | ---- | --- |
| id | number | 发送者的虚拟 id |
| name | string | 发送者的 openid |
| remark | string | 发送者的 openid, 兼容 `node-mirai-sdk` |

## `online`

平台发送 `READY` 时触发

| 字段 | 类型 | 说明 |
| ---- | ---- | --- |
| type | 'online' |  |
| qq | number | `new Bot` 时传入的 bot qq 号 |
| user | object | 平台返回的机器人信息 |
| user.id | string | Bot 实例的 id |
| user.username | string | 机器人的名字 |
| user.bot | boolean | 固定为 `true` |
| user.status | number | 固定为 `1` |

## `friendAdd`/`friendDelete`

| 字段 | 类型 | 说明 |
| ---- | ---- | --- |
| type | string | `friendAdd`/`friendDelete` |
| friend | object | 操作对象 |
| friend.id | number | 用户的虚拟 id |
| friend.nickname | string | 用户的 openid |
| friend.remark | string | 用户的 openid |
| reply | function | 仅 `friendAdd` 可用, 回复被动消息 |

用户将机器人添加到消息列表/删除机器人

## `joinGroup`/`leaveKick`

机器人被添加到群/被移出群聊, 这两个事件命名和 `node-mirai-sdk` 一致, 也可以使用 `groupAdd` 和 `groupDelete`, 和好友事件对齐.

| 字段 | 类型 | 说明 |
| ---- | ---- | --- |
| type | string | `joinGroup`/`leaveKick` |
| group | object | 操作群组 |
| group.id | number | 群组的虚拟 id |
| group.name | string | 群组的 openid |
| group.permission | string | 兼容 `node-mirai-sdk` 的 bot 权限, 固定为 `MEMBER` |
| operator | object | 操作用户 |
| operator.id | number | 操作者的虚拟 id |
| operator.memberName | string | 操作者的 openid |
| operator.permission | string | 操作者的权限, 固定为 `ADMINISTRATOR` |
| operator.group | object | 兼容 `node-mirai-sdk`, 和上面的 `group` 字段一致 |
| invitor | object | **joinGroup 特有** 兼容 `node-mirai-sdk`, 和 `operator` 一致 |
| reply | function | 仅 `joinGroup`/`groupAdd` 可用, 回复被动消息 |

## `enablePush`/`disablePush`/`groupEnablePush`/`groupDisablePush`

私聊/群聊中用户开关`允许主动发送消息`, 字段同 `friendAdd` 和 `joinGroup`

`reply` 只能在允许主动消息时发送

## `messageAuditRejected`

*(未测试)* 机器人发送的消息未通过消息审核


| 字段 | 类型 | 说明 |
| ---- | ---- | --- |
| type | string | `messageAuditRejected` |
| data | object | 平台发送的错误信息 |