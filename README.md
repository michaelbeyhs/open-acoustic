# OpenAcoustic

**A browser front panel and reverse-engineering notes for the TC‑Helicon Play Acoustic.**
Control a **stock** Play Acoustic live from your laptop (or an iPad) over USB‑MIDI — no firmware modification — plus the research behind how it works.

![Unofficial](https://img.shields.io/badge/project-unofficial-orange)
![Web MIDI](https://img.shields.io/badge/tech-Web%20MIDI%20%2B%20SysEx-5c4ee5)
![Firmware](https://img.shields.io/badge/firmware-PA%201.4.00%20Build%2051-339933)

### ▶ [Try the Remote in your browser »](https://michaelbeyhs.github.io/open-acoustic/tools/pa-remote.html)

Opens the live front panel. Needs **Chrome/Edge** (desktop) or a **Web MIDI browser app** (iPad), with a Play Acoustic connected by USB. No install, nothing to flash.

<p align="center">
  <img src="docs/img/pa-remote.jpg" alt="Play Acoustic Remote — a virtual front panel in the browser" width="640">
</p>

### ▶ [Open the touch views »](https://michaelbeyhs.github.io/open-acoustic/tools/views/) · [try them with a simulated pedal](https://michaelbeyhs.github.io/open-acoustic/tools/views/1-pedalboard.html?sim)

Five touch-screen ways to drive the same pedal, made for an iPad: **Pedalboard** (the effect chain as stomp boxes), **Studio editor** (every parameter, EQ/compressor graphs, effect sends, mix, A/B, undo), **Signal grid** (signal flow + inspector), **Stage** (big tiles, HIT, a delay/reverb pad) and **Voice map** (harmony voices on a pitch ladder, the reverb as a room). They share one connection, one preset bar and the same gestures, stay in sync with the pedal both ways, and can read all presets once so switching presets is instant.

<p align="center">
  <a href="https://michaelbeyhs.github.io/open-acoustic/tools/views/"><img src="docs/img/views-collage.jpg" alt="The five touch views: Pedalboard, Stage, Studio editor, Signal grid and Voice map" width="900"></a>
</p>

> _**Unofficial** community project. Not affiliated with, endorsed by, or supported by TC‑Helicon / Music Tribe. "Play Acoustic", "Play Electric" and "TC‑Helicon" are trademarks of their respective owner, used here only descriptively. **No proprietary firmware binaries or disassembly are distributed in this repository.** Use at your own risk._

---

## What this is

Three things, from the same reverse‑engineering effort:

1. **Play Acoustic Remote** (`tools/pa-remote.html`) — a virtual front panel that reads and sets the pedal's parameters live, in real time, using the firmware's own built‑in SysEx commands. The real pedal has no screen you can see from the audience and tiny buttons; this gives you the whole UI on a laptop or tablet.
2. **Touch views** (`tools/views/`) — five touch-first views of the same live connection, beyond what the pedal's own screen can show (see `tools/README.md`).
3. **The research** — how the editor fetches firmware, the SysEx framing, the DSP identification, parameter/menu maps, and the MIDI CC map, written up in `docs/`.

Everything here talks to **unmodified, factory firmware**. Nothing needs to be flashed.

## Quick start — the Remote

1. Connect the Play Acoustic by **USB**. **Quit VoiceSupport** if it's running (it corrupts incoming SysEx).
2. Open **`tools/pa-remote.html`** in **Chrome or Edge** on Mac/PC (keep `pa-menus.js` and `pa-images.js` next to it). Or serve the folder and open the URL:
   ```bash
   cd tools && python3 -m http.server 8099
   # then open http://localhost:8099/pa-remote.html
   ```
3. Click **Connect** in the top bar and allow MIDI + SysEx. The status should read **"Connected: Play Acoustic"**.
4. Drive it like the hardware: soft buttons open menus, ◀ ▶ change pages, **BACK** returns to the preset screen, the knob takes drag / scroll / arrow keys (Shift = ×10), **HIT** toggles HIT.

Below the panel there's a **live parameter control** (any parameter by name or ID) and a **MIDI monitor**.

### On iPad / iPhone
iOS/iPadOS browsers (all WebKit) have **no Web MIDI**. Use a **Web MIDI browser app** that adds Web MIDI with SysEx, connect the pedal through a USB adapter, and open the page from a URL. The panel is touch‑friendly and sized for a tablet.

> ### ⚠️ Safety
> - The tools only change parameters from the pedal's own menu pages (plus a short expert list, `tools/pa-writes.js`), and **never** **MIDI CTRL (`0x278`)** or **FILTER (`0x27B`)**. Either can make the pedal ignore USB SysEx after the next power‑up, and there is no MIDI socket to undo it.
> - **Factory reset** (if ever needed): hold **STORE + BACK** while powering on. It erases settings **and your presets/favorites** — back those up first.

## What works today

- Live set/read of menu parameters; Mix and Setup pages; preset name; Harmony FX page layout.
- **Not yet mapped:** preset up/down footswitches, STORE / FAVORITE / GENRE, tuner and looper screens.
- See **`tools/verify.html`** for the current item‑by‑item status on real hardware.

## Findings at a glance

- **Firmware delivery:** the oddeyez web editor serves every image as a static file (`manifest.json` + `/app/firmware/*.syx`); there is no server‑side version gate.
- **Format:** the `.syx` images are **unencrypted**, 7‑bit‑packed SysEx with the TC‑Helicon header `00 01 38 00 60`.
- **Processor:** the code is **Freescale/Motorola DSP56300**.
- **MIDI CC map (stock):** the firmware maps only **4 CCs** to parameters — **CC28 (HIT)**, **CC30**, **CC31**, **CC114** — through a generic CC→parameter engine. (Recovered by emulating the firmware; CC28=HIT confirmed, the others pending hardware verification.)

Full write‑ups: **`docs/index.html`** (rendered overview), **`docs/ANALYSIS.md`**, **`docs/SYSEX.md`** (SysEx reference), **`docs/MENUS.md`** (menu layout).

## Repository layout

| Path | Contents |
|------|----------|
| `tools/` | The Remote (`pa-remote.html`), the verification checklist (`verify.html`), and extraction/analysis scripts |
| `tools/views/` | The touch views (`index.html`), their shared model/gestures (`views.js`) and a simulated pedal (`sim-pedal.js`); `tools/pa-link.js` is the MIDI/SysEx link they use |
| `docs/` | Analysis write‑ups, SysEx/menu references, rendered overview, images |
| `data/` | Parameter and menu tables, string lists, UI map (factual data) |
| `graphics/` | Display assets extracted from the firmware (fonts, bitmaps, icons) |
| `emulation/`, `legacy/` | Emulator run notes and earlier analysis passes |

> **Not included on purpose:** the firmware images (`*.syx`), raw program/section/RAM dumps (`*.bin`), and the full disassembly. These are TC‑Helicon's proprietary firmware; they're kept locally and git‑ignored, never published here. The stock images are downloadable from the official sources if you need a recovery copy.

## How it was made

The firmware was captured from publicly reachable sources, identified as DSP56300, disassembled with a purpose‑built DSP56300 disassembler, and run in an emulator to observe behavior (such as the runtime‑built CC table) that isn't visible in the static image. Only **facts and original tools** derived from that work live in this repo — see the "Not included" note above.

## Status & contributing

Early but working. The biggest open items are in **`TODO.md`**; hardware‑verified corrections to the parameter/CC maps are especially welcome. Issues and PRs against `data/` and `docs/` are the easiest way to help.
