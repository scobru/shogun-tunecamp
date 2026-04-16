/**
 * Shared GunDB / ZEN initialization for Tunecamp Website
 */

// Default peers
const REGISTRY_PEERS = [
    "https://shogun-relay.scobrudot.dev/gun",
    "https://gun.defucc.me/gun",
    "https://a.talkflow.team/gun",
    "https://peer.wallie.io/gun",
];

// Singleton instance
let gunInstance = null;

function getGun() {
    if (!gunInstance) {
        if (typeof Gun === 'undefined') {
            console.error("Gun library not loaded! Make sure zen.js is included before gun-init.js");
            return null;
        }
        
        console.log("📡 Initializing shared Gun instance...");
        gunInstance = Gun({
            peers: REGISTRY_PEERS,
            localStorage: true
        });
    }
    return gunInstance;
}

// Global export
window.getGun = getGun;
