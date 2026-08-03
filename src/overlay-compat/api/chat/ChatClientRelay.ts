import { ensureBaseUrlInited, getBaseUrl } from "../base";
import * as chat from ".";
import * as chatModels from "./models";

const COMMAND_HEARTBEAT = 0;
const COMMAND_JOIN_ROOM = 1;
const COMMAND_ADD_TEXT = 2;
const COMMAND_ADD_GIFT = 3;
const COMMAND_ADD_MEMBER = 4;
const COMMAND_ADD_SUPER_CHAT = 5;
const COMMAND_DEL_SUPER_CHAT = 6;
const COMMAND_UPDATE_TRANSLATION = 7;
const COMMAND_FATAL_ERROR = 8;

const CONTENT_TYPE_EMOTICON = 1;

const RECEIVE_TIMEOUT = 45 * 1000;
const HEARTBEAT_INTERVAL = 15 * 1000;

export default class ChatClientRelay {
  roomKey: { type: number; value: string | number };
  autoTranslate: boolean;
  msgHandler: chat.MsgHandler;
  websocket: WebSocket | null;
  retryCount: number;
  totalRetryCount: number;
  isDestroying: boolean;
  receiveTimeoutTimerId: any;
  heartbeatTimerId: any;

  constructor(roomKey: { type: number; value: string | number }, autoTranslate: boolean) {
    this.roomKey = roomKey;
    this.autoTranslate = autoTranslate;

    this.msgHandler = chat.getDefaultMsgHandler();

    this.websocket = null;
    this.retryCount = 0;
    this.totalRetryCount = 0;
    this.isDestroying = false;
    this.receiveTimeoutTimerId = null;
    this.heartbeatTimerId = null;
  }

  start() {
    this.wsConnect();
  }

  stop() {
    this.isDestroying = true;
    this.clearTimers();
    if (this.websocket) {
      this.websocket.close();
    }
  }

  clearTimers() {
    if (this.receiveTimeoutTimerId) {
      window.clearTimeout(this.receiveTimeoutTimerId);
      this.receiveTimeoutTimerId = null;
    }
    if (this.heartbeatTimerId) {
      window.clearInterval(this.heartbeatTimerId);
      this.heartbeatTimerId = null;
    }
  }

  addDebugMsg(content: string) {
    this.msgHandler.onDebugMsg(new chatModels.DebugMsg({ content }));
  }

  async wsConnect() {
    if (this.isDestroying) {
      return;
    }

    this.addDebugMsg("Connecting");

    await ensureBaseUrlInited();
    const baseUrl = getBaseUrl();
    if (baseUrl === null) {
      this.addDebugMsg("No available endpoint");
      window.setTimeout(() => this.onWsClose(), 0);
      return;
    }
    const wsBaseUrl = baseUrl.replace(/^http(s?):/, "ws$1:");
    const wsUrl = new URL("/api/chat", wsBaseUrl);
    
    const pageToken = new URL(window.location.href).searchParams.get("token");
    if (pageToken) {
      wsUrl.searchParams.set("token", pageToken);
    }

    this.websocket = new WebSocket(wsUrl.toString());
    this.websocket.onopen = this.onWsOpen.bind(this);
    this.websocket.onclose = this.onWsClose.bind(this);
    this.websocket.onmessage = this.onWsMessage.bind(this);
  }

  onWsOpen() {
    this.addDebugMsg("Connected and authenticating");

    if (this.websocket) {
      this.websocket.send(
        JSON.stringify({
          cmd: COMMAND_JOIN_ROOM,
          data: {
            roomKey: this.roomKey,
            config: {
              autoTranslate: this.autoTranslate,
            },
          },
        })
      );
    }
    this.refreshReceiveTimeoutTimer();
    this.startHeartbeatTimer();
  }

