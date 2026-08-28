// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IEAS, Attestation } from "../interfaces/IEAS.sol";
import { SchemaResolver } from "./SchemaResolver.sol";

/**
 * @title CroveResolver
 * @notice Dedicated EAS Schema Resolver for Crove Sign.
 * @dev Enforces gateway trust boundary and indexes reverse lookups (artifactRoot -> UID, envelopeHash -> UID).
 */
contract CroveResolver is SchemaResolver {
    // --- State Variables ---
    address public owner;
    address public trustedGateway;
    bytes32 public schemaUID;

    // Reverse lookup indices
    mapping(bytes32 => bytes32[]) private _artifactRootToUIDs;
    mapping(bytes32 => bytes32[]) private _envelopeHashToUIDs;

    // --- Events ---
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TrustedGatewayUpdated(address indexed previousGateway, address indexed newGateway);
    event SchemaUIDConfigured(bytes32 indexed schemaUID);
    event DocumentIndexed(
        bytes32 indexed envelopeHash,
        bytes32 indexed artifactRoot,
        bytes32 indexed uid,
        bytes32 refUID,
        uint8 eventType
    );
    event AttestationRevoked(bytes32 indexed uid);

    // --- Errors ---
    error UnauthorizedCaller();
    error UnauthorizedAttester(address attester);
    error InvalidZeroAddress();
    error InvalidZeroHash();

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
        address initialGateway
    ) SchemaResolver(eas) {
        if (initialOwner == address(0)) {
            revert InvalidZeroAddress();
        }
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);

        if (initialGateway != address(0)) {
            trustedGateway = initialGateway;
            emit TrustedGatewayUpdated(address(0), initialGateway);
        }
    }

    // --- EAS Resolver Callbacks ---

    /**
     * @notice Callback invoked by EAS contract when an attestation is being registered.
     */
    function onAttest(Attestation calldata attestation, uint256 /*value*/) internal override returns (bool) {
        // Enforce Trust Boundary: only CroveAnchorGateway is allowed to attest this schema
        if (trustedGateway != address(0) && attestation.attester != trustedGateway) {
            revert UnauthorizedAttester(attestation.attester);
        }

        // Decode Crove Evidence Schema v2
        (
            bytes32 envelopeHash,
            bytes32 artifactRoot,
            /* bytes32 auditBundleRoot */,
            /* bytes32 identityEvidenceRoot */,
            /* bytes32 riskEvidenceRoot */,
            /* bytes32 policyHash */,
            /* uint16 evidenceVersion */,
            uint8 eventType
        ) = abi.decode(
            attestation.data,
            (bytes32, bytes32, bytes32, bytes32, bytes32, bytes32, uint16, uint8)
        );

        if (artifactRoot == bytes32(0)) {
            revert InvalidZeroHash();
        }

        // Index reverse lookup mappings on-chain
        _artifactRootToUIDs[artifactRoot].push(attestation.uid);
        if (envelopeHash != bytes32(0)) {
            _envelopeHashToUIDs[envelopeHash].push(attestation.uid);
        }

        emit DocumentIndexed(envelopeHash, artifactRoot, attestation.uid, attestation.refUID, eventType);

        return true;
    }

    /**
     * @notice Callback invoked by EAS contract when an attestation is revoked.
     */
    function onRevoke(Attestation calldata attestation, uint256 /*value*/) internal override returns (bool) {
        if (trustedGateway != address(0) && attestation.attester != trustedGateway && attestation.attester != owner) {
            revert UnauthorizedAttester(attestation.attester);
        }

        emit AttestationRevoked(attestation.uid);
        return true;
    }

    // --- Reverse Lookup & Public Verification View Methods ---

    /**
     * @notice Retrieve all attestation UIDs for a specific artifact/PDF root hash.
     */
    function getAttestationsByArtifactRoot(bytes32 artifactRoot) external view returns (bytes32[] memory) {
        return _artifactRootToUIDs[artifactRoot];
    }

    /**
     * @notice Retrieve all attestation UIDs for a specific envelope hash.
     */
    function getAttestationsByEnvelopeHash(bytes32 envelopeHash) external view returns (bytes32[] memory) {
        return _envelopeHashToUIDs[envelopeHash];
    }

    /**
     * @notice Return the most recent attestation UID for an artifact root hash.
     */
    function getLatestAttestationByArtifactRoot(bytes32 artifactRoot) external view returns (bytes32) {
        bytes32[] storage uids = _artifactRootToUIDs[artifactRoot];
        if (uids.length == 0) {
            return bytes32(0);
        }
        return uids[uids.length - 1];
    }

    /**
     * @notice Zero-login verification function returning attestation status, latest UID, and total count.
     */
    function verifyArtifact(
        bytes32 artifactRoot
    ) external view returns (bool isAttested, bytes32 latestUID, uint256 totalAttestations) {
        bytes32[] storage uids = _artifactRootToUIDs[artifactRoot];
        totalAttestations = uids.length;
        isAttested = totalAttestations > 0;
        latestUID = isAttested ? uids[totalAttestations - 1] : bytes32(0);
    }

    // --- Admin Configuration ---

    function setTrustedGateway(address newGateway) external onlyOwner {
        if (newGateway == address(0)) {
            revert InvalidZeroAddress();
        }
        emit TrustedGatewayUpdated(trustedGateway, newGateway);
        trustedGateway = newGateway;
    }

    function setSchemaUID(bytes32 _schemaUID) external onlyOwner {
        if (_schemaUID == bytes32(0)) {
            revert InvalidZeroHash();
        }
        schemaUID = _schemaUID;
        emit SchemaUIDConfigured(_schemaUID);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidZeroAddress();
        }
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
