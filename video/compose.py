#!/usr/bin/env python3
"""Assemble the main demo from one recorded take (record.mjs).

Inputs : out/term.mp4 (VHS), out/events.log (command start/end, wall clock), out/dash/*.jpg + frames.json (dashboard).
Outputs: out/demo-main.mp4 (1920x1080, 25 fps, silent), out/demo-main.srt, out/check/*.png (one still per shot).

Layout: bottom-right corner (x > 1480, y > 812) stays free for the presenter's camera; subtitles sit bottom-left.

    .venv/bin/python compose.py
"""
import json
import os
import re
import shutil
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
TMP = os.path.join(OUT, "tmp")
W, H, FPS, XF = 1920, 1080, 25, 0.35

TERM_W, TERM_H = 2000, 1736
DASH_W, DASH_H = 2400, 2800  # 1200x1400 CSS px at 2x
SPLIT_TERM = (40, 76, 920, 799)
SPLIT_DASH = (992, 76, 888, 716)
ZOOM = (40, 76, 1840, 716)
TYPE_MS, ENTER_PAUSE = 0.045, 0.6

SUBS = {
    "hook": ["This is mm-plugin-perpl. It gives a MetaMask Agent Wallet a new skill: trading perps on Perpl, Monad's on-chain exchange.",
             "On the left, the agent's terminal. On the right, what the human sees."],
    "signals": ["The agent asks Nansen what smart money is doing.",
                "A direction, the evidence, and a size already capped by the guard. It never trades on its own."],
    "guard": ["Perpl orders go through an API key, so MetaMask's Guard Mode never sees them.",
              "The plugin has its own guard. 500 dollars at 10x: refused before anything reaches the exchange.",
              "Raising a limit is a decision, never a retry."],
    "order": ["20 dollars at 2x is within the guard. The plugin states the exact order and asks for a yes.",
              "Filled on Perpl."],
    "right": ["And on the right, without touching anything: the position, its PnL, and how far it is from liquidation."],
    "dashpos": ["Margin ratio, maintenance margin, estimated liquidation price,",
                "and the same alert thresholds the agent's risk check uses from a cron job."],
    "dashact": ["Below, the agent's activity, each line linked to the explorer.",
                "All of it read straight from the Perpl contract: no API key, no backend."],
    "close": ["Closing reduces risk, so no cap blocks it, but it still asks.",
              "Closed: the position leaves the dashboard, and the activity feed keeps the record."],
    "outro": ["mm-plugin-perpl: perps on Monad, for agents you can trust."],
}


def run(cmd, quiet=True):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL if quiet else None, stderr=subprocess.DEVNULL if quiet else None)


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())


# ---------------------------------------------------------------- 1. events and time mapping
def parse_events():
    t0, cmds, clears, pending = None, [], [], None
    for line in open(os.path.join(OUT, "events.log")):
        parts = line.strip().split(" ", 2)
        if len(parts) < 2:
            continue
        t, kind = float(parts[0]), parts[1]
        if kind == "end":
            if t0 is None:
                t0 = t
            if pending is not None:
                pending["end"] = t
                pending = None
        elif kind == "start":
            cmd = parts[2] if len(parts) > 2 else ""
            if cmd == "clear":
                clears.append(t)
            else:
                pending = {"start": t, "cmd": cmd}
                cmds.append(pending)
    if t0 is None or len(cmds) < 4:
        sys.exit(f"events.log incomplete: {len(cmds)} commands")
    return t0, cmds, clears


def video_clears(term):
    stats = os.path.join(TMP, "yavg.txt")
    run(["ffmpeg", "-v", "error", "-y", "-i", term, "-vf", f"scale=200:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file={stats}", "-f", "null", "-"])
    ts, ys, cur = [], [], 0.0
    for line in open(stats):
        m = re.search(r"pts_time:([\d.]+)", line)
        if m:
            cur = float(m.group(1))
        m = re.search(r"YAVG=([\d.]+)", line)
        if m:
            ts.append(cur)
            ys.append(float(m.group(1)))
    base = min(ys)
    found, prev = [], None
    for t, y in zip(ts, ys):
        lvl = y - base
        if prev is not None and prev > 0.5 and lvl < 0.2 and t > 1.0:
            found.append(t)
        prev = lvl
    return found


