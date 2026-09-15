/**
 * Trading WebSocket session: API-key sign-in, initial snapshots, order placement with status tracking.
 *
 * Uses the global WebSocket (Node ≥ 22). One session per command invocation; closed at the end.
 */
import { CommandError } from "@metamask/agent-wallet/plugin";
import { type ApiCredentials, buildSignIn } from "./auth.js";
import { network } from "./config.js";
import type { Account, Order, OrderRequest, Position, StatusResponse, WalletSnapshot } from "./types.js";

const MT = { Ping: 1, Status: 3, Wallet: 19, WalletUpdate: 20, AccountUpdate: 21, OrdersSnapshot: 23, OrdersUpdate: 24, PositionsSnapshot: 26, PositionsUpdate: 27, Heartbeat: 100 } as const;

type Frame = { mt: number; [k: string]: unknown };

export type SessionOptions = {
  /** Time to wait for the wallet snapshot after sign-in. */
  timeoutMs?: number;
  /** After the wallet snapshot, wait this long for orders/positions snapshots (they may legitimately never come). */
  snapshotGraceMs?: number;
  WebSocketImpl?: typeof WebSocket;
};

export type PlaceResult = {
  rq: number;
  accepted: boolean;
  gateway: StatusResponse["status"];
  /** First definitive update for this rq (open, filled, failed…), when it arrived within the timeout. */
  order?: Order;
};

export class TradingSession {
  wallet?: WalletSnapshot;
  accounts: Account[] = [];
  positions: Position[] = [];
  orders: Order[] = [];
  headBlock?: number;
  private nextRqValue = 0;
  private sn = 0;
  private readonly listeners = new Set<(frame: Frame) => void>();
  private pingTimer?: ReturnType<typeof setInterval>;

  private constructor(private readonly ws: WebSocket, readonly chainId: number) {}

