// Play Acoustic link: Web MIDI + the firmware's built-in SysEx commands, with no UI.
// Shared by the touch views (tools/views). The protocol is the one pa-remote.html uses (see docs/SYSEX.md):
//   identity  F0 7E 7F 06 01 F7                      → reply names TC-Helicon 00 01 38, product 70/71
//   set       F0 00 01 38 <ch> <pid> 22 <id hi> <id lo> <28-bit value> F7
//   get       … 47 <id hi> <id lo> F7                  → reply … 22 <id> <value>
//   preset    … 45 00 00 F7                            → reply … 20 … with the current preset's 15-byte name
//   panel     … 55 01 01 00 00 00 = echo panel events; … 55 02 <e0 e1 e2> = inject one (press/hold/release)
(function () {
  const PA_PORT = /play\s*acoustic|play\s*electric|helicon/i, BLE_PORT = /widi|bluetooth|\bble\b/i;
  // Never written: refused by the firmware, or able to lock USB SysEx out until a factory reset (MIDI CTRL, FILTER).
  const BLOCKED = new Set([0x95, 0x96, 0x97, 0x98, 0x26D, 0x26E, 0x278, 0x27B]);
  const EVT = { next: 0x04, prev: 0x05, store: 0x03, back: 0x06, hit: 0x0B, fswUp: 0x0C, fswDown: 0x0D };
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const dec28 = (p, o) => { let v = (p[o] << 21) | (p[o + 1] << 14) | (p[o + 2] << 7) | p[o + 3]; if (v >= (1 << 27)) v -= (1 << 28); return v; };
  const enc28 = v => { if (v < 0) v += (1 << 28); return [(v >> 21) & 0x7f, (v >> 14) & 0x7f, (v >> 7) & 0x7f, v & 0x7f]; };
  // the simulated pedal (views/?sim) keeps its own saved data, so it never mixes with a real pedal's
  const pre = () => (window.simPedal ? "sim-" : "");
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(pre() + k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(pre() + k, JSON.stringify(v)); } catch {} } };

  const L = { status: "off", message: "Not connected", ble: false, out: null, inp: null, access: null, ch: 0, pid: 0x70, ready: false };
  const subs = {};
  L.on = (t, f) => { (subs[t] ||= new Set()).add(f); return () => subs[t].delete(f); };
  const emit = (t, d) => (subs[t] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });
  const say = (status, message) => { L.status = status; L.message = message; emit("status", { status, message }); };

  // ── incoming ────────────────────────────────────────────────────────────
  const waiters = new Set();
  function collect(ms, count, pred) {
    return new Promise(res => { const got = []; const h = m => { if (pred(m)) { got.push(m); if (got.length >= count) done(); } };
      const done = () => { clearTimeout(t); waiters.delete(h); res(got); }; const t = setTimeout(done, ms); waiters.add(h); });
  }
  const selfEchoes = [];
  function onMsg(e) {
    const d = e.data; if (!d || !d.length) return;
    if (d[0] === 0xF0) for (const h of [...waiters]) h(d);
    if (d[0] === 0xF0 && d[3] === 0x38 && d[6] === 0x55 && d.length >= 12) {
      const v = dec28(d, 7), t = performance.now(), i = selfEchoes.findIndex(s => s.k === v && t - s.t < 1000);
      if (i >= 0) selfEchoes.splice(i, 1);
      emit("panel", { e0: (v >> 16) & 0xFF, e1: (v >> 8) & 0xFF, e2: v & 0xFF, self: i >= 0 });
      return;
    }
    if ((d[0] & 0xF0) === 0xC0) { L.pcChannel = d[0] & 0x0F; emit("program", d[1]); }
  }

  // ── ports + identity ────────────────────────────────────────────────────
  function readIdentity(m) {
    for (let i = 0; i <= 2; i++) {
      if (m[i] === 0xF0 && m[i + 1] === 0x7E && m[i + 3] === 0x06 && m[i + 4] === 0x02 && m[i + 5] === 0x00 && m[i + 6] === 0x01 && m[i + 7] === 0x38 && (m[i + 8] === 0x70 || m[i + 8] === 0x71)) return { ch: m[i + 2], pid: m[i + 8] };
      if (m[i] === 0xF0 && m[i + 1] === 0x00 && m[i + 2] === 0x01 && m[i + 3] === 0x38 && (m[i + 5] === 0x70 || m[i + 5] === 0x71) && m[i + 6] === 0x7E && m[i + 7] === 0x7F) return { ch: m[i + 4], pid: m[i + 5] };
    }
    return null;
  }
  L.ports = () => L.access ? { outputs: [...L.access.outputs.values()].map(p => ({ id: p.id, name: p.name })), inputs: [...L.access.inputs.values()].map(p => ({ id: p.id, name: p.name })) } : { outputs: [], inputs: [] };
  L.choice = () => ({ out: L.out && L.out.id, inp: L.inp && L.inp.id, ble: L.ble });

  // Ask for MIDI. auto = on page load: stay quiet when the browser has no Web MIDI.
  L.start = async ({ auto } = {}) => {
    if (!navigator.requestMIDIAccess) { say("nomidi", "No Web MIDI in this browser (iPad: use a Web MIDI browser app)"); return false; }
    try { L.access = await navigator.requestMIDIAccess({ sysex: true }); }
    catch (e) { say("off", auto ? "Not connected" : "MIDI access refused: " + e.message); return false; }
    L.access.onstatechange = e => {
      emit("ports", L.ports());
      const p = e && e.port, ours = p && ((L.out && p.id === L.out.id) || (L.inp && p.id === L.inp.id));
      // The pedal was switched off or unplugged: show it, and pick it up again when it comes back.
      if (ours && p.state === "disconnected" && L.ready) { L.ready = false; say("connecting", "Pedal disconnected: waiting for it to come back…"); }
      // Ports come and go one at a time (input, then output): settle before picking.
      clearTimeout(repickT); repickT = setTimeout(() => { if (!L.ready || !connected(L.out) || !connected(L.inp)) autoPick(); }, 300);
    };
    autoPick(); return true;
  };
  let repickT = null;
  const connected = p => !!p && p.state !== "disconnected";
  function autoPick() {
    const saved = store.get("pa-ports") || {};
    const pick = (list, savedId) => list.find(p => p.id === savedId) || list.find(p => PA_PORT.test(p.name)) || list.find(p => BLE_PORT.test(p.name)) || null;
    // only ports that are there now (a switched-off pedal's ports stay listed as "disconnected")
    const live = m => [...m.values()].filter(connected).map(p => ({ id: p.id, name: p.name }));
    const outputs = live(L.access.outputs), inputs = live(L.access.inputs), o = pick(outputs, saved.out), i = pick(inputs, saved.inp);
    if (!o || !i) {
      if (L.status === "connecting" && L.out) return;   // our pedal went away: keep waiting for it
      say("off", outputs.length ? "Choose the Play Acoustic's MIDI ports" : "No MIDI ports: connect the pedal by USB"); emit("ports", L.ports()); return;
    }
    L.use(o.id, i.id, saved.ble ?? (BLE_PORT.test(o.name) || BLE_PORT.test(i.name)));
  }
  let bindGen = 0;
  L.use = async (outId, inId, ble) => {
    const gen = ++bindGen;
    if (L.inp) L.inp.onmidimessage = null;
    L.out = L.access.outputs.get(outId) || null; L.inp = L.access.inputs.get(inId) || null; L.ble = !!ble; L.ready = false;
    store.set("pa-ports", { out: outId, inp: inId, ble: L.ble }); emit("ports", L.ports());
    if (!L.out || !L.inp) { say("off", "Choose the Play Acoustic's MIDI ports"); return; }
    L.inp.onmidimessage = onMsg;
    say("connecting", `Checking ${L.out.name}…`);
    for (let a = 0; a < 3 && gen === bindGen; a++) {
      const r = collect(L.ble ? 2200 : 1200, 1, m => !!readIdentity(m));
      L.out.send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);
      const got = await r; if (gen !== bindGen) return;
      if (got.length) { const id = readIdentity(got[0]); L.ch = id.ch; L.pid = id.pid; return ready(`Play ${L.pid === 0x71 ? "Electric" : "Acoustic"}`); }
      if (L.ble) { L.ch = 0x7F; L.pid = 0x70; return ready("Play Acoustic (via Bluetooth, unconfirmed)"); }
    }
    if (gen === bindGen) say("bad", `No Play Acoustic answered on ${L.out.name}`);
  };
  // A pedal that stops answering while its port stays (power-cycled behind a Bluetooth adapter, or a USB hiccup):
  // after a few reads without a reply, check it again every few seconds; ready() switches the panel tunnel back on,
  // which the pedal forgets when it restarts.
  let misses = 0, recovering = false;
  function missed() {
    if (++misses < 3 || !L.ready) return;
    L.ready = false; say("connecting", "Pedal not answering: checking again…");
    recover();
  }
  async function recover() {
    if (recovering) return; recovering = true;
    const outId = L.out && L.out.id, inId = L.inp && L.inp.id;
    try {
      while (!L.ready && L.out && L.inp && L.out.id === outId && L.inp.id === inId) {
        await L.use(outId, inId, L.ble);
        if (!L.ready) await delay(4000);
      }
    } finally { recovering = false; }
  }
  function ready(name) {
    L.ready = true; L.name = name; misses = 0;
    L.out.send([...hdr(), 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0xF7]);   // echo the pedal's own panel events to us
    say("ready", name); emit("ready");
  }

  // ── commands ────────────────────────────────────────────────────────────
  const hdr = () => [0xF0, 0x00, 0x01, 0x38, L.ch, L.pid];
  L.isBlocked = id => BLOCKED.has(id);
  L.set = (id, v) => {
    if (!L.ready || BLOCKED.has(id)) return false;
    L.out.send([...hdr(), 0x22, (id >> 7) & 0x7F, id & 0x7F, ...enc28(Math.round(v)), 0xF7]); return true;
  };
  // Reads go one at a time: the pedal answers in order and a BLE link chokes on bursts.
  let chain = Promise.resolve();
  const queue = fn => (chain = chain.then(fn, fn));
  L.get = id => queue(async () => {
    if (!L.ready) return null;
    const p = collect(L.ble ? 1200 : 600, 1, m => m[0] === 0xF0 && m[3] === 0x38 && m[6] === 0x22 && ((m[7] << 7) | m[8]) === id);
    L.out.send([...hdr(), 0x47, (id >> 7) & 0x7F, id & 0x7F, 0xF7]);
    const t0 = performance.now(), r = await p;
    if (r.length) misses = 0; else missed();
    if (r.length) L.readMs = L.readMs == null ? performance.now() - t0 : L.readMs * .9 + (performance.now() - t0) * .1;   // average round trip
    return r.length ? dec28(r[0], 9) : null;
  });
  // Read many; `alive()` returning false abandons the rest (e.g. the preset changed meanwhile).
  L.getMany = async (ids, alive = () => true, each) => {
    const out = {};
    for (const id of ids) { if (!alive()) return null; const v = await L.get(id); if (v != null) { out[id] = v; each && each(id, v); } }
    return alive() ? out : null;
  };
  L.presetName = () => queue(async () => {
    if (!L.ready) return null;
    const p = collect(1000, 1, m => m[0] === 0xF0 && m[3] === 0x38 && m[6] === 0x20 && m.length >= 31);
    L.out.send([...hdr(), 0x45, 0x00, 0x00, 0xF7]);
    const r = await p; if (!r.length) return null;
    const raw = [...r[0].slice(11, 26)], end = raw.indexOf(0);
    return String.fromCharCode(...(end < 0 ? raw : raw.slice(0, end)).filter(c => c >= 0x20 && c < 0x7F)).trim();
  });
  // Panel events, as if a control on the unit was used. Our own echoes are flagged self:true on the "panel" event.
  L.inject = (e0, e1, e2) => {
    if (!L.ready) return false;
    const k = (e0 << 16) | (e1 << 8) | e2; selfEchoes.push({ k, t: performance.now() }); while (selfEchoes.length > 40) selfEchoes.shift();
    L.out.send([...hdr(), 0x55, 0x02, ...enc28(k), 0xF7]); return true;
  };
  // Program Change on the channel the pedal itself uses for them (learned from its own Program Change messages).
  L.programChange = prog => { if (!L.ready) return false; L.out.send([0xC0 | (L.pcChannel ?? 0), prog & 0x7F]); return true; };
  L.press = async code => { if (L.inject(0xDB, code, 0x00)) { await delay(60); L.inject(0xDB, code, 0x01); } };
  // Held button: the firmware recognises a hold from a stream of 02 events, like the hardware sends.
  L.hold = (code) => {
    if (!L.inject(0xDB, code, 0x00)) return () => {};
    let n = 0; const t = setInterval(() => { if (++n > 40) clearInterval(t); else L.inject(0xDB, code, 0x02); }, 200);
    return () => { clearInterval(t); L.inject(0xDB, code, 0x01); };
  };
  L.EVT = EVT; L.store = store; L.delay = delay;
  window.PALink = L;
})();
