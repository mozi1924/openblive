import Vue from 'vue'
import VueRouter from 'vue-router'

import * as apiBase from './api/base'
import * as i18n from './i18n'
import App from './App'

apiBase.init()

Vue.use(VueRouter)

Vue.config.ignoredElements = [
  /^yt-/
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      name: 'overlay_root',
      component: () => import('./views/Room'),
      props: route => ({
        roomKeyType: 1,
        roomKeyValue: 1,
        strConfig: route.query,
      })
    },
    {
      path: '/room/:roomKeyValue',
      name: 'room',
      component: () => import('./views/Room'),
      props(route) {
        // 兼容旧 URL 结构，但 roomId/authCode 等字段在服务端会被忽略。
        return {
          roomKeyType: 1,
          roomKeyValue: parseInt(route.params.roomKeyValue) || 1,
          strConfig: route.query,
        }
      }
    },
    {
      path: '*',
      redirect: { name: 'overlay_root' }
    }
  ]
})

new Vue({
  render: h => h(App),
  router,
  i18n: i18n.i18n
}).$mount('#app')