  static async open(chainId: number, creds: ApiCredentials, opts: SessionOptions = {}): Promise<TradingSession> {
    const net = network(chainId);
    const Impl = opts.WebSocketImpl ?? globalThis.WebSocket;
    if (!Impl) throw new CommandError("WS_UNAVAILABLE", "No WebSocket implementation available.", "Use Node.js 22 or newer.");
    const ws = new Impl(`${net.ws}/ws/v1/trading`);
    const session = new TradingSession(ws, chainId);
    const timeoutMs = opts.timeoutMs ?? 15_000;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new CommandError("PERPL_WS_TIMEOUT", `Perpl ${net.name} trading socket did not answer within ${timeoutMs / 1000}s.`, "Check your network and try again.")), timeoutMs);
      ws.addEventListener("open", () => {
        // First frame must be the signed sign-in, within the server's idle window (5s mainnet).
        ws.send(JSON.stringify(buildSignIn(creds, chainId)));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new CommandError("PERPL_WS_ERROR", `Could not connect to Perpl ${net.name} trading socket.`, "Check your network and try again."));
      });
      ws.addEventListener("close", (ev) => {
        clearTimeout(timer);
        const e = ev as CloseEvent;
        if (!session.wallet) {
          reject(new CommandError("PERPL_WS_CLOSED", `Perpl closed the trading socket during sign-in (code ${e.code}${e.reason ? `: ${e.reason}` : ""}).`, "Code 1008 usually means the API key was rejected or the sign-in arrived late. Run `mm perpl enroll` again if it persists."));
        }
      });
      ws.addEventListener("message", (ev) => {
        const frame = parseFrame((ev as MessageEvent).data);
        if (!frame) return;
        session.dispatch(frame);
        if (frame.mt === MT.Wallet) {
          clearTimeout(timer);
          resolve();
        } else if (frame.mt === MT.Status && !session.wallet) {
          const st = (frame as unknown as StatusResponse).status;
          if (st && st.code !== 0) {
            clearTimeout(timer);
            reject(new CommandError("PERPL_SIGNIN_REJECTED", `Perpl rejected the API-key sign-in: ${st.error ?? `code ${st.code}`}.`, "Run `mm perpl enroll` to create a fresh key."));
          }
        }
      });
    });

    // Orders/positions snapshots follow the wallet snapshot; give them a moment.
    await session.waitFor((f) => f.mt === MT.PositionsSnapshot, opts.snapshotGraceMs ?? 1_500).catch(() => undefined);
    session.pingTimer = setInterval(() => {
      try {
        ws.send(JSON.stringify({ mt: MT.Ping, t: Date.now() }));
      } catch {
        /* closing */
      }
    }, 30_000);
    return session;
  }

  private dispatch(frame: Frame): void {
    switch (frame.mt) {
      case MT.Wallet: {
        const w = frame as unknown as WalletSnapshot;
        this.wallet = w;
        this.accounts = w.as ?? [];
        this.headBlock = w.at?.b ?? this.headBlock;
        const lfr = Math.max(0, ...this.accounts.map((a) => a.lfr ?? 0));
        this.nextRqValue = Math.max(this.nextRqValue, lfr);
        break;
      }
      case MT.AccountUpdate: {
        const a = frame as unknown as Account;
        const i = this.accounts.findIndex((x) => x.id === a.id);
        if (i >= 0) this.accounts[i] = { ...this.accounts[i], ...a };
        else this.accounts.push(a);
        if (typeof a.lfr === "number") this.nextRqValue = Math.max(this.nextRqValue, a.lfr);
        break;
      }
      case MT.PositionsSnapshot: {
        const d = (frame as { d?: Position[] }).d;
        this.positions = (d ?? []).filter((p) => p.st === 1);
        break;
      }
      case MT.PositionsUpdate: {
        for (const p of (frame as { d?: Position[] }).d ?? []) {
          const i = this.positions.findIndex((x) => x.pid === p.pid);
          if (p.st !== 1) {
            if (i >= 0) this.positions.splice(i, 1);
          } else if (i >= 0) this.positions[i] = p;
          else this.positions.push(p);
        }
        break;
      }
      case MT.OrdersSnapshot: {
        this.orders = ((frame as { d?: Order[] }).d ?? []);
        break;
      }
      case MT.Heartbeat: {
        const h = (frame as { h?: number }).h;
        if (typeof h === "number") this.headBlock = h;
        break;
      }
      default:
        break;
    }
    for (const l of this.listeners) l(frame);
  }

  private waitFor(pred: (f: Frame) => boolean, timeoutMs: number): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error("timeout"));
      }, timeoutMs);
      const listener = (f: Frame) => {
        if (pred(f)) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(f);
        }
      };
      this.listeners.add(listener);
    });
  }

  /** The exchange account orders are placed from: the first (usually only) account of the wallet. */
  account(): Account | undefined {
    return this.accounts[0];
  }

  nextRq(): number {
    this.nextRqValue += 1;
    return this.nextRqValue;
  }

  /** Send an order, wait for the gateway status (mt 3) and, when accepted, the first update for this rq (mt 24). */
  async place(order: Omit<OrderRequest, "rq" | "sn" | "acc">, acc: number, opts: { timeoutMs?: number } = {}): Promise<PlaceResult> {
    const rq = this.nextRq();
    const sn = ++this.sn;
    const frame: OrderRequest = { ...order, rq, acc, sn };
    const timeoutMs = opts.timeoutMs ?? 20_000;

    const statusP = this.waitFor((f) => f.mt === MT.Status && (f as unknown as StatusResponse).cid === sn, timeoutMs);
    const updateP = this.waitFor((f) => f.mt === MT.OrdersUpdate && ((f as { d?: Order[] }).d ?? []).some((o) => o.rq === rq), timeoutMs);
    this.ws.send(JSON.stringify(frame));

    let status: StatusResponse["status"];
    try {
      status = (await statusP as unknown as StatusResponse).status;
    } catch {
      throw new CommandError("PERPL_NO_STATUS", "Perpl did not acknowledge the order in time.", "The order may still be forwarded; check `mm perpl positions` before retrying.");
    }
    if (status.code !== 0) {
      updateP.catch(() => undefined);
      return { rq, accepted: false, gateway: status };
    }
    let order_: Order | undefined;
    try {
      const upd = (await updateP) as { d?: Order[] };
      order_ = (upd.d ?? []).find((o) => o.rq === rq);
    } catch {
      /* accepted but no update within the window: report as pending */
    }
    return { rq, accepted: true, gateway: status, order: order_ };
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    try {
      this.ws.close(1000, "done");
    } catch {
      /* already closed */
    }
  }
}

function parseFrame(data: unknown): Frame | undefined {
  try {
    const text = typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString("utf8") : data instanceof ArrayBuffer ? Buffer.from(data).toString("utf8") : String(data);
    const obj = JSON.parse(text) as unknown;
    return obj && typeof obj === "object" && typeof (obj as Frame).mt === "number" ? (obj as Frame) : undefined;
  } catch {
    return undefined;
  }
}
