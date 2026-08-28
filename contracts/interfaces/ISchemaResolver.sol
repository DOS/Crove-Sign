// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Attestation } from "./IEAS.sol";

/**
 * @title ISchemaResolver
 * @notice The interface for all EAS schema resolvers.
 */
interface ISchemaResolver {
    function isPayable() external pure returns (bool);
    function attest(Attestation calldata attestation) external payable returns (bool);
    function multiAttest(Attestation[] calldata attestations, uint256[] calldata values) external payable returns (bool);
    function revoke(Attestation calldata attestation) external payable returns (bool);
    function multiRevoke(Attestation[] calldata attestations, uint256[] calldata values) external payable returns (bool);
}
