// Play Acoustic tools: which parameters may be written (SysEx 22). Load after pa-menus.js.
//
// An allow-list: a parameter can be set if it is on one of the pedal's own menu pages (every "param" in
// pa-menus.js, the cells the panel and the views show) or in EXPERT below. Everything else is read-only in the
// tools, including the "Any parameter" list of the Remote. NEVER wins over both lists.
//
// Why: MIDI CTRL = MIDI or FILTER = SYSEX made a unit ignore USB SysEx after the next power cycle, and the Play
// Acoustic has no 5-pin MIDI input to undo it; only a factory initialisation (STORE + BACK at power-on, which also
// erases the user presets) recovered it. A block-list only stops the parameters we already know about.
(function () {
  const hex = id => "0x" + id.toString(16).toUpperCase().padStart(3, "0");

  // Never written, whatever the lists say (docs/SYSEX.md, "Dangerous parameters").
  const NEVER = new Map([
    [0x278, "MIDI CTRL: MIDI makes the pedal ignore USB SysEx after a power cycle"],
    [0x27B, "FILTER: SYSEX / PC+SYSEX makes the pedal ignore USB SysEx"],
    [0x27C, "SYSEXID: changes the SysEx channel byte"],
    [0x279, "MIDI CHAN: no use over USB (the AVR drops channel messages)"],
    [0x27A, "CC CHAN: no use over USB (the AVR drops channel messages)"],
  ]);

  // Settable parameters that aren't on a menu page. Add an ID here only once writing it is known to be harmless.
  const EXPERT = new Map([
    [0x2A8, "HIT (confirmed on the unit)"],
    [0x159, "DELAY TIME (vocal delay, SET TIME style)"],
    [0x15A, "DELAY TIME (guitar delay, SET TIME style)"],
    // effect sends, per preset; not shown on the pedal (views: Signal grid)
    ...[0xAB, 0xAC, 0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7].map(id => [id, "effect send level"]),
  ]);

  const MENU = new Set();
  (function walk(o) {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
      if (k === "param" && typeof v === "string") MENU.add(parseInt(v, 16)); else walk(v);
    }
  })(window.PA_MENUS || {});

  const allowed = id => Number.isInteger(id) && !NEVER.has(id) && (MENU.has(id) || EXPERT.has(id));
  window.PA_WRITES = {
    allowed,
    /** Why `id` can't be written, or "" if it can. */
    why: id => NEVER.has(id) ? `${hex(id)} ${NEVER.get(id)}`
      : allowed(id) ? ""
      : `${hex(id)} is not on a menu page and not in the expert list (tools/pa-writes.js)`,
    menu: MENU, expert: EXPERT, never: NEVER,
  };
})();
