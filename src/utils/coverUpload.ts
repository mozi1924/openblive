const LIVE_COVER_ASPECT_RATIO = 4 / 3;
const LIVE_COVER_MAX_WIDTH = 1020;
const LIVE_COVER_MAX_BYTES = 2 * 1024 * 1024;
const LIVE_COVER_MIN_WIDTH = 640;
const JPEG_QUALITIES = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5];

type CropRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

const toJpegFileName = (fileName: string) => {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "live-cover.jpg";
  }
  const baseName = trimmed.split(/[/\\]/).pop() || trimmed;
  const sanitized = baseName.replace(/[\r\n"'\\]/g, "").replace(/\.[^.]*$/, "");
  return `${sanitized || "live-cover"}.jpg`;
};

const loadFileImage = (file: File) =>
  new Promise<{ img: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ img, objectUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("load_image_failed"));
    };
    img.src = objectUrl;
  });

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read_blob_failed"));
    reader.readAsDataURL(blob);
  });

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("encode_cover_failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });

const centeredCrop = (width: number, height: number, ratio: number): CropRect => {
  const sourceRatio = width / height;
  if (sourceRatio > ratio) {
    const sw = height * ratio;
    return {
      sx: (width - sw) / 2,
      sy: 0,
      sw,
      sh: height,
    };
  }

  const sh = width / ratio;
  return {
    sx: 0,
    sy: (height - sh) / 2,
    sw: width,
    sh,
  };
};

const buildTargetWidths = (sourceWidth: number) => {
  const maxWidth = Math.min(Math.round(sourceWidth), LIVE_COVER_MAX_WIDTH);
  if (maxWidth <= LIVE_COVER_MIN_WIDTH) {
    return [maxWidth];
  }
  const steps = [maxWidth, 960, 900, 840, 780, 720, LIVE_COVER_MIN_WIDTH];
  return Array.from(new Set(steps.filter((value) => value <= maxWidth && value >= LIVE_COVER_MIN_WIDTH)));
};

const createCoverCanvas = (
  image: HTMLImageElement,
  crop: CropRect,
  width: number,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width / LIVE_COVER_ASPECT_RATIO));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("cover_canvas_context_missing");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
};

export type PreparedCoverUpload = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
};

export const prepareLiveCoverUpload = async (file: File): Promise<PreparedCoverUpload> => {
  const { img: image, objectUrl } = await loadFileImage(file);
  try {
    const crop = centeredCrop(image.naturalWidth || image.width, image.naturalHeight || image.height, LIVE_COVER_ASPECT_RATIO);
    const targetWidths = buildTargetWidths(crop.sw);

    let smallestBlob: Blob | null = null;
    for (const targetWidth of targetWidths) {
      const canvas = createCoverCanvas(image, crop, targetWidth);
      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToJpegBlob(canvas, quality);
        if (!smallestBlob || blob.size < smallestBlob.size) {
          smallestBlob = blob;
        }
        if (blob.size <= LIVE_COVER_MAX_BYTES) {
          return {
            dataUrl: await toDataUrl(blob),
            fileName: toJpegFileName(file.name),
            mimeType: "image/jpeg",
          };
        }
      }
    }

    if (!smallestBlob) {
      throw new Error("cover_prepare_failed");
    }

    return {
      dataUrl: await toDataUrl(smallestBlob),
      fileName: toJpegFileName(file.name),
      mimeType: "image/jpeg",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
