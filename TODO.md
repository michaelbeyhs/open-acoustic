# TODO: Play Acoustic remote and firmware notes

> The interactive version of the checks and to-dos is `tools/verify.html` (status + notes per item, export to JSON/Markdown).

Status 2026-11-13. "Confirmed" = seen on the unit; everything else is from the firmware code or a simulated pedal.

## Remote UI
- [x] **Control knob / value editing (`tools/pa-remote.html`)**: the value bars are now draggable (tap selects, drag left/right scrubs), and the knob drag is horizontal (right = up) instead of vertical.

## 1. Check against the unit
- [ ] **Vocal FX pages 2–7** (Double, Delay, Reverb, HardTune, Transducer, uMOD): only Harmony has been compared with a photo. Check the picture, the right-column order and CONTROL.
- [ ] **Guitar FX pages**, both BodyRez EDITING = BASIC (4 pages) and ADVANCED (7 pages). The BodyRez EQ page has no CONTROL in the firmware: what does the pedal show in its third box?
- [ ] **Advanced pages** (Harmony/Delay/Transducer/Guitar Reverb/Delay/uMOD "ADV"): how does the pedal open them? The panel uses a checkbox as a stand-in.
- [ ] **Preset name and number** on the preset screen: is the number right or off by one, and does the name update on preset change?
- [ ] **CONTROL** (OFF/ON/HIT) and the **new Setup IDs** (0x312 HEADPHONE LIM, 0x317 VOCAL CANCEL, 0x352 MIC BOOST, SWITCH-6, MP76 …): read and set via SysEx not tried yet.
- [ ] **Mix variants**: the AUX page with a cable in AUX IN; the page with neither AUX nor ROOMSENSE (ROOMSENSE = 2?).

## 2. Panel gaps
- [ ] **Value formats** still shown as raw numbers:
  - LOW CUT / ROOMSENSE LOCUT (format 0x5F, frequency table);
  - NOTCH FREQ (0x60, note + Hz);
  - DECAY (0x85), SPEED (0x49), AMOUNT (0x6F), SHIFT (0x96);
  - MP75 CONTROL (0x88), LCD CONTRAST.

  Decode the formatter (descriptor word 12) the same way as the value-name table.
- [ ] **Preset up/down, STORE, FAVORITE, GENRE**: not mapped. The SysEx `55` panel tunnel didn't work. Next ideas:
  - find the preset-load path (`func_444889`) reachable from SysEx;
  - or test whether writing 0x2A4 loads a preset.
- [ ] **Screens not mirrored**: tuner, looper status, HIT/TALK, pop-up messages, genre/favorite lists.
- [ ] **Product Info page**: fill in the firmware version from the identity reply.
- [ ] **Pixel-exact LCD**: the fonts are decoded (§16), so the panel could draw with the pedal's own fonts at 128×64 instead of approximating with CSS.
- [ ] **Unnamed parameters**: the "Any parameter" list still only covers 0x000–0x2BF. Add 0x2C0–0x3B3, plus names for the ~600 unnamed preset internals.

## 3. Safety and robustness
- [ ] **Writes**: only allow parameters that appear in the menus, plus an explicit expert list, instead of a block-list. MIDI CTRL and FILTER locked the pedal out once; SYSEXID 0x27C and MIDI CHAN are candidates too.
- [ ] **Setup backup before any write session**: read the 7 setup packets (`15`) and save them as a file (done: Remote, *Presets and backup* ▸ *Back up settings*), with a one-click restore (`13`, still open).
- [ ] **Auto-recover after power cycle / reconnect**: re-identify on the port state change and show a clear "pedal not answering" state.
- [ ] **Polling**: fewer round trips (read only changed or visible cells, back off when idle).

## 4. New feature ideas
- [ ] **MIDI controller bridge** (the original goal): map any external MIDI controller or expression pedal CC to SysEx `22` set-parameter in the browser. The pedal's AVR drops CCs, but the bridge doesn't need it to accept them.
  - Learn mode: move a knob, click a parameter.
  - Curves and ranges.
  - Several parameters per controller.
- [ ] **Stand-alone bridge** (Python or Node, no browser) for live use, with the same mapping file.
- [ ] **Preset librarian**:
  - [x] list all presets with names (`45 bank num`; Remote, *Presets and backup*);
  - [x] back up to file (the `20`/`21` replies as a `.syx`);
  - [ ] restore (`20`/`21`) and rename.

  The factory reset showed why backups matter.
- [ ] **Snapshots and morphing**: save a set of parameter values and recall or crossfade between them live.
- [ ] **Tempo sync**: MIDI clock or tap in the browser → TEMPO 0x158.
- [ ] **Demo/offline mode** with a simulated pedal, for screenshots and the video.

## 5. Documentation
- [x] **`tools/README` for the remote** (also: iPad needs a MIDI browser app with Web MIDI + SysEx, and the page served from a URL; test which app works):
  - setup (Chrome, close VoiceSupport);
  - what works;
  - safety rules (never change MIDI CTRL/FILTER);
  - factory reset = hold STORE + BACK at power-on (erases user presets).
- [x] **`docs/index.html` is out of date** (published artifact). Add:
  - SysEx live control;
  - menu extraction;
  - display images;
  - the USB lock-out and reset;
  - the remote.

  Then republish.
- [x] **`docs/SYSEX.md`**: add CONTROL params, the 0x2C0–0x3B3 setup IDs, value formats, the identity fallback (channel byte 7F) and a "dangerous parameters" section.
- [ ] **`docs/MENUS.md`**: mark Vocal/Guitar FX as verified once checked; describe the FX page layout.
- [x] **`data/params-1.4.00.csv`**: extend to 0x3B3 with value names and format codes (`menu_dump.py` already has them).
- [x] **`docs/ANALYSIS.md`**: it's chronological (§0–§27). Add a topic index or split it: format, boot, MIDI/SysEx, menus, graphics, safety.
- [x] **"Confirmed on hardware" table** (`docs/ANALYSIS.md` §19 and `tools/verify.html`): one place listing what has been tested on the unit versus derived from code.
- [ ] **Publishing note**:
  - `graphics/`, `tools/pa-images.js` and the firmware strings are TC-Helicon material, so check before making the repo public;
  - the stock `.syx` files must not be redistributed.
- [x] **Tidy-up**: CC approach moved to `legacy/cc-approach/`.
