// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Standard EAS Attestation struct matching official Ethereum Attestation Service.
 */
struct Attestation {
    bytes32 uid; // Unique identifier of the attestation.
    bytes32 schema; // Unique identifier of the schema.
    uint64 time; // Timestamp when created.
    uint64 expirationTime; // Expiration timestamp (0 = never).
    uint64 revocationTime; // Revocation timestamp (0 = active).
    bytes32 refUID; // Linked attestation UID (e.g. for lifecycle chaining).
    address recipient; // Target recipient address.
    address attester; // Signer/Attester address.
    bool revocable; // Whether attestation can be revoked.
    bytes data; // ABI-encoded payload matching schema.
}

struct AttestationRequestData {
    address recipient;
    uint64 expirationTime;
    bool revocable;
    bytes32 refUID;
    bytes data;
    uint256 value;
}

struct AttestationRequest {
    bytes32 schema;
    AttestationRequestData data;
}

struct MultiAttestationRequest {
    bytes32 schema;
    AttestationRequestData[] data;
}

/**
 * @title IEAS
 * @notice Interface for the pre-deployed Ethereum Attestation Service on DOS Chain.
 */
interface IEAS {
    function attest(AttestationRequest calldata request) external payable returns (bytes32);
    function multiAttest(MultiAttestationRequest[] calldata multiRequests) external payable returns (bytes32[] memory);
    function getAttestation(bytes32 uid) external view returns (Attestation memory);
    function isAttestationValid(bytes32 uid) external view returns (bool);
    function revoke(bytes32 uid) external payable;
}
