// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─── Foundry deploy script ────────────────────────────────────────────────────
// Usage:
//   # Deploy factory only (Base mainnet)
//   forge script script/Deploy.s.sol:DeployFactory \
//     --rpc-url $BASE_RPC_URL \
//     --broadcast \
//     --verify \
//     --etherscan-api-key $BASESCAN_API_KEY
//
//   # Deploy factory + spin up one instance in the same tx batch
//   forge script script/Deploy.s.sol:DeployFactoryAndInstance \
//     --rpc-url $BASE_RPC_URL \
//     --broadcast \
//     --verify \
//     --etherscan-api-key $BASESCAN_API_KEY
//
// Required .env variables:
//   PRIVATE_KEY          – deployer / admin private key
//   BASE_RPC_URL         – e.g. https://mainnet.base.org
//   BASESCAN_API_KEY     – for contract verification
//   TREASURY_ADDRESS     – wallet that receives the 15% fee
//   INSTANCE_NAME        – e.g. "MyMusicNode"
//   BASE_METADATA_URI    – e.g. "https://mynode.xyz/meta/"

import "forge-std/Script.sol";
import "../src/TuneCampFactory.sol";

// ─── Base Network constants ───────────────────────────────────────────────────
address constant USDC_BASE_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

// ─────────────────────────────────────────────────────────────────────────────
// Script 1: Deploy the Factory only
// ─────────────────────────────────────────────────────────────────────────────
contract DeployFactory is Script {
    function run() external returns (TuneCampFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        bool isTestnet = vm.envOr("TESTNET", false);

        address usdc = isTestnet ? USDC_BASE_SEPOLIA : USDC_BASE_MAINNET;

        vm.startBroadcast(deployerKey);
        factory = new TuneCampFactory(usdc);
        vm.stopBroadcast();

        console.log("=== TuneCampFactory deployed ===");
        console.log("  Address  :", address(factory));
        console.log("  USDC     :", usdc);
        console.log("  Owner    :", factory.owner());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Script 2: Deploy Factory + spin up a first instance in the same run
// ─────────────────────────────────────────────────────────────────────────────
contract DeployFactoryAndInstance is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PRIVATE_KEY");
        bool    isTestnet    = vm.envOr("TESTNET", false);
        address treasury     = vm.envAddress("TREASURY_ADDRESS");
        string  memory name  = vm.envString("INSTANCE_NAME");
        string  memory uri   = vm.envString("BASE_METADATA_URI");

        address usdc = isTestnet ? USDC_BASE_SEPOLIA : USDC_BASE_MAINNET;

        vm.startBroadcast(deployerKey);

        // 1. Deploy factory
        TuneCampFactory factory = new TuneCampFactory(usdc);

        // 2. Deploy instance (NFT + Checkout) owned by msg.sender
        (address nft, address checkout) = factory.deployInstance(name, uri, treasury);

        vm.stopBroadcast();

        console.log("=== TuneCampFactory deployed ===");
        console.log("  Address  :", address(factory));

        console.log("=== Instance deployed ===");
        console.log("  Name     :", name);
        console.log("  NFT      :", nft);
        console.log("  Checkout :", checkout);
        console.log("  Treasury :", treasury);
        console.log("  Admin    :", vm.addr(deployerKey));
    }
}
