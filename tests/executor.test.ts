import { describe, expect, it } from "vitest";
import { rpcConfigError } from "../src/lib/executor";

describe("rpcConfigError", () => {
  it("maps mm's Infura-proxy failure to an actionable error for Monad Testnet", () => {
    const e = Object.assign(new Error("Non-200 status code: '400'"), { code: -32603, data: { error: "Invalid chainId" } });
    const mapped = rpcConfigError(e, 10143);
    expect(mapped?.code).toBe("MM_CHAIN_RPC_UNAVAILABLE");
    expect(mapped?.hint).toMatch(/customEvmChains/);
    expect(mapped?.hint).toMatch(/Monad Testnet/);
  });

  it("names the chain id for other chains", () => {
    expect(rpcConfigError(new Error("Gas fee/price estimation failed. Message: x"), 4326)?.hint).toMatch(/4326/);
  });

  it("leaves unrelated errors alone", () => {
    expect(rpcConfigError(new Error("user rejected"), 10143)).toBeUndefined();
  });
});
