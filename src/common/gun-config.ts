/**
 * Shared GunDB / ZEN configuration for Tunecamp
 * Used by server, webapp, and CLI tools
 */

export const DEFAULT_GUN_PEERS = [
    "https://shogun-relay.scobrudot.dev/gun",
];

export const GUN_NAMESPACE = "tunecamp";

export const GUN_CONFIG_DEFAULTS = {
    localStorage: false,
    radisk: true,
    axe: false,
    file: "./radata"
};
