import { useState, useEffect } from "react";
import * as chatConfig from "../../api/chatConfig";
import { formatCurrency } from "../../utils";
import ImgShadow from "./ImgShadow";
import MembershipItem from "./MembershipItem";
import PaidMessage from "./PaidMessage";
import * as constants from "./constants";
import "../../assets/css/youtube/yt-live-chat-ticker-renderer.css";
import "../../assets/css/youtube/yt-live-chat-ticker-paid-message-item-renderer.css";

interface TickerProps {
  messages: any[];
  onUpdateMessages: (messages: any[]) => void;
  showGiftName?: boolean;
}

export default function Ticker({
  messages,
  onUpdateMessages,
  showGiftName = chatConfig.DEFAULT_CONFIG.showGiftName,
}: TickerProps) {
  const [curTime, setCurTime] = useState(new Date());
  const [pinnedMessage, setPinnedMessage] = useState<any | null>(null);

  const getPinTime = (message: any) => {
    if (message.type === constants.MESSAGE_TYPE_MEMBER) {
      return 2;
    }
    return constants.getPriceConfig(message.price).pinTime;
  };

  const needToShow = (message: any) => {
    const pinTime = getPinTime(message);
    return (curTime.getTime() - message.addTime.getTime()) / (60 * 1000) < pinTime;
  };

  const getBgColor = (message: any) => {
    let color1, color2;
    if (message.type === constants.MESSAGE_TYPE_MEMBER) {
      color1 = "rgba(15,157,88,1)";
      color2 = "rgba(11,128,67,1)";
    } else {
      const config = constants.getPriceConfig(message.price);
      color1 = config.colors.contentBg;
      color2 = config.colors.headerBg;
    }
    const pinTime = getPinTime(message);
    let progress = (1 - (curTime.getTime() - message.addTime.getTime()) / (60 * 1000) / pinTime) * 100;
    if (progress < 0) {
      progress = 0;
    } else if (progress > 100) {
      progress = 100;
    }
    return `linear-gradient(90deg, ${color1}, ${color1} ${progress}%, ${color2} ${progress}%, ${color2})`;
  };

  const getColor = (message: any) => {
    if (message.type === constants.MESSAGE_TYPE_MEMBER) {
      return "rgb(255,255,255)";
    }
    return constants.getPriceConfig(message.price).colors.header;
  };

  const getText = (message: any) => {
    if (message.type === constants.MESSAGE_TYPE_MEMBER) {
      return "会员"; // chat.tickerMembership equivalent
    }
    return `CN¥${formatCurrency(message.price)}`;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurTime(now);

      // Filter out expired messages
      let changed = false;
      const filtered = messages.filter((message) => {
        const pinTime = getPinTime(message);
        const expired = (now.getTime() - message.addTime.getTime()) / (60 * 1000) >= pinTime;
        if (expired) {
          changed = true;
          if (pinnedMessage && pinnedMessage.id === message.id) {
            setPinnedMessage(null);
          }
          return false;
        }
        return true;
      });

      if (changed) {
        onUpdateMessages(filtered);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [messages, pinnedMessage, onUpdateMessages]);

  const showMessages = messages
    .filter(needToShow)
    .map((message) => ({
      raw: message,
      bgColor: getBgColor(message),
      color: getColor(message),
      text: getText(message),
    }));

  const pinnedMessageShowContent = (() => {
    if (!pinnedMessage) {
      return "";
    }
    if (pinnedMessage.type === constants.MESSAGE_TYPE_GIFT) {
      return constants.getGiftShowContent(pinnedMessage, showGiftName);
    } else {
      return constants.getShowContent(pinnedMessage);
    }
  })();

  const onItemClick = (message: any) => {
    if (pinnedMessage && pinnedMessage.id === message.id) {
      setPinnedMessage(null);
    } else {
      setPinnedMessage(message);
    }
  };

  return (
    <yt-live-chat-ticker-renderer hidden={showMessages.length === 0 ? "" : undefined}>
      <el-scrollbar id="container" dir="ltr" class="style-scope yt-live-chat-ticker-renderer" className="style-scope yt-live-chat-ticker-renderer">
        <div id="items" className="style-scope yt-live-chat-ticker-renderer">
          {showMessages.map((message) => (
            <yt-live-chat-ticker-paid-message-item-renderer
              key={message.raw.id}
              tabindex="0"
              class="style-scope yt-live-chat-ticker-renderer"
              className="style-scope yt-live-chat-ticker-renderer"
              style={{ overflow: "hidden" }}
              onClick={() => onItemClick(message.raw)}
            >
              <div
                id="container"
                dir="ltr"
                className="style-scope yt-live-chat-ticker-paid-message-item-renderer"
                style={{ background: message.bgColor }}
              >
                <div
                  id="content"
                  className="style-scope yt-live-chat-ticker-paid-message-item-renderer"
                  style={{ color: message.color }}
                >
                  <ImgShadow
                    id="author-photo"
                    height="24"
                    width="24"
                    className="style-scope yt-live-chat-ticker-paid-message-item-renderer"
                    imgUrl={message.raw.avatarUrl}
                  />
                  <span id="text" dir="ltr" className="style-scope yt-live-chat-ticker-paid-message-item-renderer">
                    {message.text}
                  </span>
                </div>
              </div>
            </yt-live-chat-ticker-paid-message-item-renderer>
          ))}
        </div>
      </el-scrollbar>
      {pinnedMessage && (
        pinnedMessage.type === constants.MESSAGE_TYPE_MEMBER ? (
          <MembershipItem
            key={pinnedMessage.id}
            className="style-scope yt-live-chat-ticker-renderer"
            avatarUrl={pinnedMessage.avatarUrl}
            authorName={constants.getShowAuthorName(pinnedMessage)}
            privilegeType={pinnedMessage.privilegeType}
            title={pinnedMessage.title}
            time={pinnedMessage.time}
          />
        ) : (
          <PaidMessage
            key={pinnedMessage.id}
            className="style-scope yt-live-chat-ticker-renderer"
            price={pinnedMessage.price}
            avatarUrl={pinnedMessage.avatarUrl}
            authorName={constants.getShowAuthorName(pinnedMessage)}
            time={pinnedMessage.time}
            content={pinnedMessageShowContent}
          />
        )
      )}
    </yt-live-chat-ticker-renderer>
  );
}
