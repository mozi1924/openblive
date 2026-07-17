import { CSSProperties } from "react";
import ImgShadow from "./ImgShadow";
import AuthorChip from "./AuthorChip";
import * as constants from "./constants";
import * as utils from "../../utils";
import "../../assets/css/youtube/yt-live-chat-text-message-renderer.css";

interface TextMessageProps {
  avatarUrl: string;
  time: Date;
  authorName: string;
  authorType: number;
  contentParts: any[];
  privilegeType: number;
  repeated: number;
  className?: string;
}

const REPEATED_MARK_COLOR_START = [210, 100.0, 62.5];
const REPEATED_MARK_COLOR_END = [360, 87.3, 69.2];

export default function TextMessage({
  avatarUrl,
  time,
  authorName,
  authorType,
  contentParts,
  privilegeType,
  repeated,
  className,
}: TextMessageProps) {
  const timeText = utils.getTimeTextHourMin(time);
  const authorTypeText = constants.AUTHOR_TYPE_TO_TEXT[authorType] || "";

  let color;
  if (repeated <= 2) {
    color = REPEATED_MARK_COLOR_START;
  } else if (repeated >= 10) {
    color = REPEATED_MARK_COLOR_END;
  } else {
    color = [0, 0, 0];
    const t = (repeated - 2) / (10 - 2);
    for (let i = 0; i < 3; i++) {
      color[i] = REPEATED_MARK_COLOR_START[i] + (REPEATED_MARK_COLOR_END[i] - REPEATED_MARK_COLOR_START[i]) * t;
    }
  }
  const repeatedMarkColor = `hsl(${color[0]}, ${color[1]}%, ${color[2]}%)`;
  const classes = className || "";

  return (
    <yt-live-chat-text-message-renderer
      author-type={authorTypeText}
      blc-guard-level={privilegeType}
      class={classes}
      className={classes}
    >
      <style>{`
        .el-badge {
          margin-left: 10px;
          display: inline-block;
          position: relative;
          vertical-align: middle;
        }
        .el-badge__content {
          font-size: 12px !important;
          line-height: 18px !important;
          text-shadow: none !important;
          font-family: sans-serif !important;
          color: #FFF !important;
          background-color: var(--repeated-mark-color) !important;
          border: none;
          border-radius: 10px;
          display: inline-block;
          padding: 0 6px;
          text-align: center;
          white-space: nowrap;
        }
      `}</style>
      <ImgShadow
        id="author-photo"
        height="24"
        width="24"
        className="style-scope yt-live-chat-text-message-renderer"
        imgUrl={avatarUrl}
      />
      <div id="content" className="style-scope yt-live-chat-text-message-renderer">
        <span id="timestamp" className="style-scope yt-live-chat-text-message-renderer">
          {timeText}
        </span>
        <AuthorChip
          className="style-scope yt-live-chat-text-message-renderer"
          isInMemberMessage={false}
          authorName={authorName}
          authorType={authorType}
          privilegeType={privilegeType}
        />
        <span id="message" className="style-scope yt-live-chat-text-message-renderer">
          {contentParts.map((content, index) => {
            if (content.type === constants.CONTENT_PART_TYPE_TEXT) {
              return <span key={index}>{content.text}</span>;
            } else if (content.type === constants.CONTENT_PART_TYPE_IMAGE) {
              const imgClasses = [
                "emoji",
                "yt-formatted-string",
                "style-scope",
                "yt-live-chat-text-message-renderer",
                content.height >= 100 ? "blc-large-emoji" : "",
              ].filter(Boolean).join(" ");
              return (
                <img
                  key={index}
                  className={imgClasses}
                  src={content.url}
                  alt={content.text}
                  shared-tooltip-text={content.text}
                  id={`emoji-${content.text}`}
                  width={content.width}
                  height={content.height}
                />
              );
            }
            return null;
          })}
          {repeated > 1 && (
            <span
              className="el-badge style-scope yt-live-chat-text-message-renderer"
              style={{ "--repeated-mark-color": repeatedMarkColor } as CSSProperties}
            >
              <sup className="el-badge__content is-fixed">
                {repeated > 99 ? "99+" : repeated}
              </sup>
            </span>
          )}
        </span>
      </div>
    </yt-live-chat-text-message-renderer>
  );
}
