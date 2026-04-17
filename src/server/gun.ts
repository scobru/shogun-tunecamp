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
 * Shared Gun instance for the server
 */
export function getGun(options?: GunOptions): any {
    if (!gunInstance) {
        const initializationOptions = {
            peers: options?.peers || DEFAULT_GUN_PEERS,
            web: options?.web,
            path: "/zen",
            radisk: options?.radisk !== undefined ? options.radisk : GUN_CONFIG_DEFAULTS.radisk,
            localStorage: options?.localStorage !== undefined ? options.localStorage : GUN_CONFIG_DEFAULTS.localStorage,
            file: options?.file || GUN_CONFIG_DEFAULTS.file,
            axe: false
        };

        console.log(`📡 [GunDB] Initializing shared singleton with ${initializationOptions.peers.length} peers...`);
        gunInstance = new ZEN(initializationOptions);
    } else if (options?.peers || options?.web) {
        // Update existing instance if new options provided (peers/server)
        if (options.peers) {
            console.log(`📡 [GunDB] Shared singleton adding ${options.peers.length} peers...`);
            gunInstance.opt({ peers: options.peers });
        }
        if (options.web) {
            gunInstance.opt({ web: options.web });
        }
    }
    
    return gunInstance;
}

/**
 * Re-exports from ZEN for convenience
 */
export const Gun = ZEN;
export default gunInstance;
