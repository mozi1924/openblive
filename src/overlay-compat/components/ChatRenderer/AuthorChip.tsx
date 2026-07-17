import AuthorBadge from "./AuthorBadge";
import * as constants from "./constants";
import "../../assets/css/youtube/yt-live-chat-author-chip.css";

interface AuthorChipProps {
  isInMemberMessage: boolean;
  authorName: string;
  authorType: number;
  privilegeType: number;
  className?: string;
}

export default function AuthorChip({
  isInMemberMessage,
  authorName,
  authorType,
  privilegeType,
  className,
}: AuthorChipProps) {
  const authorTypeText = constants.AUTHOR_TYPE_TO_TEXT[authorType] || "";
  const nameClasses = ["style-scope", "yt-live-chat-author-chip", isInMemberMessage ? "member" : ""].filter(Boolean).join(" ");
  const classes = className || "";

  return (
    <yt-live-chat-author-chip class={classes} className={classes}>
      <span id="author-name" dir="auto" className={nameClasses} {...{ type: authorTypeText }}>
        {authorName}
        <span id="chip-badges" className="style-scope yt-live-chat-author-chip" />
      </span>
      <span id="chat-badges" className="style-scope yt-live-chat-author-chip">
        {isInMemberMessage ? (
          <AuthorBadge className="style-scope yt-live-chat-author-chip" isAdmin={false} privilegeType={privilegeType} />
        ) : (
          <>
            {authorType === constants.AUTHOR_TYPE_ADMIN && (
              <AuthorBadge className="style-scope yt-live-chat-author-chip" isAdmin privilegeType={0} />
            )}
            {privilegeType > 0 && (
              <AuthorBadge className="style-scope yt-live-chat-author-chip" isAdmin={false} privilegeType={privilegeType} />
            )}
          </>
        )}
      </span>
    </yt-live-chat-author-chip>
  );
}
