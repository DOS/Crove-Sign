// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Standard EAS Attestation struct matching official Ethereum Attestation Service.
 */
struct Attestation {
    bytes32 uid; // A unique identifier of the attestation.
    bytes32 schema; // The unique identifier of the schema.
    uint64 time; // The time when the attestation was created (Unix timestamp).
    uint64 expirationTime; // The time when the attestation expires (Unix timestamp).
    uint64 revocationTime; // The time when the attestation was revoked (Unix timestamp).
    bytes32 refUID; // The UID of the related attestation.
    address recipient; // The recipient of the attestation.
    address attester; // The attester/signer of the attestation.
    bool revocable; // Whether the attestation is revocable.
    bytes data; // Custom attestation data.
}

/**
 * @title IEAS
 * @notice Minimal interface for the Ethereum Attestation Service protocol.
 */
interface IEAS {
    function getAttestation(bytes32 uid) external view returns (Attestation memory);
    function isAttestationValid(bytes32 uid) external view returns (bool);
    function revoke(bytes32 uid) external payable;
}
