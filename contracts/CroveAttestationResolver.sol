// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IEAS, Attestation } from "./interfaces/IEAS.sol";
import { SchemaResolver } from "./resolver/SchemaResolver.sol";

/**
 * @title CroveAttestationResolver
 * @notice Dedicated Schema Resolver for Crove Sign (Blockchain Integrity Receipts on DOS Chain & EVM networks).
 * @dev Provides:
 *   1. Access Control: Restricts attestations to authorized Crove Signer wallets.
 *   2. On-Chain Reverse Lookup: `documentHash (SHA-256) => attestation UID[]`.
 *   3. Multi-PDF Envelope Lookup: `anchorId => attestation UID[]`.
 *   4. Zero-login public verification functions for third-party clients and smart contracts.
 */
contract CroveAttestationResolver is SchemaResolver {
    // Structure matching Crove Sign Privacy-Preserving Attestation Schema v2
    struct CroveAttestationPayload {
        bytes32 anchorId;
        bytes32 documentHash;
        bytes32 auditRoot;
        uint16 itemIndex;
        uint16 itemCount;
        uint16 formatVersion;
    }

    // --- State Variables ---
    address public owner;
    bytes32 public schemaUID;

    // Reverse lookup mapping: documentHash (SHA-256) => array of attestation UIDs
    mapping(bytes32 => bytes32[]) private _documentHashToUIDs;

    // Lookup mapping: anchorId (Random UUID/bytes32) => array of attestation UIDs
    mapping(bytes32 => bytes32[]) private _anchorIdToUIDs;

    // Authorized attesters (Dedicated Crove Signer Wallets)
    mapping(address => bool) public authorizedAttesters;

    // --- Events ---
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AttesterAuthorized(address indexed attester, bool authorized);
    event SchemaUIDSet(bytes32 indexed schemaUID);
    event DocumentAttested(
        bytes32 indexed documentHash,
        bytes32 indexed anchorId,
        bytes32 indexed uid,
        address attester,
        uint16 itemIndex,
        uint16 itemCount,
        uint16 formatVersion
    );
    event DocumentRevoked(bytes32 indexed uid, address attester);

    // --- Errors ---
    error UnauthorizedCaller();
    error UnauthorizedAttester(address attester);
    error InvalidZeroAddress();
    error InvalidDocumentHash();
    error InvalidSchemaUID();

    // --- Modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert UnauthorizedCaller();
        }
        _;
    }

    constructor(
        IEAS eas,
        address initialOwner,
        address initialAttester
    ) SchemaResolver(eas) {
        if (initialOwner == address(0)) {
            revert InvalidZeroAddress();
        }
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);

        if (initialAttester != address(0)) {
            authorizedAttesters[initialAttester] = true;
            emit AttesterAuthorized(initialAttester, true);
        }
    }

    // --- EAS Resolver Callbacks ---

    /**
     * @notice Callback executed by EAS contract when an attestation is created.
     * @dev Validates attester authorization, decodes payload, and indexes reverse lookup.
     */
    function onAttest(Attestation calldata attestation, uint256 /*value*/) internal override returns (bool) {
        // Access Control: check if attester is authorized
        if (!authorizedAttesters[attestation.attester] && attestation.attester != owner) {
            revert UnauthorizedAttester(attestation.attester);
        }

        // Decode Crove Sign Attestation Payload v2
        (
            bytes32 anchorId,
            bytes32 documentHash,
            bytes32 auditRoot,
            uint16 itemIndex,
            uint16 itemCount,
            uint16 formatVersion
        ) = abi.decode(attestation.data, (bytes32, bytes32, bytes32, uint16, uint16, uint16));

        if (documentHash == bytes32(0)) {
            revert InvalidDocumentHash();
        }

        // Store reverse lookup indices on-chain
        _documentHashToUIDs[documentHash].push(attestation.uid);
        _anchorIdToUIDs[anchorId].push(attestation.uid);

        emit DocumentAttested(
            documentHash,
            anchorId,
            attestation.uid,
            attestation.attester,
            itemIndex,
            itemCount,
            formatVersion
        );

        return true;
    }

    /**
     * @notice Callback executed by EAS contract when an attestation is revoked.
     */
    function onRevoke(Attestation calldata attestation, uint256 /*value*/) internal override returns (bool) {
        if (!authorizedAttesters[attestation.attester] && attestation.attester != owner) {
            revert UnauthorizedAttester(attestation.attester);
        }

        emit DocumentRevoked(attestation.uid, attestation.attester);
        return true;
    }

    // --- Public Reverse Lookup & Verification View Functions ---

    /**
     * @notice Get all attestation UIDs associated with a given document hash (SHA-256).
     * @param documentHash The SHA-256 hash of the PDF file.
     */
    function getAttestationUIDsByDocumentHash(bytes32 documentHash) external view returns (bytes32[] memory) {
        return _documentHashToUIDs[documentHash];
    }

    /**
     * @notice Get all attestation UIDs associated with a multi-item envelope anchor ID.
     * @param anchorId The unique identifier of the envelope batch.
     */
    function getAttestationUIDsByAnchorId(bytes32 anchorId) external view returns (bytes32[] memory) {
        return _anchorIdToUIDs[anchorId];
    }

    /**
     * @notice Returns the latest attestation UID for a document hash.
     * @param documentHash The SHA-256 hash of the PDF file.
     */
    function getLatestAttestationUID(bytes32 documentHash) external view returns (bytes32) {
        bytes32[] storage uids = _documentHashToUIDs[documentHash];
        if (uids.length == 0) {
            return bytes32(0);
        }
        return uids[uids.length - 1];
    }

    /**
     * @notice Check if a document hash has at least one valid registered attestation.
     * @param documentHash The SHA-256 hash of the PDF file.
     */
    function isDocumentAttested(bytes32 documentHash) external view returns (bool) {
        return _documentHashToUIDs[documentHash].length > 0;
    }

    /**
     * @notice Comprehensive verification function returning attestation status, latest UID, and total count.
     * @param documentHash The SHA-256 hash of the PDF file.
     * @return isAttested True if the document has been attested on-chain.
     * @return latestUID The most recent EAS attestation UID.
     * @return count Total number of attestations recorded for this document.
     */
    function verifyDocument(
        bytes32 documentHash
    ) external view returns (bool isAttested, bytes32 latestUID, uint256 count) {
        bytes32[] storage uids = _documentHashToUIDs[documentHash];
        count = uids.length;
        isAttested = count > 0;
        latestUID = isAttested ? uids[count - 1] : bytes32(0);
    }

    // --- Admin Functions ---

    /**
     * @notice Authorize or revoke a Crove Signer wallet.
     */
    function setAuthorizedAttester(address attester, bool authorized) external onlyOwner {
        if (attester == address(0)) {
            revert InvalidZeroAddress();
        }
        authorizedAttesters[attester] = authorized;
        emit AttesterAuthorized(attester, authorized);
    }

    /**
     * @notice Set the official schema UID registered in EAS SchemaRegistry.
     */
    function setSchemaUID(bytes32 _schemaUID) external onlyOwner {
        if (_schemaUID == bytes32(0)) {
            revert InvalidSchemaUID();
        }
        schemaUID = _schemaUID;
        emit SchemaUIDSet(_schemaUID);
    }

    /**
     * @notice Transfer contract ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidZeroAddress();
        }
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
