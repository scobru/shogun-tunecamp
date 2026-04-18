// @ts-ignore
import ZEN from 'zen';
import { DEFAULT_GUN_PEERS, GUN_CONFIG_DEFAULTS } from '../common/gun-config.js';

let gunInstance: any = null;

interface GunOptions {
    peers?: string[];
    web?: any;
    radisk?: boolean;
    localStorage?: boolean;
    file?: string;
}

/**
 * ServerZenUser: A compatibility shim for the legacy Gun.user() API.
 * Uses ZEN's stateless External Authenticator pattern under the hood.
 */
class ServerZenUser {
    private _gun: any;
    private _pair: any = null;
    public is: { pub?: string; epub?: string } | null = null;
    public _: any = { sea: null }; // Legacy internal state accessor for compatibility

    constructor(gun: any) {
        this._gun = gun;
    }

    /**
     * Authenticate using a ZEN key pair.
     */
    auth(pair: any, cb?: (ack: any) => void) {
        if (!pair || !pair.pub || !pair.priv) {
            console.error("🚨 [ServerZenUser] Invalid pair provided to auth()");
            if (cb) cb({ err: 'Invalid pair' });
            return this;
        }

        this._pair = pair;
        this.is = {
            pub: pair.pub,
            epub: pair.epub
        };
        this._.sea = pair;

        if (cb) cb({ ok: 1 });
        return this;
    }

    /**
     * Clear the current session.
     */
    leave() {
        this._pair = null;
        this.is = null;
        this._.sea = null;
        return this;
    }

    /**
     * Get a chain starting from the user's namespace (~pub).
     * Automatically wraps the chain to inject the authenticator into .put() calls.
     */
    get(path: string) {
        if (!this.is || !this._pair) {
            // If not logged in, return a regular graph chain (read-only for user-space)
            return this._gun.get(path);
        }

        const userRoot = this._gun.get('~' + this.is.pub);
        const chain = userRoot.get(path);
        return this._wrapChain(chain);
    }

    /**
     * Overrides .put() on a chain to automatically include the authenticator.
     */
    private _wrapChain(chain: any) {
        if (!chain || chain._isZenWrapped) return chain;

        const originalPut = chain.put.bind(chain);
        const originalGet = chain.get.bind(chain);
        const self = this;

        chain._isZenWrapped = true;

        chain.put = (data: any, opt: any, cb: any) => {
            if (typeof opt === 'function') {
                cb = opt;
                opt = {};
            }
            opt = opt || {};
            // Inject authenticator for ZEN stateless signing
            opt.authenticator = self._pair;
            return originalPut(data, opt, cb);
        };

        // Recursively wrap children
        chain.get = (path: string) => {
            return self._wrapChain(originalGet(path));
        };

        return chain;
    }
}

/**
 * Shared Gun instance for the server
 */
export function getGun(options?: GunOptions): any {
    if (!gunInstance) {
        const initializationOptions = {
            peers: options?.peers || DEFAULT_GUN_PEERS,
            web: options?.web,
            radisk: options?.radisk !== undefined ? options.radisk : GUN_CONFIG_DEFAULTS.radisk,
            localStorage: options?.localStorage !== undefined ? options.localStorage : GUN_CONFIG_DEFAULTS.localStorage,
            file: options?.file || GUN_CONFIG_DEFAULTS.file
        };

        console.log(`📡 [ZEN] Initializing shared singleton with ${initializationOptions.peers.length} peers...`);
        gunInstance = new ZEN(initializationOptions);
        
        // Compatibility Layer: Add .user() method to the instance
        // We use a property definition to ensure it survives and is easily accessible
        const userShim = new ServerZenUser(gunInstance);
        Object.defineProperty(gunInstance, 'user', {
            value: function(pub?: string) {
                if (pub) return gunInstance.get('~' + pub);
                return userShim;
            },
            writable: true,
            configurable: true
        });

        console.log(`✅ [ZEN] Instance created and .user() shim attached.`);
        gunInstance._graph; // Force relay initialization as per examples
    } else if (options?.peers || options?.web) {
        // Update existing instance if new options provided (peers/server)
        if (options.peers) {
            console.log(`📡 [ZEN] Shared singleton adding ${options.peers.length} peers...`);
            gunInstance.opt({ peers: options.peers });
        }
        if (options.web) {
            gunInstance.opt({ web: options.web });
        }
    }

    // DIAGNOSTIC: Ensure .user is a function before returning
    if (typeof gunInstance.user !== 'function') {
        console.error("🚨 [ZEN] FATAL: gunInstance.user is STILL not a function after initialization!");
    } else {
        console.log("🔍 [ZEN] Diagnostic: gunInstance.user verified as function.");
    }
    
    return gunInstance;
}

/**
 * Re-exports from ZEN for convenience
 */
export const Gun = ZEN;
export default gunInstance;
