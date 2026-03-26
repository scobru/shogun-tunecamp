// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./TuneCampNFT.sol";

/**
 * @title TuneCampCheckout
 * @notice Handles purchases of TuneCamp NFTs with ETH or USDC.
 * @dev Upgraded to support EIP-1167 Minimal Proxy via TuneCampFactory.
 */
contract TuneCampCheckout is Initializable, OwnableUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant PLATFORM_FEE_BPS = 1500;   // 15.00%
    uint256 public constant BPS_DENOMINATOR  = 10_000;

    // ─── State ───────────────────────────────────────────────────────────────
    TuneCampNFT public nft;
    IERC20      public usdc;
    address public treasury;

    /// @dev Artists on the Pro plan bypass the 15% split
    mapping(address => bool) public isProArtist;

    /// @dev trackId → role → price in USDC (6 decimals)
    mapping(uint256 => mapping(TuneCampNFT.TokenRole => uint256)) public priceUSDC;

    /// @dev trackId → role → price in ETH (wei)
    mapping(uint256 => mapping(TuneCampNFT.TokenRole => uint256)) public priceETH;

    // ─── Events ──────────────────────────────────────────────────────────────
    event Purchase(
        address indexed buyer,
        uint256 indexed trackId,
        TuneCampNFT.TokenRole role,
        address indexed paymentToken,   // address(0) = ETH
        uint256 totalPaid,
        uint256 artistShare,
        uint256 platformShare,
        uint256 quantity
    );

    event ProStatusUpdated(address indexed artist, bool isPro);
    event PriceUpdated(
        uint256 indexed trackId,
        TuneCampNFT.TokenRole role,
        uint256 newPriceUSDC,
        uint256 newPriceETH
    );
    event TreasuryUpdated(address indexed newTreasury);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initialization ──────────────────────────────────────────────────────
    function initialize(
        address admin,
        address _nft,
        address _usdc,
        address _treasury
    ) public initializer {
        __Ownable_init(admin);

        require(_nft       != address(0), "Invalid NFT address");
        require(_usdc      != address(0), "Invalid USDC address");
        require(_treasury  != address(0), "Invalid treasury address");

        nft      = TuneCampNFT(_nft);
        usdc     = IERC20(_usdc);
        treasury = _treasury;
    }

    // ─── Purchase: USDC ──────────────────────────────────────────────────────
    function purchaseWithUSDC(
        uint256 trackId,
        TuneCampNFT.TokenRole role,
        uint256 quantity
    ) external nonReentrant {
        require(quantity > 0, "Quantity must be > 0");

        uint256 unitPrice = priceUSDC[trackId][role];
        require(unitPrice > 0, "USDC price not set");

        uint256 total = unitPrice * quantity;
        address artist = _getArtist(trackId);

        // Pull payment from buyer
        usdc.safeTransferFrom(msg.sender, address(this), total);

        // Split and distribute
        (uint256 artistShare, uint256 platformShare) = _computeSplit(total, artist);
        usdc.safeTransfer(artist, artistShare);
        if (platformShare > 0) {
            usdc.safeTransfer(treasury, platformShare);
        }

        // Mint NFT
        nft.mint(msg.sender, trackId, role, quantity);

        emit Purchase(
            msg.sender, trackId, role,
            address(usdc), total,
            artistShare, platformShare, quantity
        );
    }

    // ─── Purchase: ETH ───────────────────────────────────────────────────────
    function purchaseWithETH(
        uint256 trackId,
        TuneCampNFT.TokenRole role,
        uint256 quantity
    ) external payable nonReentrant {
        require(quantity > 0, "Quantity must be > 0");

        uint256 unitPrice = priceETH[trackId][role];
        require(unitPrice > 0, "ETH price not set");

        uint256 total = unitPrice * quantity;
        require(msg.value == total, "Incorrect ETH amount sent");

        address artist = _getArtist(trackId);

        // Split and distribute
        (uint256 artistShare, uint256 platformShare) = _computeSplit(total, artist);

        (bool sentArtist, ) = artist.call{value: artistShare}("");
        require(sentArtist, "ETH transfer to artist failed");

        if (platformShare > 0) {
            (bool sentTreasury, ) = treasury.call{value: platformShare}("");
            require(sentTreasury, "ETH transfer to treasury failed");
        }

        // Mint NFT
        nft.mint(msg.sender, trackId, role, quantity);

        emit Purchase(
            msg.sender, trackId, role,
            address(0), total,
            artistShare, platformShare, quantity
        );
    }

    // ─── Artist/Admin: prices ────────────────────────────────────────────────
    function setPrice(
        uint256 trackId,
        TuneCampNFT.TokenRole role,
        uint256 _priceUSDC,
        uint256 _priceETH
    ) external {
        address artist = _getArtist(trackId);
        require(msg.sender == owner() || msg.sender == artist, "Not authorized");

        priceUSDC[trackId][role] = _priceUSDC;
        priceETH[trackId][role]  = _priceETH;
        emit PriceUpdated(trackId, role, _priceUSDC, _priceETH);
    }

    function setPriceBatch(
        uint256[]                    calldata trackIds,
        TuneCampNFT.TokenRole[]      calldata roles,
        uint256[]                    calldata pricesUSDC,
        uint256[]                    calldata pricesETH
    ) external {
        uint256 len = trackIds.length;
        require(
            len == roles.length &&
            len == pricesUSDC.length &&
            len == pricesETH.length,
            "Array length mismatch"
        );
        for (uint256 i = 0; i < len; i++) {
            address artist = _getArtist(trackIds[i]);
            require(msg.sender == owner() || msg.sender == artist, "Not authorized");

            priceUSDC[trackIds[i]][roles[i]] = pricesUSDC[i];
            priceETH[trackIds[i]][roles[i]]  = pricesETH[i];
            emit PriceUpdated(trackIds[i], roles[i], pricesUSDC[i], pricesETH[i]);
        }
    }

    // ─── Admin: plan management ───────────────────────────────────────────────
    function setProArtist(address artist, bool status) external onlyOwner {
        isProArtist[artist] = status;
        emit ProStatusUpdated(artist, status);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────
    function previewSplit(uint256 total, address artist)
        external view
        returns (uint256 artistShare, uint256 platformShare)
    {
        return _computeSplit(total, artist);
    }

    // ─── Internal ────────────────────────────────────────────────────────────
    function _getArtist(uint256 trackId) internal view returns (address artist) {
        artist = nft.trackArtist(trackId);
        require(artist != address(0), "Track not registered");
    }

    function _computeSplit(uint256 total, address artist)
        internal view
        returns (uint256 artistShare, uint256 platformShare)
    {
        if (isProArtist[artist]) {
            // Pro plan: artist keeps 100%
            artistShare   = total;
            platformShare = 0;
        } else {
            // Free plan: 85% artist, 15% platform
            platformShare = (total * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            artistShare   = total - platformShare;
        }
    }

    // ─── Safety ──────────────────────────────────────────────────────────────
    function rescueERC20(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    receive() external payable {}
}
