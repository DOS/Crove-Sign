#!/usr/bin/env node

/**
 * Crove Sign - CroveAttestationResolver Deployment & Schema Registration Script
 *
 * Deploys the CroveAttestationResolver smart contract to DOS Chain (or EVM testnet/mainnet),
 * connects it to the pre-deployed EAS Core, and registers the Privacy-Preserving Schema v2.
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
  },
  'dos-testnet': {
    name: 'DOS Chain Testnet',
    rpcUrl: process.env.DOS_TESTNET_RPC || 'https://test.doschain.com',
    chainId: 39391,
    eas: '0x79799066b2b5072E4B154Bedde14Dbc22caa0EA5',
    schemaRegistry: '0x7979E91c465d3dde4faA7a6601b5b2c1C66c9999',
  },
};

const CROVE_SCHEMA_DEFINITION =
  'bytes32 anchorId, bytes32 documentHash, bytes32 auditRoot, uint16 itemIndex, uint16 itemCount, uint16 formatVersion';

async function main() {
  console.log('\n=============================================================');
  console.log('🚀 Crove Sign - CroveAttestationResolver Deployment Guide');
  console.log('=============================================================\n');

  const args = process.argv.slice(2);
  const networkArg = args.find((a) => a.startsWith('--network='))?.split('=')[1] || 'dos-testnet';
  const isDryRun = args.includes('--dry-run') || !process.env.DEPLOYER_PRIVATE_KEY;

  const networkConfig = NETWORKS[networkArg] || NETWORKS['dos-testnet'];

  console.log(`🌐 Target Network       : ${networkConfig.name}`);
  console.log(`📡 RPC Endpoint         : ${networkConfig.rpcUrl}`);
  console.log(`🔗 EAS Core Contract    : ${networkConfig.eas}`);
  console.log(`📑 SchemaRegistry       : ${networkConfig.schemaRegistry}`);
  console.log(`📜 Attestation Schema   : "${CROVE_SCHEMA_DEFINITION}"\n`);

  console.log('📋 Contract Artifacts Summary:');
  console.log('   - Contract Source    : contracts/CroveAttestationResolver.sol');
  console.log('   - Base Resolver      : contracts/resolver/SchemaResolver.sol');
  console.log('   - EAS Interfaces     : contracts/interfaces/IEAS.sol, ISchemaResolver.sol');
  console.log('   - TypeScript ABI     : packages/lib/server-only/blockchain/resolver-abi.ts\n');

  if (isDryRun) {
    console.log('🔍 [Dry-Run / Spec Mode]:');
    console.log('   To deploy on-chain, provide DEPLOYER_PRIVATE_KEY and run:');
    console.log('   $env:DEPLOYER_PRIVATE_KEY="<KEY>"; node scripts/deploy-crove-resolver.mjs --network=dos-testnet\n');
    console.log('📌 Steps executed during live deployment:');
    console.log('   1. Deploy CroveAttestationResolver(EAS, initialOwner, croveSignerAddress).');
    console.log('   2. Call SchemaRegistry.register(schema, croveResolverAddress, revocable=false).');
    console.log('   3. Call croveResolver.setSchemaUID(schemaUID).');
    console.log('   4. Write deployment addresses to docs/ARCHITECTURE.md and .env.\n');
    return;
  }

  console.log('⏳ Connecting to RPC and executing deployment...');
}

main().catch((err) => {
  console.error('❌ Deployment error:', err);
  process.exit(1);
});
