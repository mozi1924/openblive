export default {
  i18n: {
    live: {
      event: {
        fallback: {
          anonymous_user: '匿名ユーザー',
          viewer: '視聴者',
          gift_user: 'ギフトユーザー',
          gift: 'ギフト',
          guard_user: '艦隊ユーザー',
          guard: '艦隊',
          superchat_user: 'スーパーチャットユーザー',
          superchat: 'スーパーチャット',
          some_viewer: 'ある視聴者'
        },
        interact: {
          enter: '配信ルームに入りました',
          follow: '配信者をフォローしました',
          share: '配信を共有しました',
          unknown: 'インタラクションを発生させました',
          received: 'インタラクションイベントを受信',
          received_v2: 'インタラクションイベントを受信（V2）',
          vote_updated: '投票状態が更新されました'
        },
        gift: {
          sent: 'ギフトを送りました'
        },
        guard: {
          activated: '艦隊を開通しました'
        },
        moderation: {
          superchat_deleted: 'スーパーチャットが削除されました',
          warning: 'ルーム警告を受信',
          cut_off: '配信が中断されました',
          violation_notice: '違反通知',
          room_blocked: 'ミュートされました',
          silent_on: 'ミュートモードが有効',
          silent_off: 'ミュートモードが無効'
        },
        room_change: {
          full: 'ルーム情報が更新されました',
          title: 'ルームタイトルが更新されました'
        },
        guard_honor_update: '千艦状態が更新されました',
        live_started: '配信が開始されました',
        preparing_round: '配信者が一時離席し、ルームは輪播中です',
        preparing: '配信者が準備中です（未配信）',
        danmu_recalled: 'コメントが撤回されました',
        reenter_requested: 'サーバーから再入室要求を受信',
        parse_failed: 'イベント解析に失敗しました'
      }
    }
  },
  room: {
    fatalErrorOccurred: '致命的なエラーが発生しました。再接続するにはページを再読み込みしてください。'
  },
  chat: {
    moderator: '管理者',
    guardLevel1: '総督',
    guardLevel2: '提督',
    guardLevel3: '艦长', // Let's use the standard "艦長" from the original translation file (we saw in the original file line 61 it was 舰长? Wait: original ja.js line 61 has '艦長')
    mirrorMsg: '[ミラー] ',
    sendGift: '{giftName}x{num} を送信',
    membershipTitle: '新規メンバー',
    tickerMembership: 'メンバー'
  }
};
