# Play Acoustic SysEx reference (firmware 1.4.00)

Derived from the DSP firmware's SysEx command table and handlers (`disasm/1.4.00`). The meanings of several commands are cross-checked against the oddeyez editor's message builders. Confidence: **confirmed** = seen working on hardware; **code** = clear from the handler code; **likely** = inferred, unverified.

## Framing
```
F0 00 01 38 <ch> <product> <cmd> <payload…> F7
```
- `00 01 38`: TC-Helicon manufacturer ID.
- `<ch>`: device ID/channel byte, taken from the universal identity reply (`F0 7E <ch> 06 02 …`). `7F` is accepted as a wildcard by the DSP's header filter; the remote falls back to it when there is no identity reply.
- `<product>`: `70` Play Acoustic, `71` Play Electric (`7F` accepted as a wildcard). Bootloader traffic uses `60` and is handled by the AVR, not the DSP.
- Every payload byte is 7-bit. Multi-byte numbers are big-endian 7-bit groups:
  - 14-bit: `b0<<7 | b1`
  - 28-bit: `b0<<21 | b1<<14 | b2<<7 | b3`, two's complement for negative values

The DSP checks each command's payload length against its table: the bytes after `<cmd>`, excluding `F7`.

## Command table (18 entries, run address X:7EBFF5)

| Cmd | Payload | Direction | Purpose | Confidence |
|---|---|---|---|---|
| `13` | 104 | both | **Setup packet.** `01 2A <chunk 0–6> <25 params × 4 bytes> <sum>`. Seven packets make the global setup block. The device answers `34` (ack) and shows "SYSEX SETUP ACCEPTED/REJECTED". | confirmed |
| `15` | 1 | → dev | **Request setup** (`15 00`). The device replies with 7 `13` packets, also without a `57` sync session. | confirmed |
| `20` | 24 | both | **Preset header** (`hi lo 01 fmtVersion …`). Starts a preset transfer; "SYSEX PRESET REJECTED" on error. | code + editor |
| `21` | 102 | both | **Preset data packet** (5 per preset, numbered). | code + editor |
| `22` | 6 | both | **Set parameter:** `p1 p0 v3 v2 v1 v0`. Calls the central setter (same as the Control knob). Also the **reply** to `47`. IDs 0x000–0x3B3; 79 blocked by the firmware (0x95–0x98, 0x26D–0x26E, 0x2D2–0x2EA, 0x304–0x30B, 0x36C–0x392, 0x3B3). | **confirmed** (HIT, LOOP LEVEL, Mix GUITAR) |
| `47` | 2 | → dev | **Get parameter:** `p1 p0`. Reply: `22 p1 p0 v3 v2 v1 v0`. | **confirmed** |
| `45` | 2 | → dev | **Request preset** `bank num` (editor: `makeRequestPreset`), i.e. the preset number as two 7-bit bytes. `45 00 00` = current preset (edit buffer); `45 00 nn` = stored preset *nn*, without loading it. Reply: header `20` (with the name) + five data packets `21`; past the last stored preset `34 02 00 00`. | **confirmed** (presets 1–112, numbers as in 0x2A4) |
| `46` | 2 | → dev | Sibling of `45` (same helpers); probably another preset request variant. | likely |
| `50` | 2 | → dev | **Delete preset** `bank num` (editor: `makeDeletePreset`). | editor |
| `57` | 2 | → dev | **Sync session**: `00 00` begin, `00 01` end. Wraps setup and preset reads and writes. | confirmed |
| `55` | 5 | both | **Front-panel event tunnel.** `01 x 00 00 00` sets the tunnel flag (x ≠ 0 = on). `02 v3 v2 v1 v0` injects a 3-byte event (28-bit `e0<<16 \| e1<<8 \| e2`), but only while the tunnel is on; codes `AE`, `DA`, `DB`, `DD` are acted on. While on, the device also reports front-panel events back as `55 …`. (Until 2026-11-13 our tools had `01`/`02` swapped, which is why the first hardware tries showed nothing.) | code |
| `54` | 14 | → dev | Unknown (handler P:44904B). | — |
| `53` | 1 | → dev | Unknown (handler P:4490CB). | — |
| `58` | 1 | → dev | Unknown; touches screen/page state (handler P:4490EE). | — |
| `7A` | 1 | → dev | Unknown; clears two internal lists (handler P:449792). | — |
| `7E` | 9 | → dev | Unknown TC-level query (handler P:4495F4). Not the universal identity request, which is handled separately. | — |
| `31` | 48 | → dev | **No-op** (handler returns immediately). | code |
| `51` | 1 | → dev | **No-op on the DSP.** `60 51` is the AVR's "enter bootloader" message. | code + editor |

