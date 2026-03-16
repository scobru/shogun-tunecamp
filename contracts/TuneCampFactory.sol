// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─── Deployed on Base Network (chainId: 8453) ────────────────────────────────
// USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
//
// Usage flow for a self-hosters:
//   1. Call deployInstance(instanceName, baseMetadataURI, treasury)
//   2. Factory creates Minimal Proxies (Clones) for NFT + Checkout
//   3. Factory initializes both proxies
//   4. Grants MINTER_ROLE on NFT to Checkout proxy
//   5. Emits InstanceDeployed with all addresses → frontend reads this

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./TuneCampNFT.sol";
import "./TuneCampCheckout.sol";

contract TuneCampFactory is Ownable {

    // ─── Constants & Immutables ──────────────────────────────────────────────
    address public usdcAddress;
    
    /// @dev The master logic contracts (implementation)
    address public immutable nftImplementation;
    address public immutable checkoutImplementation;

    // ─── Registry ────────────────────────────────────────────────────────────
    struct Instance {
        address admin;
        address nft;
        address checkout;
        string  name;
        uint256 deployedAt;
    }

    /// @dev All deployed instances, in order.
    Instance[] public instances;

    /// @dev admin wallet → list of instance indexes they own.
    mapping(address => uint256[]) private _instancesByAdmin;

    /// @dev NFT address → instance index (for reverse lookup).
    mapping(address => uint256) public instanceIndexByNFT;

    // ─── Events ──────────────────────────────────────────────────────────────
    event InstanceDeployed(
        uint256 indexed instanceId,
        address indexed admin,
        address nft,
        address checkout,
        string  name
    );

    // ─── Constructor ─────────────────────────────────────────────────────────
    /**
     * @param _usdc           USDC Token address on the target network.
     * @param _nftLogic       Address of the pre-deployed TuneCampNFT master logic.
     * @param _checkoutLogic  Address of the pre-deployed TuneCampCheckout master logic.
     */
    constructor(
        address _usdc,
        address _nftLogic,
        address _checkoutLogic
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_nftLogic != address(0), "Invalid NFT logic address");
        require(_checkoutLogic != address(0), "Invalid Checkout logic address");
        
        usdcAddress = _usdc;
        nftImplementation = _nftLogic;
        checkoutImplementation = _checkoutLogic;
    }

    // ─── Core: deploy an instance ─────────────────────────────────────────────
    /**
     * @notice Deploy a fresh TuneCampNFT + TuneCampCheckout for a self-hosted instance using Minimal Proxies.
     *
     * @param instanceName    Human-readable label (e.g. "MyMusicNode").
     * @param baseMetadataURI Base URI for NFT metadata (e.g. "https://mynode.xyz/meta/").
     * @param treasury        Address that collects the 15% platform fee.
     *
     * @return nftAddress      Deployed TuneCampNFT proxy address.
     * @return checkoutAddress Deployed TuneCampCheckout proxy address.
     */
    function deployInstance(
        string  calldata instanceName,
        string  calldata baseMetadataURI,
        address          treasury
    )
        external
        returns (address nftAddress, address checkoutAddress)
    {
        require(bytes(instanceName).length    > 0, "Name required");
        require(bytes(baseMetadataURI).length > 0, "Base URI required");
        require(treasury != address(0),            "Invalid treasury");

        // ── 1. Clone & Initialize NFT ─────────────────────────────────────────
        nftAddress = Clones.clone(nftImplementation);
        TuneCampNFT nftContract = TuneCampNFT(nftAddress);
        
        // Factory acts as temporary admin during initialization
        nftContract.initialize(address(this), baseMetadataURI);

        // ── 2. Clone & Initialize Checkout ────────────────────────────────────
        checkoutAddress = Clones.clone(checkoutImplementation);
        TuneCampCheckout checkoutContract = TuneCampCheckout(payable(checkoutAddress));
        
        // Pass the new NFT proxy and treasury to the checkout proxy
        checkoutContract.initialize(msg.sender, nftAddress, usdcAddress, treasury);

        // ── 3. Grant MINTER_ROLE on NFT to Checkout ──────────────────────────
        nftContract.grantRole(nftContract.MINTER_ROLE(), checkoutAddress);

        // ── 4. Transfer full NFT control to the calling admin ────────────────
        nftContract.grantRole(nftContract.DEFAULT_ADMIN_ROLE(), msg.sender);
        nftContract.revokeRole(nftContract.DEFAULT_ADMIN_ROLE(), address(this));

        // Note: Checkout ownership is already set to msg.sender during initialize

        // ── 5. Register in the on-chain registry ─────────────────────────────
        uint256 instanceId = instances.length;

        instances.push(Instance({
            admin:      msg.sender,
            nft:        nftAddress,
            checkout:   checkoutAddress,
            name:       instanceName,
            deployedAt: block.timestamp
        }));

        _instancesByAdmin[msg.sender].push(instanceId);
        instanceIndexByNFT[nftAddress] = instanceId;

        emit InstanceDeployed(instanceId, msg.sender, nftAddress, checkoutAddress, instanceName);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function instanceCount() external view returns (uint256) {
        return instances.length;
    }

    function instancesOf(address admin) external view returns (uint256[] memory) {
        return _instancesByAdmin[admin];
    }

    function getInstance(uint256 instanceId)
        external view
        returns (Instance memory)
    {
        require(instanceId < instances.length, "Instance does not exist");
        return instances[instanceId];
    }

    function getInstanceByNFT(address nft)
        external view
        returns (Instance memory)
    {
        uint256 idx = instanceIndexByNFT[nft];
        require(instances[idx].nft == nft, "NFT not registered");
        return instances[idx];
    }

    // ─── Admin: update USDC address (e.g. for testnets) ──────────────────────
    function setUSDC(address _usdc) external onlyOwner {
        require(_usdc != address(0), "Invalid USDC");
        usdcAddress = _usdc;
    }
}
