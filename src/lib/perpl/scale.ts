/** Perpl prices and sizes travel as scaled integers; leverage in hundredths; fees/slippage in basis points. */

const DECIMAL_RE = /^\d+(\.\d+)?$/;

export function parseDecimal(raw: string | number | undefined, what: string): number {
  const text = String(raw ?? "").trim();
  if (!DECIMAL_RE.test(text)) throw new Error(`${what} must be a positive decimal number, e.g. 0.01 or 25. Got '${text}'.`);
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${what} must be greater than zero.`);
  return n;
}

/** Human → scaled integer, rounded to the nearest unit. Throws when the value rounds to zero. */
export function toScaled(human: number, decimals: number, what = "value"): number {
  const scaled = Math.round(human * 10 ** decimals);
  if (!Number.isSafeInteger(scaled)) throw new Error(`${what} is out of range for ${decimals} decimals.`);
  if (scaled <= 0) throw new Error(`${what} ${human} is below the market's smallest unit (10^-${decimals}).`);
  return scaled;
}

export function fromScaled(scaled: number | string | undefined, decimals: number): number {
  const n = typeof scaled === "string" ? Number(scaled) : (scaled ?? 0);
  return n / 10 ** decimals;
}

/** Leverage like 2 or 2.5 → hundredths (250). */
export function toLeverageHundredths(leverage: number): number {
  const lv = Math.round(leverage * 100);
  if (lv < 100) throw new Error("leverage must be at least 1.");
  return lv;
}

export function fromLeverageHundredths(lv: number | undefined): number {
  return (lv ?? 100) / 100;
}

/** Collateral amounts (Perpl `Amount` = decimal string in token base units) → human number. */
export function amountToHuman(amount: string | number | undefined, tokenDecimals: number): number {
  if (amount === undefined || amount === null || amount === "") return 0;
  return Number(amount) / 10 ** tokenDecimals;
}

export function round(n: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
