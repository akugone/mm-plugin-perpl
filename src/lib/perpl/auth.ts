/**
 * Perpl API-key request signing (see PerplFoundation/api-docs authentication.md).
 *
 * REST canonical string, newline-joined:  chain_id, METHOD, target (path + query exactly as sent, starting
 * at /v1/...), timestamp_ms, nonce (base64url, no padding), sha256(body) hex.  Signature = base64url(ed25519).
 * WebSocket sign-in canonical string:      chain_id, "trading-ws-signin", timestamp_ms, nonce.
 *
 * Pure functions with injectable clock / nonce so the tests are deterministic.
 */
import { randomNonce, sha256Hex, sign } from "./ed25519.js";

export type ApiCredentials = { apiKey: string; seedHex: string };

export const WS_SIGNIN_TAG = "trading-ws-signin";
export const MSG_API_KEY_SIGN_IN = 29;

export function restCanonical(chainId: number, method: string, target: string, timestampMs: string, nonce: string, bodyHashHex: string): string {
  return [chainId, method.toUpperCase(), target, timestampMs, nonce, bodyHashHex].join("\n");
}

export function wsCanonical(chainId: number, timestampMs: string, nonce: string): string {
  return [chainId, WS_SIGNIN_TAG, timestampMs, nonce].join("\n");
}

export type SignedHeaders = {
  "X-API-Key": string;
  "X-API-Timestamp": string;
  "X-API-Nonce": string;
  "X-API-Signature": string;
  "Content-Type"?: string;
};

export function signRest(
  creds: ApiCredentials,
  chainId: number,
  method: string,
  target: string,
  body = "",
  nowMs: number = Date.now(),
  nonce: string = randomNonce(),
): SignedHeaders {
  const timestamp = String(nowMs);
  const canonical = restCanonical(chainId, method, target, timestamp, nonce, sha256Hex(body));
  const signature = sign(creds.seedHex, Buffer.from(canonical)).toString("base64url");
  const headers: SignedHeaders = {
    "X-API-Key": creds.apiKey,
    "X-API-Timestamp": timestamp,
    "X-API-Nonce": nonce,
    "X-API-Signature": signature,
  };
  if (body) headers["Content-Type"] = "application/json";
  return headers;
}

export type SignInFrame = {
  mt: typeof MSG_API_KEY_SIGN_IN;
  chain_id: number;
  api_key: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

export function buildSignIn(creds: ApiCredentials, chainId: number, nowMs: number = Date.now(), nonce: string = randomNonce()): SignInFrame {
  const timestamp = String(nowMs);
  const signature = sign(creds.seedHex, Buffer.from(wsCanonical(chainId, timestamp, nonce))).toString("base64url");
  return { mt: MSG_API_KEY_SIGN_IN, chain_id: chainId, api_key: creds.apiKey, timestamp, nonce, signature };
}
