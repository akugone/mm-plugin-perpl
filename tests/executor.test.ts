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

describe("preflight", () => {
  const from = "0x62Fe7760f9462D766af38EccfA4B5889d9FA32Ab" as const;
  const tx = { to: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc" as const, data: "0xbad4a01f" as const };
  const client = (call: () => Promise<unknown>) => ({ call, waitForTransactionReceipt: async () => ({}) });

  it("stops a transaction that would revert, with the decoded reason", async () => {
    const { preflight } = await import("../src/lib/executor");
    // shape of the error mm surfaced for a deposit without approval (ERC20InsufficientAllowance)
    const err = Object.assign(new Error("execution reverted"), { cause: { data: { code: 3, data: "0xfb8f41b2" + "00".repeat(96) } } });
    await expect(preflight(client(() => Promise.reject(err)), from, tx, "Deposit 10 AUSD")).rejects.toMatchObject({
      code: "TX_WOULD_REVERT",
      message: expect.stringMatching(/allowance is too low.*Nothing was signed or sent/),
    });
  });

  it("leaves non-revert RPC failures to MetaMask's pipeline", async () => {
    const { preflight } = await import("../src/lib/executor");
    await expect(preflight(client(() => Promise.reject(new Error("fetch failed"))), from, tx, "x")).resolves.toBeUndefined();
  });

  it("lets a transaction that simulates fine through", async () => {
    const { preflight } = await import("../src/lib/executor");
    await expect(preflight(client(() => Promise.resolve({ data: "0x" })), from, tx, "x")).resolves.toBeUndefined();
  });
});
