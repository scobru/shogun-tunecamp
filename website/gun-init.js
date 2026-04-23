/**
 * Shared GunDB / ZEN initialization for Tunecamp Website
 */

// Default peers
const REGISTRY_PEERS = [
    "https://shogun-relay.scobrudot.dev/zen"
];

// Singleton instance
let gunInstance = null;

function getZen() {
    if (!gunInstance) {
        if (typeof Zen === 'undefined') {
            console.error("Zen library not loaded! Make sure zen.js is included before gun-init.js");
            return null;
        }

        console.log("📡 Initializing shared Zen instance...");
        gunInstance = new Zen({
            peers: REGISTRY_PEERS,
            localStorage: true
        });

        // Connection logging
        gunInstance.on('hi', (peer) => {
            console.log("✅ Zen connected to peer:", peer.url);
        });

        gunInstance.on('bye', (peer) => {
            console.warn("❌ Zen disconnected from peer:", peer.url);
        });
    }
    return gunInstance;
}

// Global export
window.getZen = getZen;
window.getGun = getZen; // fallback
