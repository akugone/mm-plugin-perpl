import { describe, expect, it } from "vitest";
import { buildSignIn, restCanonical, signRest, wsCanonical } from "../src/lib/perpl/auth";
import { generateKeyPair, publicKeyFromSeed, sha256Hex, sign, verify } from "../src/lib/perpl/ed25519";

describe("ed25519 (node:crypto only)", () => {
  it("generates a 32-byte seed and a public key derivable from it", () => {
    const kp = generateKeyPair();
    expect(kp.seedHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(kp.publicKeyHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(publicKeyFromSeed(kp.seedHex)).toBe(kp.publicKeyHex);
  });
  it("signs and verifies", () => {
    const kp = generateKeyPair();
    const sig = sign(kp.seedHex, Buffer.from("hello"));
    expect(sig.length).toBe(64);
    expect(verify(kp.publicKeyHex, Buffer.from("hello"), sig)).toBe(true);
    expect(verify(kp.publicKeyHex, Buffer.from("hellO"), sig)).toBe(false);
  });
});

describe("Perpl request signing", () => {
  const kp = generateKeyPair();
  const creds = { apiKey: "tok_123", seedHex: kp.seedHex };

  it("builds the REST canonical string exactly as documented", () => {
    const c = restCanonical(143, "get", "/v1/trading/fills?count=100", "1700000000000", "abc", sha256Hex(""));
    expect(c.split("\n")).toEqual(["143", "GET", "/v1/trading/fills?count=100", "1700000000000", "abc", sha256Hex("")]);
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("produces the four headers with a verifiable base64url signature", () => {
    const h = signRest(creds, 143, "GET", "/v1/trading/fills?count=1", "", 1700000000000, "nonce1");
    expect(h["X-API-Key"]).toBe("tok_123");
    expect(h["X-API-Timestamp"]).toBe("1700000000000");
    expect(h["X-API-Nonce"]).toBe("nonce1");
    expect(h["Content-Type"]).toBeUndefined();
    const canonical = restCanonical(143, "GET", "/v1/trading/fills?count=1", "1700000000000", "nonce1", sha256Hex(""));
    expect(verify(kp.publicKeyHex, Buffer.from(canonical), Buffer.from(h["X-API-Signature"], "base64url"))).toBe(true);
    expect(h["X-API-Signature"]).not.toMatch(/[+/=]/); // base64url, no padding
  });

  it("hashes the raw body for POST and sets Content-Type", () => {
    const body = JSON.stringify({ a: 1 });
    const h = signRest(creds, 10143, "POST", "/v1/x", body, 1, "n");
    expect(h["Content-Type"]).toBe("application/json");
    const canonical = restCanonical(10143, "POST", "/v1/x", "1", "n", sha256Hex(body));
    expect(verify(kp.publicKeyHex, Buffer.from(canonical), Buffer.from(h["X-API-Signature"], "base64url"))).toBe(true);
  });

  it("builds the websocket sign-in frame (mt 29) over the ws canonical string", () => {
    const f = buildSignIn(creds, 143, 1700000000000, "nonce2");
    expect(f).toMatchObject({ mt: 29, chain_id: 143, api_key: "tok_123", timestamp: "1700000000000", nonce: "nonce2" });
    expect(wsCanonical(143, "1700000000000", "nonce2")).toBe("143\ntrading-ws-signin\n1700000000000\nnonce2");
    expect(verify(kp.publicKeyHex, Buffer.from(wsCanonical(143, "1700000000000", "nonce2")), Buffer.from(f.signature, "base64url"))).toBe(true);
  });
});