def make_mapper(t0, wall_clears, vid_clears, dur):
    anchors = [(0.0, 0.0)]
    if len(vid_clears) == len(wall_clears):
        anchors += [(w - t0, v) for w, v in zip(wall_clears, vid_clears)]
    else:
        print(f"! {len(vid_clears)} clears found in the video for {len(wall_clears)} in the log: linear mapping")
    slope = 1.0 if len(anchors) < 2 else (anchors[-1][1] - anchors[-2][1]) / max(1e-6, anchors[-1][0] - anchors[-2][0])

    def V(wall):
        r = wall - t0
        for (a, va), (b, vb) in zip(anchors, anchors[1:]):
            if r <= b:
                return va + (r - a) * (vb - va) / max(1e-6, b - a)
        a, va = anchors[-1]
        return min(dur, va + (r - a) * slope)

    return V


# ---------------------------------------------------------------- 2. framing helpers
def term_frame(term, t):
    path = os.path.join(TMP, f"tf_{t:.2f}.png")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t):.3f}", "-i", term, "-frames:v", "1", path])
    return Image.open(path).convert("L")


def text_box(img):
    mask = img.point(lambda v: 255 if v > 80 else 0)
    return mask.getbbox() or (0, 0, TERM_W, 120)


def crop_typing(img):
    _, y0, _, y1 = text_box(img)
    ch = 380
    cy = max(0, min(TERM_H - ch, (y0 + y1) // 2 - ch // 2))
    return (0, cy, TERM_W, ch)


def crop_output(img, max_h=1150):
    _, y0, _, y1 = text_box(img)
    ch = max(520, min(max_h, y1 - y0 + 90))
    bottom = min(TERM_H, y1 + 45)
    return (0, max(0, bottom - ch), TERM_W, ch)


def fit(crop, rect):
    _, _, cw, ch = crop
    x, y, w, h = rect
    s = min(w / cw, h / ch)
    sw, sh = int(cw * s) // 2 * 2, int(ch * s) // 2 * 2
    return sw, sh, x + (w - sw) // 2, y + (h - sh) // 2


def dash_boxes_at(frames, V, t):
    best = None
    for f in frames:
        if "boxes" in f and V(f["t"]) <= t + 0.5:
            best = f["boxes"]
    return best or next(f["boxes"] for f in frames if "boxes" in f)


def dash_crop(boxes, top_key, bottom_key, min_h=330):
    top = boxes.get(top_key) or {"y": 0, "h": 0}
    bot = boxes.get(bottom_key) or top
    y0 = max(0, top["y"] - 18)
    y1 = max(y0 + min_h, bot["y"] + bot["h"] + 18)
    y0, y1 = int(y0 * 2), int(min(DASH_H / 2, y1) * 2)
    return (0, y0, DASH_W, y1 - y0)


# ---------------------------------------------------------------- 3. dashboard track
def build_dash_track(frames, V, dur):
    lst = os.path.join(TMP, "dash.txt")
    timed = [(V(f["t"]), f["file"]) for f in frames]
    timed = [(vt, fl) for vt, fl in timed if vt <= dur + 1]
    start = max([i for i, (vt, _) in enumerate(timed) if vt <= 0] or [0])
    timed = timed[start:]
    timed[0] = (0.0, timed[0][1])
    with open(lst, "w") as f:
        for (vt, fl), nxt in zip(timed, timed[1:] + [(dur + 1, None)]):
            f.write(f"file '{os.path.join(OUT, 'dash', fl)}'\nduration {max(0.04, nxt[0] - vt):.3f}\n")
        f.write(f"file '{os.path.join(OUT, 'dash', timed[-1][1])}'\n")
    path = os.path.join(TMP, "dash.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-vf", f"fps={FPS},format=yuv420p",
         "-c:v", "libx264", "-preset", "ultrafast", "-crf", "14", path])
    return path


# ---------------------------------------------------------------- 4. shots
def render_shot(i, shot, term, dash, overlays):
    d = shot["end"] - shot["start"]
    out = os.path.join(TMP, f"shot_{i:02d}.mp4")
    layout = shot["layout"]
    if layout.startswith("card"):
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", f"{d:.3f}", "-i", overlays[layout], "-vf", f"fps={FPS},format=yuv420p",
             "-c:v", "libx264", "-preset", "medium", "-crf", "16", out])
        return out
    inputs = ["-loop", "1", "-t", f"{d:.3f}", "-i", overlays["bg-" + layout]]
    chain, last, n = [], "0:v", 1
    for src, crop_key, rect_key in (("term", "term_crop", "term_rect"), ("dash", "dash_crop", "dash_rect")):
        if crop_key not in shot:
            continue
        inputs += ["-ss", f"{shot['start']:.3f}", "-t", f"{d:.3f}", "-i", term if src == "term" else dash]
        cx, cy, cw, ch = shot[crop_key]
        sw, sh, ox, oy = fit(shot[crop_key], shot[rect_key])
        chain.append(f"[{n}:v]crop={cw}:{ch}:{cx}:{cy},scale={sw}:{sh}:flags=lanczos[s{n}]")
        chain.append(f"[{last}][s{n}]overlay={ox}:{oy}:shortest=1[o{n}]")
        last, n = f"o{n}", n + 1
    chain.append(f"[{last}]fps={FPS},format=yuv420p[v]")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(chain), "-map", "[v]", "-t", f"{d:.3f}",
         "-c:v", "libx264", "-preset", "medium", "-crf", "16", out])
    return out


