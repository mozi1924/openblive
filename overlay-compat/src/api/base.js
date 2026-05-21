import axios from 'axios'

axios.defaults.timeout = 10 * 1000

export const apiClient = axios.create({
  timeout: 10 * 1000,
})

export function init() {}

const onRequest = config => {
  config.baseURL = getBaseUrl()
  return config
}

const onRequestError = e => {
  throw e
}

apiClient.interceptors.request.use(onRequest, onRequestError, { synchronous: true })

export async function ensureBaseUrlInited() {}

export function getBaseUrl() {
  return window.location.origin
}
