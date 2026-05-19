import QRCode from "qrcode";

type QrRenderOptions = {
  width?: number;
  margin?: number;
};

export type ResolvedQrPayload = {
  content: string;
  imageSrc: string;
};

function normalizeQrContent(value: string) {
  return value.trim();
}

export async function resolveQrPayload(
  value: string,
  options: QrRenderOptions = {},
): Promise<ResolvedQrPayload> {
  const content = normalizeQrContent(value);
  if (!content) {
    return {
      content: "",
      imageSrc: "",
    };
  }
  // 文档中的二维码字段是“二维码内容字符串”，通常是 URL；
  // 这里保留 data:image 兼容分支，避免未来协议变化导致不可用。
  if (content.startsWith("data:image/")) {
    return {
      content,
      imageSrc: content,
    };
  }

  try {
    const imageSrc = await QRCode.toDataURL(content, {
      width: options.width ?? 220,
      margin: options.margin ?? 2,
    });
    return {
      content,
      imageSrc,
    };
  } catch {
    return {
      content,
      imageSrc: "",
    };
  }
}
