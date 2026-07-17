import Room from "./views/Room";

export default function App() {
  const pathname = window.location.pathname;
  let relativePath = pathname;
  if (relativePath.startsWith("/overlay")) {
    relativePath = relativePath.slice("/overlay".length);
  }

  // relativePath can be: "", "/", "/room/123", "/room/123/"
  let roomKeyValue: string | number = 1;
  if (relativePath.startsWith("/room/")) {
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const parsed = parseInt(parts[1], 10);
      roomKeyValue = isNaN(parsed) ? parts[1] : parsed;
    }
  }

  const searchParams = new URLSearchParams(window.location.search);
  const strConfig: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    strConfig[key] = value;
  });

  return (
    <Room
      roomKeyType={1}
      roomKeyValue={roomKeyValue}
      strConfig={strConfig}
    />
  );
}
