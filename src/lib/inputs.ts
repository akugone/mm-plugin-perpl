import { CommandError } from "@metamask/agent-wallet/plugin";
import { parseDecimal } from "./perpl/scale.js";

/** Wrap the plain-Error parsers into CommandErrors with the mm envelope. */
export function decimalFlag(raw: string | undefined, what: string): number | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  try {
    return parseDecimal(value, what);
  } catch (e) {
    throw new CommandError("INVALID_INPUT", (e as Error).message, `Pass --${what} as a positive number.`);
  }
}

export function requiredDecimalFlag(raw: string | undefined, what: string): number {
  const v = decimalFlag(raw, what);
  if (v === undefined) throw new CommandError("MISSING_INPUT", `--${what} is required.`, `Pass --${what} <number>.`);
  return v;
}

export function intFlag(raw: string | undefined, what: string, opts: { min?: number; max?: number } = {}): number | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || (opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) {
    const range = opts.min !== undefined || opts.max !== undefined ? ` between ${opts.min ?? "-∞"} and ${opts.max ?? "∞"}` : "";
    throw new CommandError("INVALID_INPUT", `--${what} must be an integer${range}. Got '${value}'.`, `Fix --${what}.`);
  }
  return n;
}

export function sideFlag(raw: string | undefined): "long" | "short" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "long" || v === "buy") return "long";
  if (v === "short" || v === "sell") return "short";
  throw new CommandError("INVALID_INPUT", `--side must be long or short. Got '${raw}'.`, "Use --side long or --side short.");
}

export function listFlag(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
