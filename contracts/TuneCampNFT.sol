// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title TuneCampNFT
 * @notice ERC-1155 multi-role NFT for Tunecamp music tracks.
 * @dev Upgraded to support EIP-1167 Minimal Proxy via TuneCampFactory.
 */
contract TuneCampNFT is Initializable, ERC1155Upgradeable, AccessControlUpgradeable {
    using Strings for uint256;

    // ─── Roles ───────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE  = keccak256("MINTER_ROLE");
    bytes32 public constant ARTIST_ROLE  = keccak256("ARTIST_ROLE");

    // ─── Enums ───────────────────────────────────────────────────────────────
    enum TokenRole { LICENSE, OWNERSHIP, COLLECTIBLE }

    // ─── Storage ─────────────────────────────────────────────────────────────
    /// @dev trackId → artist address
    mapping(uint256 => address) public trackArtist;

    /// @dev trackId → role → max mintable supply (0 = unlimited)
    mapping(uint256 => mapping(TokenRole => uint256)) public maxSupply;

    /// @dev trackId → role → units minted so far
    mapping(uint256 => mapping(TokenRole => uint256)) public mintedSupply;

    /// @dev tokenId → custom URI (overrides base if set)
    mapping(uint256 => string) private _tokenURIs;

    string private _baseMetadataURI;

    // ─── Events ──────────────────────────────────────────────────────────────
    event TrackRegistered(uint256 indexed trackId, address indexed artist);
    event TrackMinted(
        address indexed to,
        uint256 indexed trackId,
        TokenRole role,
        uint256 tokenId,
        uint256 amount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initialization ──────────────────────────────────────────────────────
    function initialize(
        address admin,
        string memory baseMetadataURI_
    ) public initializer {
        __ERC1155_init(baseMetadataURI_);
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _baseMetadataURI = baseMetadataURI_;
    }

    // ─── Admin: register a track ─────────────────────────────────────────────
    function registerTrack(
        uint256 trackId,
        address artist,
        uint256 maxLicense,
        uint256 maxOwnership,
        uint256 maxCollectible
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(trackArtist[trackId] == address(0), "Track already registered");
        require(artist != address(0), "Invalid artist address");

        trackArtist[trackId] = artist;
        maxSupply[trackId][TokenRole.LICENSE]      = maxLicense;
        maxSupply[trackId][TokenRole.OWNERSHIP]    = maxOwnership;
        maxSupply[trackId][TokenRole.COLLECTIBLE]  = maxCollectible;

        emit TrackRegistered(trackId, artist);
    }

    // ─── Minting (called by TuneCampCheckout) ────────────────────────────────
    function mint(
        address to,
        uint256 trackId,
        TokenRole role,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) {
        require(trackArtist[trackId] != address(0), "Track not registered");

        uint256 max = maxSupply[trackId][role];
        if (max > 0) {
            require(
                mintedSupply[trackId][role] + amount <= max,
                "Exceeds max supply for this role"
            );
        }

        mintedSupply[trackId][role] += amount;
        uint256 tokenId = encodeTokenId(trackId, role);
        _mint(to, tokenId, amount, "");

        emit TrackMinted(to, trackId, role, tokenId, amount);
    }

    // ─── URI ─────────────────────────────────────────────────────────────────
    function uri(uint256 tokenId) public view override returns (string memory) {
        if (bytes(_tokenURIs[tokenId]).length > 0) {
            return _tokenURIs[tokenId];
        }
        return string(abi.encodePacked(_baseMetadataURI, tokenId.toString(), ".json"));
    }

    function setTokenURI(uint256 tokenId, string calldata newURI)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _tokenURIs[tokenId] = newURI;
    }

    function setBaseURI(string calldata newBaseURI)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _baseMetadataURI = newBaseURI;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    function encodeTokenId(uint256 trackId, TokenRole role)
        public pure returns (uint256)
    {
        return trackId * 10 + uint256(role);
    }

    function decodeTokenId(uint256 tokenId)
        public pure returns (uint256 trackId, TokenRole role)
    {
        trackId = tokenId / 10;
        role    = TokenRole(tokenId % 10);
    }

    // ─── Interface support ───────────────────────────────────────────────────
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
