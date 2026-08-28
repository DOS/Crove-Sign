// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IEAS, Attestation } from "../interfaces/IEAS.sol";
import { ISchemaResolver } from "../interfaces/ISchemaResolver.sol";

/**
 * @title SchemaResolver
 * @notice The standard base schema resolver contract for EAS.
 */
abstract contract SchemaResolver is ISchemaResolver {
    error AccessDenied();
    error InsufficientValue();
    error NotPayable();
    error InvalidLength();

    // The global EAS contract instance
    IEAS internal immutable _eas;

    modifier onlyEAS() {
        if (msg.sender != address(_eas)) {
            revert AccessDenied();
        }
        _;
    }

    constructor(IEAS eas) {
        if (address(eas) == address(0)) {
            revert AccessDenied();
        }
        _eas = eas;
    }

    function getEAS() external view returns (IEAS) {
        return _eas;
    }

    function isPayable() public pure virtual override returns (bool) {
        return false;
    }

    function attest(Attestation calldata attestation) external payable onlyEAS returns (bool) {
        return onAttest(attestation, msg.value);
    }

    function multiAttest(
        Attestation[] calldata attestations,
        uint256[] calldata values
    ) external payable onlyEAS returns (bool) {
        uint256 length = attestations.length;
        if (length != values.length) {
            revert InvalidLength();
        }

        for (uint256 i = 0; i < length; ++i) {
            if (!onAttest(attestations[i], values[i])) {
                return false;
            }
        }

        return true;
    }

    function revoke(Attestation calldata attestation) external payable onlyEAS returns (bool) {
        return onRevoke(attestation, msg.value);
    }

    function multiRevoke(
        Attestation[] calldata attestations,
        uint256[] calldata values
    ) external payable onlyEAS returns (bool) {
        uint256 length = attestations.length;
        if (length != values.length) {
            revert InvalidLength();
        }

        for (uint256 i = 0; i < length; ++i) {
            if (!onRevoke(attestations[i], values[i])) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Callback invoked by EAS contract when an attestation is being registered.
     */
    function onAttest(Attestation calldata attestation, uint256 value) internal virtual returns (bool);

    /**
     * @notice Callback invoked by EAS contract when an attestation is being revoked.
     */
    function onRevoke(Attestation calldata attestation, uint256 value) internal virtual returns (bool);
}
