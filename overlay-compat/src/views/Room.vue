<template>
  <chat-renderer ref="renderer" :maxNumber="config.maxNumber" :showGiftName="config.showGiftName"></chat-renderer>
</template>

<script>
import * as i18n from '@/i18n'
import { mergeConfig, toBool, toInt, toFloat } from '@/utils'
import * as trie from '@/utils/trie'
import * as chatConfig from '@/api/chatConfig'
import * as chat from '@/api/chat'
import * as chatModels from '@/api/chat/models'
import ChatRenderer from '@/components/ChatRenderer'
import * as constants from '@/components/ChatRenderer/constants'

class DefaultRenderer {
  constructor(rendererVm) {
    this.addMessage = rendererVm.addMessage
    this.delMessages = rendererVm.delMessages
    this.updateMessage = rendererVm.updateMessage
    this.mergeSimilarText = rendererVm.mergeSimilarText
    this.mergeSimilarGift = rendererVm.mergeSimilarGift
  }

  destroy() {
    const dummyFunc = () => {}
    this.addMessage = dummyFunc
    this.delMessages = dummyFunc
    this.updateMessage = dummyFunc
    this.mergeSimilarText = dummyFunc
    this.mergeSimilarGift = dummyFunc
  }
}

export default {
  name: 'Room',
  components: {
    ChatRenderer
  },
  props: {
    roomKeyType: {
      type: Number,
      default: 1
    },
    roomKeyValue: {
      type: [Number, String],
      default: null
    },
    strConfig: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      config: chatConfig.deepCloneDefaultConfig(),
      chatClient: null,
      textEmoticons: [],
      pendingMsgIdToPromise: new Map(),
      renderer: null,
    }
  },
  computed: {
    blockKeywordsTrie() {
      const blockKeywords = this.config.blockKeywords.split('\n')
      const res = new trie.Trie()
      for (const keyword of blockKeywords) {
        if (keyword !== '') {
          res.set(keyword, true)
        }
      }
      return res
    },
    blockUsersSet() {
      let blockUsers = this.config.blockUsers.split('\n')
      blockUsers = blockUsers.filter(user => user !== '')
      return new Set(blockUsers)
    },
    emoticonsTrie() {
      const res = new trie.Trie()
      for (const emoticons of [this.config.emoticons, this.textEmoticons]) {
        for (const emoticon of emoticons) {
          if (emoticon.keyword !== '' && emoticon.url !== '') {
            res.set(emoticon.keyword, emoticon)
          }
        }
      }
      return res
    },
  },
  beforeMount() {
    this.initConfig()
  },
  mounted() {
    this.renderer = new DefaultRenderer(this.$refs.renderer)

    if (document.visibilityState === 'visible') {
      this.init()
    } else {
      // OBS 不可见源也会加载页面，延迟到可见时再连后端，避免并发抖动
      document.addEventListener('visibilitychange', this.onVisibilityChange)
    }
  },
  beforeDestroy() {
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    if (this.chatClient) {
      this.chatClient.stop()
    }
    if (this.renderer) {
      this.renderer.destroy()
    }
  },
  methods: {
    onVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
      this.init()
    },
    async init() {
      const initChatClientPromise = this.initChatClient()
      this.initTextEmoticons()

      try {
        await initChatClientPromise
      } catch (e) {
        console.error('Failed to load room overlay:', e)
        throw e
      }
    },
    initConfig() {
      const locale = this.strConfig.lang
      if (locale) {
        i18n.setLocale(locale)
      }

      let cfg = {}
      for (const key in this.strConfig) {
        if (this.strConfig[key] !== '') {
          cfg[key] = this.strConfig[key]
        }
      }
      cfg = mergeConfig(cfg, chatConfig.deepCloneDefaultConfig())

      cfg.minGiftPrice = toFloat(cfg.minGiftPrice, chatConfig.DEFAULT_CONFIG.minGiftPrice)
      cfg.showDanmaku = toBool(cfg.showDanmaku)
      cfg.showGift = toBool(cfg.showGift)
      cfg.showGiftName = toBool(cfg.showGiftName)
      cfg.mergeSimilarDanmaku = toBool(cfg.mergeSimilarDanmaku)
      cfg.mergeGift = toBool(cfg.mergeGift)
      cfg.maxNumber = toInt(cfg.maxNumber, chatConfig.DEFAULT_CONFIG.maxNumber)

      cfg.blockGiftDanmaku = toBool(cfg.blockGiftDanmaku)
      cfg.blockMirrorMessages = toBool(cfg.blockMirrorMessages)
      cfg.blockLevel = toInt(cfg.blockLevel, chatConfig.DEFAULT_CONFIG.blockLevel)
      cfg.blockNewbie = toBool(cfg.blockNewbie)
      cfg.blockNotMobileVerified = toBool(cfg.blockNotMobileVerified)
      cfg.blockMedalLevel = toInt(cfg.blockMedalLevel, chatConfig.DEFAULT_CONFIG.blockMedalLevel)

      cfg.showDebugMessages = toBool(cfg.showDebugMessages)
      cfg.autoTranslate = toBool(cfg.autoTranslate)
      cfg.emoticons = this.toObjIfJson(cfg.emoticons)

      chatConfig.sanitizeConfig(cfg)
      this.config = cfg
    },
    toObjIfJson(str) {
      if (typeof str !== 'string') {
        return str
      }
      try {
        return JSON.parse(str)
      } catch {
        return {}
      }
    },
    async initChatClient() {
      const roomKey = {
        type: this.roomKeyType,
        value: this.roomKeyValue ?? 1
      }
      const ChatClientRelay = (await import('@/api/chat/ChatClientRelay')).default
      this.chatClient = new ChatClientRelay(roomKey, this.config.autoTranslate)

      this.chatClient.msgHandler = this
      this.chatClient.start()
    },
    async initTextEmoticons() {
      this.textEmoticons = await chat.getTextEmoticons()
    },

    onAddText(data) {
      const promise = this.doOnAddText(data).catch(() => {})
      const id = data.id
      this.pendingMsgIdToPromise.set(id, promise)
      promise.finally(() => {
        this.pendingMsgIdToPromise.delete(id)
      })
    },
    async ensureMessageSent(id) {
      const promise = this.pendingMsgIdToPromise.get(id)
      if (promise !== undefined) {
        return promise
      }
    },
    async doOnAddText(data) {
      if (!this.config.showDanmaku || !this.filterTextMessage(data)) {
        return
      }
      const contentParts = await this.parseContentParts(data)
      if (this.mergeSimilarText(data.content)) {
        return
      }

      const message = {
        id: data.id,
        type: constants.MESSAGE_TYPE_TEXT,
        avatarUrl: data.avatarUrl,
        time: new Date(data.timestamp * 1000),
        authorName: data.authorName,
        authorType: data.authorType,
        content: data.content,
        contentParts,
        privilegeType: data.privilegeType,
        repeated: 1,
        translation: this.config.autoTranslate ? data.translation : '',
        isMirror: data.isMirror,
        uid: data.uid,
        medalLevel: data.medalLevel,
        medalName: data.medalName,
      }
      this.renderer.addMessage(message)
    },
    onAddGift(data) {
      if (!this.config.showGift) {
        return
      }
      const price = data.totalCoin / 1000
      if (this.mergeSimilarGift(data.authorName, price, data.totalFreeCoin, data.giftName, data.num)) {
        return
      }
      if (price < this.config.minGiftPrice) {
        return
      }

      const message = {
        id: data.id,
        type: constants.MESSAGE_TYPE_GIFT,
        avatarUrl: data.avatarUrl,
        time: new Date(data.timestamp * 1000),
        authorName: data.authorName,
        authorNamePronunciation: '',
        price,
        giftName: data.giftName,
        num: data.num,
        totalFreeCoin: data.totalFreeCoin,
        giftId: data.giftId,
        giftIconUrl: data.giftIconUrl,
        uid: data.uid,
        privilegeType: data.privilegeType,
        medalLevel: data.medalLevel,
        medalName: data.medalName,
      }
      this.renderer.addMessage(message)
    },
    onAddMember(data) {
      if (!this.config.showGift || !this.filterNewMemberMessage(data)) {
        return
      }

      const message = {
        id: data.id,
        type: constants.MESSAGE_TYPE_MEMBER,
        avatarUrl: data.avatarUrl,
        time: new Date(data.timestamp * 1000),
        authorName: data.authorName,
        authorNamePronunciation: '',
        privilegeType: data.privilegeType,
        title: this.$t('chat.membershipTitle'),
        num: data.num,
        unit: data.unit,
        price: data.totalCoin / 1000,
        uid: data.uid,
        medalLevel: data.medalLevel,
        medalName: data.medalName,
      }
      this.renderer.addMessage(message)
    },
    onAddSuperChat(data) {
      if (!this.config.showGift || !this.filterSuperChatMessage(data)) {
        return
      }
      if (data.price < this.config.minGiftPrice) {
        return
      }

      const message = {
        id: data.id,
        type: constants.MESSAGE_TYPE_SUPER_CHAT,
        avatarUrl: data.avatarUrl,
        authorName: data.authorName,
        authorNamePronunciation: '',
        price: data.price,
        time: new Date(data.timestamp * 1000),
        content: data.content.trim(),
        translation: this.config.autoTranslate ? data.translation : '',
        uid: data.uid,
        privilegeType: data.privilegeType,
        medalLevel: data.medalLevel,
        medalName: data.medalName,
      }
      this.renderer.addMessage(message)
    },
    async onDelSuperChat(data) {
      await Promise.all(data.ids.map(this.ensureMessageSent))
      this.renderer.delMessages(data.ids)
    },
    async onUpdateTranslation(data) {
      if (!this.config.autoTranslate) {
        return
      }
      await this.ensureMessageSent(data.id)
      this.renderer.updateMessage(data.id, { translation: data.translation })
    },
    onFatalError(error) {
      console.error('Overlay fatal error:', error)
      this.onAddText(new chatModels.AddTextMsg({
        authorName: 'blivechat',
        authorType: constants.AUTHOR_TYPE_ADMIN,
        content: this.$t('room.fatalErrorOccurred'),
        authorLevel: 60,
      }))
    },
    onDebugMsg(data) {
      if (!this.config.showDebugMessages) {
        return
      }
      this.onAddText(new chatModels.AddTextMsg({
        authorName: 'blivechat',
        authorType: constants.AUTHOR_TYPE_ADMIN,
        content: data.content,
        authorLevel: 60,
      }))
    },

    filterTextMessage(data) {
      if (this.config.blockGiftDanmaku && data.isGiftDanmaku) {
        return false
      } else if (this.config.blockMirrorMessages && data.isMirror) {
        return false
      } else if (this.config.blockLevel > 0 && data.authorLevel < this.config.blockLevel) {
        return false
      } else if (this.config.blockNewbie && data.isNewbie) {
        return false
      } else if (this.config.blockNotMobileVerified && !data.isMobileVerified) {
        return false
      } else if (this.config.blockMedalLevel > 0 && data.medalLevel < this.config.blockMedalLevel) {
        return false
      }
      return this.filterByContent(data.content) && this.filterByAuthorName(data.authorName)
    },
    filterSuperChatMessage(data) {
      return this.filterByContent(data.content) && this.filterByAuthorName(data.authorName)
    },
    filterNewMemberMessage(data) {
      return this.filterByAuthorName(data.authorName)
    },
    filterByContent(content) {
      const blockKeywordsTrie = this.blockKeywordsTrie
      for (let i = 0; i < content.length; i++) {
        const remainContent = content.substring(i)
        if (blockKeywordsTrie.lazyMatch(remainContent) !== null) {
          return false
        }
      }
      return true
    },
    filterByAuthorName(authorName) {
      return !this.blockUsersSet.has(authorName)
    },
    mergeSimilarText(content) {
      if (!this.config.mergeSimilarDanmaku) {
        return false
      }
      return this.renderer.mergeSimilarText(content)
    },
    mergeSimilarGift(authorName, price, freePrice, giftName, num) {
      if (!this.config.mergeGift) {
        return false
      }
      return this.renderer.mergeSimilarGift(authorName, price, freePrice, giftName, num)
    },
    async parseContentParts(data) {
      const contentParts = []

      if (data.emoticon !== null) {
        contentParts.push({
          type: constants.CONTENT_PART_TYPE_IMAGE,
          text: data.content,
          url: data.emoticon,
          width: 0,
          height: 0
        })
        await this.fillImageContentSizes(contentParts)
        return contentParts
      }

      if (this.config.emoticons.length === 0 && this.textEmoticons.length === 0) {
        contentParts.push({
          type: constants.CONTENT_PART_TYPE_TEXT,
          text: data.content
        })
        return contentParts
      }

      const emoticonsTrie = this.emoticonsTrie
      let startPos = 0
      let pos = 0
      while (pos < data.content.length) {
        const remainContent = data.content.substring(pos)
        const matchEmoticon = emoticonsTrie.lazyMatch(remainContent)
        if (matchEmoticon === null) {
          pos++
          continue
        }

        if (pos !== startPos) {
          contentParts.push({
            type: constants.CONTENT_PART_TYPE_TEXT,
            text: data.content.slice(startPos, pos)
          })
        }

        contentParts.push({
          type: constants.CONTENT_PART_TYPE_IMAGE,
          text: matchEmoticon.keyword,
          url: matchEmoticon.url,
          width: 0,
          height: 0
        })
        pos += matchEmoticon.keyword.length
        startPos = pos
      }

      if (pos !== startPos) {
        contentParts.push({
          type: constants.CONTENT_PART_TYPE_TEXT,
          text: data.content.slice(startPos, pos)
        })
      }

      await this.fillImageContentSizes(contentParts)
      return contentParts
    },
    async fillImageContentSizes(contentParts) {
      const urlSizeMap = new Map()
      for (const content of contentParts) {
        if (content.type === constants.CONTENT_PART_TYPE_IMAGE) {
          urlSizeMap.set(content.url, { width: 0, height: 0 })
        }
      }
      if (urlSizeMap.size === 0) {
        return
      }

      const promises = []
      for (const url of urlSizeMap.keys()) {
        const urlInClosure = url
        promises.push(new Promise(resolve => {
          const img = document.createElement('img')
          img.onload = () => {
            const size = urlSizeMap.get(urlInClosure)
            size.width = img.naturalWidth
            size.height = img.naturalHeight
            resolve()
          }
          img.onerror = resolve
          window.setTimeout(resolve, 5000)
          img.src = urlInClosure
        }))
      }
      await Promise.all(promises)

      for (const content of contentParts) {
        if (content.type === constants.CONTENT_PART_TYPE_IMAGE) {
          const size = urlSizeMap.get(content.url)
          content.width = size.width
          content.height = size.height
        }
      }
    }
  }
}
</script>
