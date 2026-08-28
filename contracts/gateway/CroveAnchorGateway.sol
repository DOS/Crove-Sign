// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IEAS, AttestationRequest, AttestationRequestData, MultiAttestationRequest } from "../interfaces/IEAS.sol";

/**
 * @title CroveAnchorGateway
 * @notice Dedicated Entry Gateway for anchoring Crove Sign document evidence bundles to EAS on DOS Chain.
 * @dev Enforces:
 *   1. Relayer Access Control: Only authorized Crove Relayer key can anchor.
 *   2. Anti-Replay Idempotency: `anchorKey => EAS UID` mapping.
 *   3. Multi-PDF batching support via EAS `multiAttest`.
 *   4. Emission of clean indexing events for DOScan.
 */
contract CroveAnchorGateway {
    // --- Data Structs ---
    struct EvidencePayload {
        bytes32 envelopeHash;
        bytes32 artifactRoot;
        bytes32 auditBundleRoot;
        bytes32 identityEvidenceRoot;
        bytes32 riskEvidenceRoot;
        bytes32 policyHash;
        uint16 evidenceVersion;
        uint8 eventType;
    }

    // --- State Variables ---
    IEAS public immutable eas;
    address public owner;
    bytes32 public schemaUID;

    // Authorized Relayers
    mapping(address => bool) public authorizedRelayers;

    // Anti-replay protection: anchorKey (bytes32) => EAS UID
    mapping(bytes32 => bytes32) public anchorKeyToUID;

    // --- Events ---
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RelayerAuthorized(address indexed relayer, bool status);
    event SchemaConfigured(bytes32 indexed schemaUID);
    event EnvelopeAnchored(
        bytes32 indexed anchorKey,
        bytes32 indexed envelopeHash,
        bytes32 indexed artifactRoot,
        bytes32 uid,
        bytes32 refUID,
        uint8 eventType,
        uint256 timestamp
    );

    // --- Errors ---
    error UnauthorizedCaller();
    error UnauthorizedRelayer(address caller);
    error InvalidZeroAddress();
    error InvalidZeroHash();
    error AnchorAlreadyProcessed(bytes32 anchorKey, bytes32 existingUID);

    // --- Modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert UnauthorizedCaller();
        }
        _;
    }

    modifier onlyRelayer() {
        if (!authorizedRelayers[msg.sender] && msg.sender != owner) {
            revert UnauthorizedRelayer(msg.sender);
        }
        _;
    }

    constructor(
        IEAS _eas,
        address initialOwner,
        address initialRelayer,
        bytes32 _schemaUID
    ) {
        if (address(_eas) == address(0) || initialOwner == address(0)) {
            revert InvalidZeroAddress();
        }

        eas = _eas;
        owner = initialOwner;
        schemaUID = _schemaUID;

        emit OwnershipTransferred(address(0), initialOwner);

        if (initialRelayer != address(0)) {
            authorizedRelayers[initialRelayer] = true;
            emit RelayerAuthorized(initialRelayer, true);
        }

        if (_schemaUID != bytes32(0)) {
            emit SchemaConfigured(_schemaUID);
        }
    }

    /**
     * @notice Anchor a single document evidence payload to EAS.
     * @param anchorKey Unique deterministic key (e.g. hash of envelopeId + eventType + attemptId).
     * @param refUID Optional reference to prior attestation UID (e.g. for lifecycle chaining).
     * @param payload Structured evidence roots.
     * @return uid The generated EAS attestation UID.
     */
    function anchorEnvelope(
        bytes32 anchorKey,
        bytes32 refUID,
        EvidencePayload calldata payload
    ) external onlyRelayer returns (bytes32 uid) {
        if (anchorKey == bytes32(0)) {
            revert InvalidZeroHash();
        }

        // Idempotency check: prevent duplicate attestation on retried outbox jobs
        bytes32 existingUID = anchorKeyToUID[anchorKey];
        if (existingUID != bytes32(0)) {
            return existingUID;
        }

        bytes memory encodedData = abi.encode(
            payload.envelopeHash,
            payload.artifactRoot,
            payload.auditBundleRoot,
            payload.identityEvidenceRoot,
            payload.riskEvidenceRoot,
            payload.policyHash,
            payload.evidenceVersion,
            payload.eventType
        );

        AttestationRequest memory request = AttestationRequest({
            schema: schemaUID,
            data: AttestationRequestData({
                recipient: address(0),
                expirationTime: 0,
                revocable: false,
                refUID: refUID,
                data: encodedData,
                value: 0
            })
        });

        uid = eas.attest(request);
        anchorKeyToUID[anchorKey] = uid;

        emit EnvelopeAnchored(
            anchorKey,
            payload.envelopeHash,
            payload.artifactRoot,
            uid,
            refUID,
            payload.eventType,
            block.timestamp
        );
    }

    /**
     * @notice Batch anchor multiple envelope artifacts in a single multiAttest transaction.
     */
    function batchAnchorEnvelopes(
        bytes32[] calldata anchorKeys,
        bytes32[] calldata refUIDs,
        EvidencePayload[] calldata payloads
    ) external onlyRelayer returns (bytes32[] memory uids) {
        uint256 count = payloads.length;
        if (anchorKeys.length != count || refUIDs.length != count) {
            revert InvalidZeroHash();
        }

        uids = new bytes32[](count);
        AttestationRequestData[] memory requestData = new AttestationRequestData[](count);

        for (uint256 i = 0; i < count; ++i) {
            bytes32 anchorKey = anchorKeys[i];

            // If already processed, reuse existing UID
            if (anchorKeyToUID[anchorKey] != bytes32(0)) {
                uids[i] = anchorKeyToUID[anchorKey];
                continue;
            }

            bytes memory encodedData = abi.encode(
                payloads[i].envelopeHash,
                payloads[i].artifactRoot,
                payloads[i].auditBundleRoot,
                payloads[i].identityEvidenceRoot,
                payloads[i].riskEvidenceRoot,
                payloads[i].policyHash,
                payloads[i].evidenceVersion,
                payloads[i].eventType
            );

            requestData[i] = AttestationRequestData({
                recipient: address(0),
                expirationTime: 0,
                revocable: false,
                refUID: refUIDs[i],
                data: encodedData,
                value: 0
            });
        }

        MultiAttestationRequest[] memory multiRequests = new MultiAttestationRequest[](1);
        multiRequests[0] = MultiAttestationRequest({
            schema: schemaUID,
            data: requestData
        });

        bytes32[] memory createdUIDs = eas.multiAttest(multiRequests);

        for (uint256 i = 0; i < count; ++i) {
            if (uids[i] == bytes32(0) && i < createdUIDs.length) {
                uids[i] = createdUIDs[i];
                anchorKeyToUID[anchorKeys[i]] = createdUIDs[i];

                emit EnvelopeAnchored(
                    anchorKeys[i],
                    payloads[i].envelopeHash,
                    payloads[i].artifactRoot,
                    createdUIDs[i],
                    refUIDs[i],
                    payloads[i].eventType,
                    block.timestamp
                );
            }
        }
    }

    // --- Admin Functions ---

    function setAuthorizedRelayer(address relayer, bool status) external onlyOwner {
        if (relayer == address(0)) {
            revert InvalidZeroAddress();
        }
        authorizedRelayers[relayer] = status;
        emit RelayerAuthorized(relayer, status);
    }

    function setSchemaUID(bytes32 _schemaUID) external onlyOwner {
        if (_schemaUID == bytes32(0)) {
            revert InvalidZeroHash();
        }
        schemaUID = _schemaUID;
        emit SchemaConfigured(_schemaUID);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidZeroAddress();
        }
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
