import ImgShadow from "./ImgShadow";
import AuthorChip from "./AuthorChip";
import * as utils from "../../utils";
import "../../assets/css/youtube/yt-live-chat-membership-item-renderer.css";

interface MembershipItemProps {
  avatarUrl: string;
  authorName: string;
  privilegeType: number;
  title: string;
  time: Date;
  className?: string;
}

export default function MembershipItem({
  avatarUrl,
  authorName,
  privilegeType,
  title,
  time,
  className,
}: MembershipItemProps) {
  const timeText = utils.getTimeTextHourMin(time);
  const classes = className || "";

  return (
    <yt-live-chat-membership-item-renderer
      class={classes}
      className={classes}
      show-only-header=""
      blc-guard-level={privilegeType}
    >
      <div id="card" className="style-scope yt-live-chat-membership-item-renderer">
        <div id="header" className="style-scope yt-live-chat-membership-item-renderer">
          <ImgShadow
            id="author-photo"
            height="40"
            width="40"
            className="style-scope yt-live-chat-membership-item-renderer"
            imgUrl={avatarUrl}
          />
          <div id="header-content" className="style-scope yt-live-chat-membership-item-renderer">
            <div id="header-content-primary-column" className="style-scope yt-live-chat-membership-item-renderer">
              <div id="header-content-inner-column" className="style-scope yt-live-chat-membership-item-renderer">
                <AuthorChip
                  className="style-scope yt-live-chat-membership-item-renderer"
                  isInMemberMessage
                  authorName={authorName}
                  authorType={0}
                  privilegeType={privilegeType}
                />
              </div>
              <div id="header-subtext" className="style-scope yt-live-chat-membership-item-renderer">
                {title}
              </div>
            </div>
            <div id="timestamp" className="style-scope yt-live-chat-membership-item-renderer">
              {timeText}
            </div>
          </div>
        </div>
      </div>
    </yt-live-chat-membership-item-renderer>
  );
}
