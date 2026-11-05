// Austauschbare Dienste. main.js steckt beim Start die Adapter ein (provide), alle anderen Module sprechen
// nur über diese Stellvertreter mit ihnen. So lässt sich z. B. PeerJS durch einen eigenen Server ersetzen,
// ohne dass Spielablauf oder Bildschirme sich ändern. Schnittstellen: siehe js/ports/.
const impl = {};
const port = name => new Proxy({}, {
  get(_, key) {
    const o = impl[name];
    if (!o) throw new Error(`Dienst "${name}" ist nicht eingesteckt`);
    const v = o[key];
    return typeof v === "function" ? v.bind(o) : v;
  },
});
/** @type {import("../ports/devices.js").AudioOut} */
export const audio = port("audio");
/** @type {import("../ports/devices.js").InputSource} */
export const input = port("input");
/** @type {import("../ports/transport.js").Transport} */
export const net = port("net");
/** @type {import("../ports/auth.js").AuthProvider} */
export const auth = port("auth");

/** @param {{ audio?: object, input?: object, net?: object, auth?: object }} services */
export function provide(services) { Object.assign(impl, services); }
