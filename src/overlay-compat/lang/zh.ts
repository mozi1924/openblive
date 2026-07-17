export default {
  i18n: {
    live: {
      event: {
        fallback: {
          anonymous_user: '匿名用户',
          viewer: '观众',
          gift_user: '礼物用户',
          gift: '礼物',
          guard_user: '舰长用户',
          guard: '舰长',
          superchat_user: '醒目留言用户',
          superchat: '醒目留言',
          some_viewer: '某观众'
        },
        interact: {
          enter: '进入了直播间',
          follow: '关注了主播',
          share: '分享了直播间',
          unknown: '触发了互动',
          received: '收到互动事件',
          received_v2: '收到互动事件（V2）',
          vote_updated: '投票状态已更新'
        },
        gift: {
          sent: '送出礼物'
        },
        guard: {
          activated: '开通了大航海'
        },
        moderation: {
          superchat_deleted: '移除醒目留言',
          warning: '直播间收到警告',
          cut_off: '直播已被切断',
          violation_notice: '违规提示',
          room_blocked: '已被禁言',
          silent_on: '已开启禁言',
          silent_off: '已关闭禁言'
        },
        room_change: {
          full: '直播间信息更新',
          title: '直播间标题更新'
        },
        guard_honor_update: '千舰状态更新',
        live_started: '直播已开始',
        preparing_round: '主播暂时离开，直播间进入轮播',
        preparing: '主播准备中（暂未开播）',
        danmu_recalled: '弹幕被撤回',
        reenter_requested: '服务端请求重进直播间',
        parse_failed: '事件解析失败'
      }
    }
  },
  room: {
    fatalErrorOccurred: '发生了致命错误，请刷新页面以重新连接'
  },
  chat: {
    moderator: '管理员',
    guardLevel1: '总督',
    guardLevel2: '提督',
    guardLevel3: '舰长',
    mirrorMsg: '[跨房] ',
    sendGift: '赠送 {giftName}x{num}',
    membershipTitle: '新会员',
    tickerMembership: '会员'
  }
};
