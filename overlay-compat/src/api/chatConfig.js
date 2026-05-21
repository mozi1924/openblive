import _ from 'lodash'

export const DEFAULT_CONFIG = {
  minGiftPrice: 0.1,
  showDanmaku: true,
  showGift: true,
  showGiftName: false,
  mergeSimilarDanmaku: false,
  mergeGift: true,
  maxNumber: 60,

  blockGiftDanmaku: true,
  blockMirrorMessages: false,
  blockLevel: 0,
  blockNewbie: false,
  blockNotMobileVerified: false,
  blockKeywords: '',
  blockUsers: '',
  blockMedalLevel: 0,

  showDebugMessages: false,
  autoTranslate: false,

  emoticons: [], // [{ keyword: '', url: '' }, ...]
}

export function deepCloneDefaultConfig() {
  return _.cloneDeep(DEFAULT_CONFIG)
}

export function sanitizeConfig(config) {
  let newEmoticons = []
  if (config.emoticons instanceof Array) {
    for (let emoticon of config.emoticons) {
      try {
        let newEmoticon = {
          keyword: emoticon.keyword,
          url: emoticon.url
        }
        if ((typeof newEmoticon.keyword !== 'string') || (typeof newEmoticon.url !== 'string')) {
          continue
        }
        newEmoticons.push(newEmoticon)
      } catch {
        continue
      }
    }
  }
  config.emoticons = newEmoticons
}