Device-originated replies seen: `34` (setup/preset ack), `7E 7F …` (identity/version, product `70`/`71`), and `60 7F 01/00` (bootloader block ack/nak, from the AVR).

## Live control with `22` / `47`
```
set  F0 00 01 38 <ch> 70 22 <p1> <p0> <v3> <v2> <v1> <v0> F7     14 bytes
get  F0 00 01 38 <ch> 70 47 <p1> <p0> F7                          10 bytes   (reply: 14-byte 22 message)
```
Example, set TEMPO (0x158) to 120: `F0 00 01 38 00 70 22 02 58 00 00 00 78 F7`.

Parameter IDs, names and ranges: `data/params-1.4.00.csv`.

### Cost per change
- **14 bytes per set.** Over USB-MIDI this becomes 5 event packets (20 bytes on the bus), normally delivered within one 1 ms USB frame. Then the AVR forwards it and the DSP processes it in its main loop; that latency hasn't been measured, and an estimate is a few ms.
- For scale, the same 14 bytes over a classic 5-pin MIDI cable would take about 4.5 ms. A plain CC is 3 bytes, but the AVR drops CCs.
- **Compare a setup-block rewrite** (what the editor's HIT button does): sync, request, read 7 × 112, write 7 × 112, ack, end sync. That's about 1.6 KB plus built-in waits (50 ms + 6 × 30 ms + ack), so roughly 0.25–0.3 s per change.
- A read-back (`47` + reply) adds 24 bytes and one round trip; leave it off for fast sweeps.

### On-screen messages
- The "SYSEX SETUP ACCEPTED" / "PRESET MODIFIED VIA SYSEX" pop-ups come from the setup and preset handlers. They call the message routine (`func_444485`, shown for 3000 ms).
- The `22` handler does **not** call it: it decodes, looks up the parameter and calls the setter. **Confirmed: no pop-up per change**; the pedal's screen updates as if the knob had been turned.

## Reading the current preset
- **Number:** parameter **0x2A4** (unnamed, 0–65535). The preset loader (`func_444889`) stores the loaded preset's number there through the central setter, so `47 05 24` returns it. Read only; setting it has not been tried.
- **Name:** `45 00 00` (request preset 0 = the current edit buffer). The unit replies with a preset header `20` followed by the preset's data packets (`21`). Header payload (24 bytes): `00 00` preset 0, `01 0C` (0x8C), **15 name bytes** (ASCII; the name ends at the first `00`, and bytes after it are leftovers from the previously loaded name, so cut there), 4-byte flags word X:3F2A (bit 0 = Favorite), `01`. The name is bytes 11–25 of the whole message.
- `tools/pa-remote.html` reads 0x2A4 on every poll and asks for the name only when the number changes. **Name: confirmed on the unit.** Number: not yet checked for an off-by-one.
- **Any stored preset:** `45 <n hi> <n lo>` sends preset *n* (header `20` + five `21`) without loading it, so all names can be read without stepping through the presets (about 5 s for 112 presets over USB). The numbers are the ones 0x2A4 reports. Past the last preset the unit answers `34 02 00 00`. *Presets and backup* in the Remote uses this for the preset list, the name preload and the preset backup.


## Parameter ID ranges
- `0x000`–`0x2BF`: preset parameters (effects, voices, levels, routing). Many share one descriptor and differ by instance (e.g. the LEVEL block 0x0B9–0x0C1).
- `0x2C0`–`0x3B3`: global/system settings and effect state, e.g. effect enables 0x2C3–0x2CA, effect CONTROL (OFF/ON/HIT) 0x2CB–0x2D1, guitar CONTROL 0x353/0x355/0x357, HEADPHONE LIM 0x312, VOCAL CANCEL 0x317, MIC BOOST 0x352, FOOTSWITCH 0x39F, SWITCH-3 0x393–0x395, SWITCH-6 0x3A7–0x3AC, MP76 0x39A–0x39E.
- Names, ranges, value names and the settable flag for all of them: `data/params-1.4.00.csv`.

## Dangerous parameters
| Param | Name | Why |
|---|---|---|
| 0x278 | MIDI CTRL (MERGE / MIDI / USB) | **MIDI** = listen only to the 5-pin input, which the Play Acoustic doesn't have. Took effect after a power cycle and locked out USB SysEx; only a factory reset (STORE + BACK at power-on) recovered it. |
| 0x27B | FILTER (NONE / PRGCHANGE / SYSEX / PC+SYSEX) | SYSEX or PC+SYSEX blocks SysEx the same way. |
| 0x27C | SYSEXID (0–127) | Changes the channel byte; harmless with the `7F` wildcard, but avoid. |
| 0x279 / 0x27A | MIDI CHAN / CC CHAN | Not dangerous for SysEx, but no use either (the AVR drops channel messages). |

The remote refuses 0x278 and 0x27B.

## Fake front-panel presses (SysEx 55) and preset up/down (confirmed)
- `55 01 01 00 00 00` switches the tunnel on. The pedal then reports every front-panel event as `55 <28-bit>` (event = `e0 e1 e2`), and accepts `55 02 <28-bit e0<<16|e1<<8|e2>` to inject one.
- Event codes seen on the unit (2026-11-13, preset screen):

| Control | Event(s) | Effect on the preset screen |
|---|---|---|
| Control knob, one click up | `AE 00 01` | next preset |
| Control knob, one click down | `AE 00 00` | previous preset |
| front ▶ button | `DB 04 00` (press), `DB 04 01` (release) | next preset; inside a menu, next page |
| ▲ footswitch | `DB 0C 00`, `DB 0C 01` | next preset |
| front ◀ button | `DB 05 00`, `DB 05 01` | previous preset; inside a menu, previous page |
| ▼ footswitch | `DB 0D 00`, `DB 0D 01` | previous preset |
| VOCAL FX / GUITAR FX / MIX (left soft buttons, top to bottom) | `DB 09` / `DB 08` / `DB 07` + `00`, `01` | open the menu; inside a menu, select the cell beside it |
| FAVORITE / GENRE / SETUP (right soft buttons) | `DB 00` / `DB 01` / `DB 02` + `00`, `01` | same, right column |
| STORE | `DB 03 00`, `DB 03 01` | store screen |
| BACK | `DB 06 00`, `DB 06 01` | back to the preset screen |
| HIT footswitch | `DB 0B 00` (press), `DB 0B 01` (release) | tap = HIT on/off, hold = TALK |

- Button events: `DB <code> 00` = press, `DB <code> 02` = still held (sent while a button stays down), `DB <code> 01` = release.
- There is no SysEx command that takes a preset number: `45`/`46` only send a preset, `53 02` reloads the current one, `53 03` reports it, writing 0x2A4 only matters at power-up, and Program Change (which would select one) is dropped by the AVR. Injecting the footswitch events is the way to step presets. The pedal reports each change as Bank Select + Program Change.
- An injected event acts on whatever screen the pedal shows, exactly like the real control.
- **Confirmed on the unit:** injected footswitch and knob events change presets. The remote presses the real buttons for its soft buttons, BACK, STORE and ▼ ▲ (option "Press the pedal's buttons too"), and uses the footswitch/knob events for ◀ ▶ and the knob on its preset screen.
