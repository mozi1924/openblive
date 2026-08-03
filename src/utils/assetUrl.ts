export const normalizeAssetUrl = (url?: string | null): string => {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice(7)}`;
  }
  return trimmed;
};

export const normalizeRemoteAssetUrl = normalizeAssetUrl;
