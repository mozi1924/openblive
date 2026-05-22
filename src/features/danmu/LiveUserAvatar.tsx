import { useEffect, useState } from "react";

type LiveUserAvatarProps = {
  face: string;
  name: string;
  className?: string;
};

export function LiveUserAvatar({
  face,
  name,
  className = "h-9 w-9",
}: LiveUserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0) || "?";

  useEffect(() => {
    setFailed(false);
  }, [face]);

  return (
    <div
      className={`relative overflow-hidden rounded-full border border-white/10 bg-white/5 ${className}`}
    >
      {!failed && face ? (
        <img
          src={face}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-300">
          {initial}
        </div>
      )}
    </div>
  );
}
