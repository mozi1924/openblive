export function mergeConfig(config: Record<string, any>, defaultConfig: Record<string, any>): Record<string, any> {
  const res: Record<string, any> = {};
  for (const i in defaultConfig) {
    res[i] = i in config ? config[i] : defaultConfig[i];
  }
  return res;
}

export function toBool(val: any): boolean {
  if (typeof val === "string") {
    return ["false", "no", "off", "0", ""].indexOf(val.toLowerCase()) === -1;
  }
  return Boolean(val);
}

export function toInt(val: any, _default: number): number {
  let res = parseInt(val, 10);
  if (isNaN(res)) {
    res = _default;
  }
  return res;
}

export function toFloat(val: any, _default: number): number {
  let res = parseFloat(val);
  if (isNaN(res)) {
    res = _default;
  }
  return res;
}

export function formatCurrency(price: number): string {
  let minimumFractionDigits: number;
  if (price < 10) {
    minimumFractionDigits = 2;
  } else if (price < 100) {
    minimumFractionDigits = 1;
  } else {
    minimumFractionDigits = 0;
  }
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits,
  }).format(price);
}

export function getTimeTextHourMin(date: Date): string {
  const hour = `00${date.getHours()}`.slice(-2);
  const min = `00${date.getMinutes()}`.slice(-2);
  return `${hour}:${min}`;
}

export function getUuid4Hex(): string {
  const chars: string[] = [];
  for (let i = 0; i < 32; i++) {
    const char = Math.floor(Math.random() * 16).toString(16);
    chars.push(char);
  }
  return chars.join("");
}
