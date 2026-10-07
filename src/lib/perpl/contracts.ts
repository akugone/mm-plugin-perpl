/** Minimal ABIs for the on-chain steps that go through the MetaMask wallet (policy, Blockaid, 2FA apply). */

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Perpl Exchange contract — account setup and collateral deposit (selectors checked against the deployed implementation). */
export const exchangeAbi = [
  {
    type: "function",
    name: "createAccount",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountCNS", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "depositCollateral",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountCNS", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "allowOrderForwarding",
    stateMutability: "nonpayable",
    inputs: [{ name: "allow", type: "bool" }],
    outputs: [],
  },
] as const;