  startHeartbeatTimer() {
    if (this.heartbeatTimerId) {
      window.clearInterval(this.heartbeatTimerId);
    }
    this.heartbeatTimerId = window.setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(
          JSON.stringify({
            cmd: COMMAND_HEARTBEAT,
          })
        );
      }
    }, HEARTBEAT_INTERVAL);
  }

  refreshReceiveTimeoutTimer() {
    if (this.receiveTimeoutTimerId) {
      window.clearTimeout(this.receiveTimeoutTimerId);
    }
    this.receiveTimeoutTimerId = window.setTimeout(this.onReceiveTimeout.bind(this), RECEIVE_TIMEOUT);
  }

  onReceiveTimeout() {
    this.receiveTimeoutTimerId = null;
    console.warn("接收消息超时");
    this.addDebugMsg("Receiving message timed out");

    if (this.websocket) {
      if (this.websocket.onclose) {
        window.setTimeout(() => this.onWsClose(), 0);
      }
      this.websocket.onopen = this.websocket.onclose = this.websocket.onmessage = null;
      this.websocket.close();
    }
  }

  onWsClose() {
    this.addDebugMsg("Disconnected");

    this.websocket = null;
    this.clearTimers();

    if (this.isDestroying) {
      return;
    }
    this.retryCount++;
    this.totalRetryCount++;
    console.warn(`掉线重连中 retryCount=${this.retryCount}, totalRetryCount=${this.totalRetryCount}`);

    if (this.totalRetryCount > 30) {
      this.stop();
      const error = new chatModels.ChatClientFatalError(
        chatModels.FATAL_ERROR_TYPE_TOO_MANY_RETRIES,
        "The connection has lost too many times"
      );
      this.msgHandler.onFatalError(error);
      return;
    }

    this.addDebugMsg("Scheduling reconnection");
    window.setTimeout(this.wsConnect.bind(this), this.getReconnectInterval());
  }

  getReconnectInterval() {
    let interval = Math.min(1000 + (this.totalRetryCount - 1) * 2000, 20 * 1000);
    interval += Math.random() * 3000;
    return interval;
  }

  onWsMessage(event: MessageEvent) {
    const { cmd, data: rawData } = JSON.parse(event.data);
    let data = rawData;
    switch (cmd) {
      case COMMAND_HEARTBEAT: {
        this.refreshReceiveTimeoutTimer();
        break;
      }
      case COMMAND_ADD_TEXT: {
        let emoticon = null;
        const contentType = data[13];
        const contentTypeParams = data[14];
        if (contentType === CONTENT_TYPE_EMOTICON) {
          emoticon = contentTypeParams[0];
        }

        const content = data[4];
        data = new chatModels.AddTextMsg({
          avatarUrl: data[0],
          timestamp: data[1],
          authorName: data[2],
          authorType: data[3],
          content: content,
          privilegeType: data[5],
          isGiftDanmaku: Boolean(data[6]) || chat.isGiftDanmakuByContent(content),
          authorLevel: data[7],
          isNewbie: Boolean(data[8]),
          isMobileVerified: Boolean(data[9]),
          medalLevel: data[10],
          id: data[11],
          translation: data[12],
          emoticon: emoticon,
          isMirror: Boolean(data[18]),
          uid: data[16],
          medalName: data[17],
        });
        this.msgHandler.onAddText(data);
        break;
      }
      case COMMAND_ADD_GIFT: {
        data = new chatModels.AddGiftMsg(data);
        this.msgHandler.onAddGift(data);
        break;
      }
      case COMMAND_ADD_MEMBER: {
        data = new chatModels.AddMemberMsg(data);
        this.msgHandler.onAddMember(data);
        break;
      }
      case COMMAND_ADD_SUPER_CHAT: {
        data = new chatModels.AddSuperChatMsg(data);
        this.msgHandler.onAddSuperChat(data);
        break;
      }
      case COMMAND_DEL_SUPER_CHAT: {
        data = new chatModels.DelSuperChatMsg(data);
        this.msgHandler.onDelSuperChat(data);
        break;
      }
      case COMMAND_UPDATE_TRANSLATION: {
        data = new chatModels.UpdateTranslationMsg({
          id: data[0],
          translation: data[1],
        });
        this.msgHandler.onUpdateTranslation(data);
        break;
      }
      case COMMAND_FATAL_ERROR: {
        this.stop();
        const error = new chatModels.ChatClientFatalError(data.type, data.msg);
        this.msgHandler.onFatalError(error);
        break;
      }
    }

    if (cmd !== COMMAND_FATAL_ERROR) {
      this.retryCount = 0;
      this.totalRetryCount = 0;
      this.refreshReceiveTimeoutTimer();
    }
  }
}

