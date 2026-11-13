// Schnittstellen: Ton und Eingabegeräte. Umgesetzt von adapters/audio/webaudio.js und adapters/input/dom-input.js.

/**
 * @typedef {Object} AudioOut
 * @property {() => void} unlock
 * @property {(name: string, v?: number) => void} sfx
 * @property {(on: boolean, kind?: string) => void} music
 * @property {(level: number) => void} crowd
 * @property {() => void} crowdOff
 * @property {() => void} prepareMatch   seltene Dateien (Musik zur Wiederholung) vor dem ersten Spiel nachladen
 * @property {(key: object|null) => void} replayMusic   jedes Bild: laufende Wiederholung oder null
 * @property {(on: boolean) => void} setSfx
 * @property {(on: boolean) => void} setMusic
 */
/**
 * @typedef {{ l?: boolean, r?: boolean, j?: boolean, d?: boolean, k?: boolean, s?: boolean }} Controls
 * @typedef {Object} InputSource
 * @property {(hooks: object) => void} initInput
 * @property {(player: number, mode: "single"|"local") => Controls} getInput
 * @property {() => void} pollPads
 * @property {(kind: "none"|"single"|"split") => void} setLayout
 * @property {(st: object) => void} touchHud
 * @property {(ms: number|number[]) => void} vibrate
 * @property {(on: boolean) => void} setVibration
 * @property {boolean} isTouch
 * @property {boolean} usedPad
 */
export {};
