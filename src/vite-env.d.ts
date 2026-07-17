/// <reference types="vite/client" />

import React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "yt-img-shadow": any;
      "yt-live-chat-author-badge-renderer": any;
      "yt-icon": any;
      "yt-live-chat-author-chip": any;
      "yt-live-chat-text-message-renderer": any;
      "yt-live-chat-paid-message-renderer": any;
      "yt-live-chat-membership-item-renderer": any;
      "yt-live-chat-ticker-paid-message-item-renderer": any;
      "yt-live-chat-ticker-renderer": any;
      "yt-live-chat-item-list-renderer": any;
      "yt-live-chat-renderer": any;
      "el-scrollbar": any;
      "el-tooltip": any;
    }
  }
}


