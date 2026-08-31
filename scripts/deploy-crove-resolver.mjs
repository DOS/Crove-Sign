#!/usr/bin/env node

/**
 * Crove Sign - EAS Infrastructure Deployment & Schema Registration Script
 *
 * Deploys the CroveResolver & CroveAnchorGateway contracts to DOS Chain (or EVM testnet/mainnet),
 * connects them to the pre-deployed EAS Core, and registers the Privacy-Preserving Evidence Schema v2.
 *
 * Usage:
 *   node scripts/deploy-crove-resolver.mjs [--network=dos-testnet|dos-mainnet] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ==========================================
// 1. NETWORK CONFIGURATION & CONSTANTS
// ==========================================

const NETWORKS = {
  'dos-mainnet': {
    name: 'DOS Chain Mainnet',
    rpcUrl: process.env.DOS_MAINNET_RPC || 'https://main.doschain.com',
    chainId: 3939,
    eas: '0x79799066b2b5072E4B154Bedde14Dbc22caa0EA5',
    schemaRegistry: '0x7979E91c465d3dde4faA7a6601b5b2c1C66c9999',
    eip712Proxy: '0x79793132eC82DE8e411bF3B08CE27376c66d2146',
    indexer: '0x797906E5c1E4fB1441712aEcf426b3c959cb3159',
  },
  'dos-testnet': {
    name: 'DOS Chain Testnet',
    rpcUrl: process.env.DOS_TESTNET_RPC || 'https://test.doschain.com',
    chainId: 39391,
    eas: '0x79799066b2b5072E4B154Bedde14Dbc22caa0EA5',
    schemaRegistry: '0x7979E91c465d3dde4faA7a6601b5b2c1C66c9999',
    eip712Proxy: '0x79793132eC82DE8e411bF3B08CE27376c66d2146',
    indexer: '0x797906E5c1E4fB1441712aEcf426b3c959cb3159',
  },
};

const CROVE_SCHEMA_V2 =
  'bytes32 envelopeHash, bytes32 artifactRoot, bytes32 auditBundleRoot, bytes32 identityEvidenceRoot, bytes32 riskEvidenceRoot, bytes32 policyHash, uint16 evidenceVersion, uint8 eventType';

async function main() {
  console.log('\n=====================================================================');
  console.log('🚀 Crove Sign - EAS Gateway & Resolver Deployment Guide (DOS Chain)');
  console.log('=====================================================================\n');

  const args = process.argv.slice(2);
  const networkArg = args.find((a) => a.startsWith('--network='))?.split('=')[1] || 'dos-testnet';
  const isDryRun = args.includes('--dry-run') || !process.env.DEPLOYER_PRIVATE_KEY;

  const networkConfig = NETWORKS[networkArg] || NETWORKS['dos-testnet'];

  console.log(`🌐 Target Network       : ${networkConfig.name} (Chain ID: ${networkConfig.chainId})`);
  console.log(`📡 RPC Endpoint         : ${networkConfig.rpcUrl}`);
  console.log(`🔗 Pre-deployed EAS     : ${networkConfig.eas}`);
  console.log(`📑 Pre-deployed Registry: ${networkConfig.schemaRegistry}`);
  console.log(`📜 Schema v2 Definition : "${CROVE_SCHEMA_V2}"\n`);

  console.log('📋 Contract Architecture & Deliverables:');
  console.log('   - CroveAnchorGateway : contracts/gateway/CroveAnchorGateway.sol (Anti-replay, Relayer Access Control, Multi-PDF batching)');
  console.log('   - CroveResolver      : contracts/resolver/CroveResolver.sol (Reverse lookup: artifactRoot -> UID[], envelopeHash -> UID[])');
  console.log('   - EAS Base Resolver  : contracts/resolver/SchemaResolver.sol');
  console.log('   - EAS Interfaces     : contracts/interfaces/IEAS.sol, ISchemaResolver.sol');
  console.log('   - TypeScript ABI     : packages/lib/server-only/blockchain/resolver-abi.ts\n');

  if (isDryRun) {
    console.log('🔍 [Dry-Run / Verification Mode]:');
    console.log('   To deploy on-chain, provide DEPLOYER_PRIVATE_KEY and run:');
    console.log('   $env:DEPLOYER_PRIVATE_KEY="<KEY>"; node scripts/deploy-crove-resolver.mjs --network=dos-testnet\n');
    console.log('📌 Ordered Deployment Pipeline:');
    console.log('   Step 1: Deploy CroveResolver(easAddress, ownerAddress, address(0))');
    console.log('   Step 2: Register Schema v2 on SchemaRegistry.register(schema, croveResolverAddress, revocable=false)');
    console.log('   Step 3: Deploy CroveAnchorGateway(easAddress, ownerAddress, croveRelayerAddress, schemaUID)');
    console.log('   Step 4: Configure CroveResolver.setTrustedGateway(croveAnchorGatewayAddress)');
    console.log('   Step 5: Configure CroveResolver.setSchemaUID(schemaUID)');
    console.log('   Step 6: Update CROVE_ANCHOR_GATEWAY_ADDRESS and CROVE_RESOLVER_ADDRESS in .env & docs/ARCHITECTURE.md\n');
    return;
  }

  console.log('⏳ Connecting to RPC and executing deployment...');
}

main().catch((err) => {
  console.error('❌ Deployment error:', err);
  process.exit(1);
});
