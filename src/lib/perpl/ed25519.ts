/**
 * Ed25519 with node:crypto only — no third-party dependency for the one key material this plugin holds.
 *
 * Perpl API keys are Ed25519 key pairs: the server stores the public key at enrollment, every request is
 * signed with the private key. The 32-byte seed is what we persist (hex), never the wallet's key.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as nodeSign, verify as nodeVerify } from "node:crypto";

export type KeyPair = { seedHex: string; publicKeyHex: string };

// PKCS#8 DER prefix for an Ed25519 private key (RFC 8410): SEQUENCE { version 0, AlgorithmIdentifier id-Ed25519, OCTET STRING { OCTET STRING seed } }
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function stripHex(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

export function hexToBytes(hex: string): Buffer {
  const clean = stripHex(hex);
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) throw new Error("invalid hex");
  return Buffer.from(clean, "hex");
}

export function bytesToHex(bytes: Uint8Array, prefix = true): string {
  const h = Buffer.from(bytes).toString("hex");
  return prefix ? `0x${h}` : h;
}

function privateKeyFromSeed(seedHex: string) {
  const seed = hexToBytes(seedHex);
  if (seed.length !== 32) throw new Error("Ed25519 seed must be 32 bytes");
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
}

export function publicKeyFromSeed(seedHex: string): string {
  const pub = createPublicKey(privateKeyFromSeed(seedHex)).export({ format: "jwk" }) as { x?: string };
  if (!pub.x) throw new Error("could not derive Ed25519 public key");
  return bytesToHex(Buffer.from(pub.x, "base64url"));
}

export function generateKeyPair(): KeyPair {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" }) as { d?: string; x?: string };
  if (!jwk.d || !jwk.x) throw new Error("Ed25519 key generation failed");
  return { seedHex: bytesToHex(Buffer.from(jwk.d, "base64url")), publicKeyHex: bytesToHex(Buffer.from(jwk.x, "base64url")) };
}

export function sign(seedHex: string, data: Uint8Array): Buffer {
  return nodeSign(null, data, privateKeyFromSeed(seedHex));
}

export function verify(publicKeyHex: string, data: Uint8Array, signature: Uint8Array): boolean {
  const x = Buffer.from(hexToBytes(publicKeyHex)).toString("base64url");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" });
  return nodeVerify(null, data, key, signature);
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function randomNonce(): string {
  return randomBytes(16).toString("base64url");
}
