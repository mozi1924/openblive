import { useState, useEffect } from "react";
import * as chat from "../../api/chat";
import "../../assets/css/youtube/yt-img-shadow.css";

interface ImgShadowProps {
  imgUrl?: string;
  height?: string | number;
  width?: string | number;
  id?: string;
  className?: string;
}

export default function ImgShadow({ imgUrl, height, width, id, className }: ImgShadowProps) {
  const [showImgUrl, setShowImgUrl] = useState(imgUrl || chat.DEFAULT_AVATAR_URL);

  useEffect(() => {
    setShowImgUrl(imgUrl || chat.DEFAULT_AVATAR_URL);
  }, [imgUrl]);

  const onLoadError = () => {
    if (showImgUrl !== chat.DEFAULT_AVATAR_URL) {
      setShowImgUrl(chat.DEFAULT_AVATAR_URL);
    }
  };

  const classes = ["no-transition", className].filter(Boolean).join(" ");

  return (
    <yt-img-shadow
      id={id}
      class={classes}
      className={classes}
      height={height}
      width={width}
      style={{ backgroundColor: "transparent" }}
      loaded=""
    >
      <img
        id="img"
        className="style-scope yt-img-shadow"
        alt=""
        height={height}
        width={width}
        src={showImgUrl}
        onError={onLoadError}
      />
    </yt-img-shadow>
  );
}
