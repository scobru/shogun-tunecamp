/**
 * Shared GunDB / ZEN configuration for Tunecamp
 * Used by server, webapp, and CLI tools
 */

export const DEFAULT_GUN_PEERS = [
    "https://shogun-relay.scobrudot.dev/gun",
    "https://gun.defucc.me/gun",
    "https://a.talkflow.team/gun",
    "https://peer.wallie.io/gun",
];

export const GUN_NAMESPACE = "tunecamp";

export const GUN_CONFIG_DEFAULTS = {
    localStorage: false,
    radisk: true,
    axe: false,
    file: "./radata"
};
