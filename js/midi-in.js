// Web MIDI API Input Engine (USB MIDI Keyboards, MIDI Bass, Electronic Drum Pads)
// Zero dependencies, ~1ms hardware latency, automatic hot-plug support.

import { app } from "./state.js";

export const midiIn = {
  supported: typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function",
  active: false,
  access: null,
  devices: [],
  lastDeviceName: "",
};

const midiCbs = {
  onNoteOn: () => {},
  onStatusChange: () => {},
};

export function registerMidiCallbacks(cbs) {
  Object.assign(midiCbs, cbs);
}

function handleMidiMessage(ev) {
  if (!midiIn.active || !ev || !ev.data || ev.data.length < 2) return;
  const status = ev.data[0];
  const cmd = status & 0xF0;
  const note = ev.data[1];
  const vel = ev.data.length > 2 ? ev.data[2] : 0;
  // Standard Note On with velocity > 0 (Note On vel 0 is Note Off)
  if (cmd === 0x90 && vel > 0) {
    midiCbs.onNoteOn(note, vel, ev.timeStamp);
  }
}

function bindMidiInputs() {
  if (!midiIn.access) return;
  const names = [];
  for (const input of midiIn.access.inputs.values()) {
    input.onmidimessage = midiIn.active ? handleMidiMessage : null;
    if (input.state === "connected") {
      names.push(input.name || "MIDI Device");
    }
  }
  midiIn.devices = names;
  midiIn.lastDeviceName = names[0] || "";
  midiCbs.onStatusChange(names);
}

export async function startMidiInput() {
  if (!midiIn.supported) {
    return { ok: false, reason: "unsupported", devices: [] };
  }
  try {
    if (!midiIn.access) {
      midiIn.access = await navigator.requestMIDIAccess({ sysex: false });
      midiIn.access.onstatechange = () => {
        if (midiIn.active) bindMidiInputs();
      };
    }
    midiIn.active = true;
    app.midiOn = true;
    bindMidiInputs();
    return { ok: true, devices: midiIn.devices };
  } catch (err) {
    midiIn.active = false;
    app.midiOn = false;
    return { ok: false, reason: err && err.message ? err.message : "denied", devices: [] };
  }
}

export function stopMidiInput() {
  midiIn.active = false;
  app.midiOn = false;
  if (midiIn.access) {
    for (const input of midiIn.access.inputs.values()) {
      input.onmidimessage = null;
    }
  }
  midiCbs.onStatusChange([]);
}
