const loggers = {
  server: {
    info: (...args: any[]) => console.log('📡 [ZEN]', ...args),
    debug: (...args: any[]) => console.log('🔍 [ZEN]', ...args),
    warn: (...args: any[]) => console.warn('⚠️ [ZEN]', ...args),
    error: (...args: any[]) => console.error('🚨 [ZEN]', ...args)
  }
};

// @ts-ignore
import { disc, hwid } from "zen/lib/discover.js";
// @ts-ignore
import { scanbg, mkpat } from "zen/lib/scan.js";

export const kprs = new Set<string>(); // Known peers
export const spat = new Set<string>(); // Scanned patterns

let stmr: NodeJS.Timeout | null = null;
let pmsh: any = null;
let fic = false;
const SIV = 10 * 60 * 1000; // 10 min base interval
const MSIV = 2 * 60 * 60 * 1000; // 2 hr cap
const MUPS = 10; // max outbound peer connections from scan
let siv = SIV;
let activeDomain: string | null = null;
let activePort: number = 8420;

export async function discoverNetworkIdentity(configuredPort: number) {
  // disc() returns { domain, ip, port, source }
  const network = await disc({ port: configuredPort, noSave: true });
  activeDomain = network.domain || network.ip;
  activePort = network.port;
  return network;
}

export function getHardwarePeerId() {
  return hwid();
}

function pkey(host: string) {
  const p = mkpat((host || "").split(":")[0]);
  return p ? p.prefix + "*" + p.tail + p.suffix : host;
}

function scnd(host: string, zenInstance: any) {
  if (!host) return;
  const key = pkey(host);
  if (spat.has(key)) return;
  spat.add(key);
  loggers.server.info(`🔍 Scanning ZEN pattern: ${key}`);
  scanbg(host, {
    port: activePort,
    onFound: (url: string) => addPeer(url, zenInstance),
  });
}

export function scanNetwork(zenInstance: any) {
  if (activeDomain) scnd(activeDomain, zenInstance);
}

export function scheduleNetworkScan(zenInstance: any) {
  if (stmr) clearTimeout(stmr);
  stmr = setTimeout(() => {
    fic = false;
    spat.clear();
    scanNetwork(zenInstance);
    const check = setTimeout(() => {
      if (!fic) {
        siv = Math.min(siv * 2, MSIV);
        loggers.server.debug(
          `Scan: no new peers - next scan in ${Math.round(siv / 60000)}m`,
        );
      } else {
        siv = SIV;
      }
      scheduleNetworkScan(zenInstance);
    }, 2 * 60 * 1000);
    if (check.unref) check.unref();
  }, siv);
  if (stmr.unref) stmr.unref();
}

export function addPeer(url: string, zenInstance: any) {
  if (kprs.has(url)) return;
  kprs.add(url);
  fic = true;
  loggers.server.info(`🤝 Discovered new ZEN peer: ${url}`);

  const r = zenInstance && zenInstance._graph && zenInstance._graph._;
  const ups = r && r.axe ? Object.keys(r.axe.up || {}).length : 0;

  if (pmsh && ups < MUPS) {
    try {
      pmsh.hi({ id: url, url, retry: 9 });
    } catch {}
  } else if (!pmsh && r && r.opt) {
    if (!Array.isArray(r.opt.peers)) r.opt.peers = [];
    if (!r.opt.peers.includes(url)) r.opt.peers.push(url);
  }

  if (pmsh) {
    try {
      pmsh.say({ dam: "pex", peers: [url] }, r && r.opt && r.opt.peers);
    } catch {}
  }

  try {
    scnd(new URL(url).hostname, zenInstance);
  } catch {}
}

export function setupPeerExchange(zenInstance: any, serverUrl: string | null) {
  if (serverUrl) kprs.add(serverUrl);

  const root = zenInstance._graph._;

  setImmediate(() => {
    const mesh = root.opt && root.opt.mesh;
    if (!mesh) return;
    pmsh = mesh;

    mesh.hear["pex"] = function (msg: any, _peer: any) {
      if (!Array.isArray(msg.peers)) return;
      msg.peers.forEach((url: string) => {
        if (
          typeof url === "string" &&
          /^(wss?|https?):\/\//.test(url) &&
          url !== serverUrl
        ) {
          addPeer(url, zenInstance);
        }
      });
    };

    root.on("hi", function (this: any, peer: any) {
      this.to.next(peer);
      const list = Array.from(kprs).filter((u) => u !== serverUrl);
      setTimeout(() => {
        try {
          const bpids = Object.values(root.opt.peers || {})
            .filter((p: any) => p && p.pid && !p.url && p.pid !== peer.pid)
            .map((p: any) => p.pid);

          const pexMsg: any = { dam: "pex", peers: list };
          if (bpids.length) pexMsg.bpids = bpids;

          mesh.say(pexMsg, peer);

          if (peer.pid && !peer.url) {
            Object.values(root.opt.peers || {}).forEach((p: any) => {
              if (p && p.wire && p !== peer) {
                try {
                  mesh.say({ dam: "pex", peers: [], bpids: [peer.pid] }, p);
                } catch {}
              }
            });
          }
        } catch {}
      }, 600);

      if (serverUrl) {
        setTimeout(() => {
          try {
            mesh.say({ dam: "pex", peers: [serverUrl] }, peer);
          } catch {}
        }, 700);
      }
    });
  });

  if (activeDomain) {
    scanNetwork(zenInstance);
    scheduleNetworkScan(zenInstance);
  }

  let btmr: NodeJS.Timeout | null = null;
  root.on("bye", function (this: any, ...args: any[]) {
    this.to.next.apply(this.to, args);
    if (btmr) clearTimeout(btmr);
    btmr = setTimeout(() => {
      siv = SIV;
      spat.clear();
      scanNetwork(zenInstance);
      scheduleNetworkScan(zenInstance);
    }, 30000);
    if (btmr.unref) btmr.unref();
  });
}

export function latchDomain(req: any, zenInstance: any) {
  if (activeDomain) return activeDomain;
  const host = (req.headers.host || "").split(":")[0];
  if (host && host !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    activeDomain = host;
    loggers.server.info(`🌐 Domain latched from request: ${activeDomain}`);
    if (zenInstance) {
      scanNetwork(zenInstance);
      scheduleNetworkScan(zenInstance);
    }
  }
  return activeDomain;
}
