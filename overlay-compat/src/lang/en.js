export default {
  i18n: {
    live: {
      event: {
        fallback: {
          anonymous_user: 'Anonymous User',
          viewer: 'Viewer',
          gift_user: 'Gift User',
          gift: 'Gift',
          guard_user: 'Guard User',
          guard: 'Guard',
          superchat_user: 'Super Chat User',
          superchat: 'Super Chat',
          some_viewer: 'A viewer'
        },
        interact: {
          enter: 'entered the room',
          follow: 'followed the streamer',
          share: 'shared the stream',
          unknown: 'triggered an interaction',
          received: 'Interaction event received',
          received_v2: 'Interaction event received (V2)',
          vote_updated: 'Vote state updated'
        },
        gift: {
          sent: 'Gift sent'
        },
        guard: {
          activated: 'Guard activated'
        },
        moderation: {
          superchat_deleted: 'Super Chat messages removed',
          warning: 'Room warning received',
          cut_off: 'Live stream has been cut off',
          violation_notice: 'Violation notice',
          room_blocked: 'has been muted',
          silent_on: 'Mute mode enabled',
          silent_off: 'Mute mode disabled'
        },
        room_change: {
          full: 'Room info updated',
          title: 'Room title updated'
        },
        guard_honor_update: 'Thousand-guard status updated',
        live_started: 'Live started',
        preparing_round: 'Streamer temporarily away, room switched to round-play',
        preparing: 'Streamer is preparing (not live yet)',
        danmu_recalled: 'Danmu recalled',
        reenter_requested: 'Server requested re-entering the room',
        parse_failed: 'Event parse failed'
      }
    }
  },
  room: {
    fatalErrorOccurred: 'A fatal error occurred. Please refresh this page to reconnect.'
  },
  chat: {
    moderator: 'Moderator',
    guardLevel1: 'Governor',
    guardLevel2: 'Admiral',
    guardLevel3: 'Captain',
    mirrorMsg: '[Mirror] ',
    sendGift: 'Sent {giftName}x{num}',
    membershipTitle: 'New Member',
    tickerMembership: 'Membership'
  }
}
