import { CSSProperties } from "react";
import ImgShadow from "./ImgShadow";
import * as constants from "./constants";
import * as utils from "../../utils";
import "../../assets/css/youtube/yt-live-chat-paid-message-renderer.css";

interface PaidMessageProps {
  avatarUrl: string;
  authorName: string;
  price: number;
  priceText?: string;
  time: Date;
  content: string;
  className?: string;
}

export default function PaidMessage({
  avatarUrl,
  authorName,
  price,
  priceText,
  time,
  content,
  className,
}: PaidMessageProps) {
  const priceConfig = constants.getPriceConfig(price);
  const color = priceConfig.colors;
  const showPriceText = priceText || `CN¥${utils.formatCurrency(price)}`;
  const timeText = utils.getTimeTextHourMin(time);
  const classes = className || "";

  return (
    <yt-live-chat-paid-message-renderer
      class={classes}
      className={classes}
      show-only-header={!content ? "" : undefined}
      style={{
        "--yt-live-chat-paid-message-primary-color": color.contentBg,
        "--yt-live-chat-paid-message-secondary-color": color.headerBg,
        "--yt-live-chat-paid-message-header-color": color.header,
        "--yt-live-chat-paid-message-author-name-color": color.authorName,
        "--yt-live-chat-paid-message-timestamp-color": color.time,
        "--yt-live-chat-paid-message-color": color.content,
      } as CSSProperties}
      blc-price-level={priceConfig.priceLevel}
    >
      <div id="card" className="style-scope yt-live-chat-paid-message-renderer">
        <div id="header" className="style-scope yt-live-chat-paid-message-renderer">
          <ImgShadow
            id="author-photo"
            height="40"
            width="40"
            className="style-scope yt-live-chat-paid-message-renderer"
            imgUrl={avatarUrl}
          />
          <div id="header-content" className="style-scope yt-live-chat-paid-message-renderer">
            <div id="header-content-primary-column" className="style-scope yt-live-chat-paid-message-renderer">
              <div id="author-name" className="style-scope yt-live-chat-paid-message-renderer">
                {authorName}
              </div>
              <div id="purchase-amount" className="style-scope yt-live-chat-paid-message-renderer">
                {showPriceText}
              </div>
            </div>
            <span id="timestamp" className="style-scope yt-live-chat-paid-message-renderer">
              {timeText}
            </span>
          </div>
        </div>
        <div id="content" className="style-scope yt-live-chat-paid-message-renderer">
          <div id="message" dir="auto" className="style-scope yt-live-chat-paid-message-renderer">
            {content}
          </div>
        </div>
      </div>
    </yt-live-chat-paid-message-renderer>
  );
}