def main():
    os.makedirs(TMP, exist_ok=True)
    term = os.path.join(OUT, "term.mp4")
    dur = duration(term)
    t0, cmds, clears = parse_events()
    V = make_mapper(t0, clears, video_clears(term), dur)
    sig, guard, order, close = cmds[:4]
    frames = json.load(open(os.path.join(OUT, "dash", "frames.json")))
    typing = lambda c: len(c["cmd"]) * TYPE_MS + ENTER_PAUSE + 0.25

    c1, c2, c3 = (V(c) for c in clears[:3])
    t_sig, t_guard, t_order, t_close = (V(c["start"]) for c in (sig, guard, order, close))
    e_order, e_close = V(order["end"]), V(close["end"])

    shots = [
        {"name": "intro", "layout": "card-intro", "start": 0.0, "end": 3.0, "beat": "hook"},
        {"name": "hook", "layout": "split", "start": 3.0, "end": t_sig - typing(sig), "beat": "hook"},
        {"name": "sig-type", "layout": "term", "start": t_sig - typing(sig), "end": t_sig + 0.5, "beat": "signals", "frame": t_sig - 0.1, "mode": "typing"},
        {"name": "sig-out", "layout": "term", "start": t_sig + 0.5, "end": c1, "beat": "signals", "frame": c1 - 0.3, "mode": "output"},
        {"name": "guard-type", "layout": "term", "start": c1, "end": t_guard + 0.4, "beat": "guard", "frame": t_guard - 0.1, "mode": "typing"},
        {"name": "guard-out", "layout": "term", "start": t_guard + 0.4, "end": c2, "beat": "guard", "frame": c2 - 0.3, "mode": "output", "max_h": 700},
        {"name": "order-type", "layout": "term", "start": c2, "end": e_order - 0.4, "beat": "order", "frame": e_order - 0.9, "mode": "typing"},
        {"name": "order-out", "layout": "term", "start": e_order - 0.4, "end": e_order + 3.0, "beat": "order", "frame": e_order + 2.5, "mode": "output", "max_h": 600},
        {"name": "right", "layout": "split", "start": e_order + 3.0, "end": e_order + 11.0, "beat": "right"},
        {"name": "dash-pos", "layout": "dash", "start": e_order + 11.0, "end": e_order + 21.0, "beat": "dashpos", "dash_keys": ("stats", "alerts")},
        {"name": "dash-act", "layout": "dash", "start": e_order + 21.0, "end": c3, "beat": "dashact", "dash_keys": ("activity", "activity")},
        {"name": "close", "layout": "split", "start": c3, "end": min(dur, e_close + 5.0), "beat": "close"},
        {"name": "outro", "layout": "card-outro", "start": min(dur, e_close + 5.0), "end": max(dur, e_close + 10.0), "beat": "outro"},
    ]
    shots = [s for s in shots if s["end"] - s["start"] >= 0.8]

    for s in shots:
        if s["layout"] == "split":
            s["term_crop"], s["term_rect"] = (0, 0, TERM_W, TERM_H), SPLIT_TERM
            s["dash_crop"], s["dash_rect"] = (0, 0, DASH_W, int(SPLIT_DASH[3] / SPLIT_DASH[2] * DASH_W)), SPLIT_DASH
        elif s["layout"] == "term":
            img = term_frame(term, s["frame"])
            s["term_crop"] = crop_typing(img) if s["mode"] == "typing" else crop_output(img, s.get("max_h", 1150))
            s["term_rect"] = ZOOM
        elif s["layout"] == "dash":
            s["dash_crop"], s["dash_rect"] = dash_crop(dash_boxes_at(frames, V, s["start"] + 1.0), *s["dash_keys"]), ZOOM
    # the outro may run past the terminal recording: cards don't need it
    print("shots:", ", ".join(f"{s['name']} {s['end'] - s['start']:.1f}s" for s in shots))

    # overlays
    timeline, t = [], 0.0
    for k, s in enumerate(shots):
        start = 0.0 if k == 0 else t - XF
        timeline.append(start)
        t = start + (s["end"] - s["start"])
    total = t
    subs = []
    for beat, lines in SUBS.items():
        idx = [k for k, s in enumerate(shots) if s["beat"] == beat]
        if not idx:
            continue
        a = timeline[idx[0]] + 0.3
        b = timeline[idx[-1]] + (shots[idx[-1]]["end"] - shots[idx[-1]]["start"]) - 0.2
        words = [len(l.split()) for l in lines]
        acc = a
        for line, wc in zip(lines, words):
            span = (b - a) * wc / sum(words)
            subs.append((acc, acc + span - 0.15, line))
            acc += span

    ov = [
        {"type": "bg", "file": os.path.join(TMP, "bg-split.png"),
         "panels": [dict(zip("xywh", SPLIT_TERM), fill="#191919"), dict(zip("xywh", SPLIT_DASH), fill="#f7f7f5")],
         "labels": [{"x": SPLIT_TERM[0], "text": "AGENT · TERMINAL", "kind": "agent"}, {"x": SPLIT_DASH[0], "text": "HUMAN · DASHBOARD", "kind": "human"}]},
        {"type": "bg", "file": os.path.join(TMP, "bg-term.png"), "panels": [dict(zip("xywh", ZOOM), fill="#191919")],
         "labels": [{"x": ZOOM[0], "text": "AGENT · TERMINAL", "kind": "agent"}]},
        {"type": "bg", "file": os.path.join(TMP, "bg-dash.png"), "panels": [dict(zip("xywh", ZOOM), fill="#f7f7f5")],
         "labels": [{"x": ZOOM[0], "text": "HUMAN · DASHBOARD", "kind": "human"}]},
        {"type": "card", "file": os.path.join(TMP, "card-intro.png"), "title": "mm-plugin-perpl", "text": "Perps on Monad for the MetaMask Agent Wallet, under limits the agent can't get around."},
        {"type": "card", "file": os.path.join(TMP, "card-outro.png"), "title": "mm-plugin-perpl", "text": "Perps on Monad, for agents you can trust.",
         "links": ["perpl-agent-monitor.vercel.app", "github.com/akugone/mm-plugin-perpl"]},
    ] + [{"type": "subtitle", "file": os.path.join(TMP, f"sub_{i:02d}.png"), "text": text} for i, (_, _, text) in enumerate(subs)]
    json.dump(ov, open(os.path.join(TMP, "overlays.json"), "w"))
    run(["node", os.path.join(HERE, "render_overlays.mjs"), os.path.join(TMP, "overlays.json")], quiet=False)
    overlays = {"bg-split": ov[0]["file"], "bg-term": ov[1]["file"], "bg-dash": ov[2]["file"], "card-intro": ov[3]["file"], "card-outro": ov[4]["file"]}

    print("dashboard track…")
    dash = build_dash_track(frames, V, dur)
    print("shots…")
    files = [render_shot(i, s, term, dash, overlays) for i, s in enumerate(shots)]

    print("transitions and subtitles…")
    inputs, chain, last = [], [], "0:v"
    for f in files:
        inputs += ["-i", f]
    for k in range(1, len(files)):
        chain.append(f"[{last}][{k}:v]xfade=transition=fade:duration={XF}:offset={timeline[k]:.3f}[x{k}]")
        last = f"x{k}"
    base = len(files)
    for j, (a, b, _) in enumerate(subs):
        inputs += ["-loop", "1", "-t", f"{total:.3f}", "-i", os.path.join(TMP, f"sub_{j:02d}.png")]
        chain.append(f"[{last}][{base + j}:v]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[u{j}]")
        last = f"u{j}"
    chain.append(f"[{last}]format=yuv420p[v]")
    final = os.path.join(OUT, "demo-main.mp4")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(chain), "-map", "[v]", "-t", f"{total:.3f}",
         "-r", str(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", final])

    def ts(x):
        h, r = divmod(x, 3600)
        m, s = divmod(r, 60)
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"

    with open(os.path.join(OUT, "demo-main.srt"), "w") as f:
        for j, (a, b, text) in enumerate(subs, 1):
            f.write(f"{j}\n{ts(a)} --> {ts(b)}\n{text}\n\n")

    check = os.path.join(OUT, "check")
    shutil.rmtree(check, ignore_errors=True)
    os.makedirs(check)
    for k, s in enumerate(shots):
        mid = timeline[k] + (s["end"] - s["start"]) * 0.6
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{mid:.2f}", "-i", final, "-frames:v", "1", "-vf", "scale=960:-1", os.path.join(check, f"{k:02d}-{s['name']}.png")])
    print(f"done: {final} ({total:.1f}s), {len(subs)} subtitles, stills in out/check/")


if __name__ == "__main__":
    main()
