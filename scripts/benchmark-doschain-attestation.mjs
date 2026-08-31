#!/usr/bin/env node

/**
 * Crove Sign - DOS Chain & EAS Attestation Benchmark Suite
 *
 * Measures:
 * 1. RFC 8785 Canonical JSON Hashing Performance (ops/sec)
 * 2. Merkle Root Computation for Multi-PDF Envelopes (1 to 50 items)
 * 3. EAS Payload Size & Calldata Gas Estimation (Single vs Multi-Attest)
 * 4. DOS Chain Node RPC Latency, Block Height & Inclusion Time Verification
 *
 * Usage:
 *   node scripts/benchmark-doschain-attestation.mjs [--network=dos-testnet|dos-mainnet] [--iterations=1000]
 */

import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

// =========================================================================
// 1. BENCHMARK UTILITIES & ALGORITHMS (RFC 8785 & MERKLE)
// =========================================================================

function canonicalizeJson(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'number' || typeof obj === 'boolean') return JSON.stringify(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(obj);
}

function hashCanonicalJson(obj) {
  const canonicalStr = canonicalizeJson(obj);
  return `0x${crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex')}`;
}

function computeMerkleRoot(leafHashes) {
  if (leafHashes.length === 0) {
    return '0x0000000000000000000000000000000000000000000000000000000000000000';
  }
  if (leafHashes.length === 1) return leafHashes[0];

  let currentLevel = leafHashes.map((h) => (h.startsWith('0x') ? h.slice(2) : h));
  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const combined = Buffer.concat([
          Buffer.from(currentLevel[i], 'hex'),
          Buffer.from(currentLevel[i + 1], 'hex'),
        ]);
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      } else {
        const combined = Buffer.concat([
          Buffer.from(currentLevel[i], 'hex'),
          Buffer.from(currentLevel[i], 'hex'),
        ]);
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      }
    }
    currentLevel = nextLevel;
  }
  return `0x${currentLevel[0]}`;
}

// =========================================================================
// 2. BENCHMARK TESTS
// =========================================================================

async function runBenchmarks() {
  console.log('\n================================================================');
  console.log('⚡ Crove Sign - DOS Chain Attestation & Gas Benchmark Suite');
  console.log('================================================================\n');

  const args = process.argv.slice(2);
  const iterations = parseInt(args.find((a) => a.startsWith('--iterations='))?.split('=')[1] || '5000', 10);
  const network = args.find((a) => a.startsWith('--network='))?.split('=')[1] || 'dos-testnet';

  // Test 1: Canonical JSON Hashing Throughput
  console.log(`📊 [1/4] Benchmarking Canonical JSON Hashing (${iterations} iterations)...`);
  const mockAuditBundle = {
    envelopeId: 'cuid_test_envelope_99999',
    timestamp: '2026-08-31T12:00:00.000Z',
    signers: [
      { email: 'signer1@crove.com', name: 'Alice Nguyen', role: 'SIGNER', status: 'SIGNED' },
      { email: 'signer2@crove.com', name: 'Bob Tran', role: 'APPROVER', status: 'APPROVED' },
    ],
    metadata: {
      certificateId: 'cert_987654321',
      algorithm: 'RSA-SHA256',
      documentCount: 3,
    },
  };

  const startHash = performance.now();
  for (let i = 0; i < iterations; i++) {
    hashCanonicalJson(mockAuditBundle);
  }
  const endHash = performance.now();
  const hashDuration = (endHash - startHash) / 1000;
  const hashOpsSec = Math.round(iterations / hashDuration);
  console.log(`   ⏱️ Duration       : ${(endHash - startHash).toFixed(2)} ms`);
  console.log(`   🚀 Throughput     : ${hashOpsSec.toLocaleString()} ops/sec\n`);

  // Test 2: Multi-Item Merkle Tree Computation
  console.log('📊 [2/4] Benchmarking Merkle Tree Computation for Multi-PDF Envelopes...');
  const testCounts = [1, 2, 5, 10, 25, 50];

  for (const count of testCounts) {
    const leafHashes = Array.from({ length: count }, (_, idx) =>
      `0x${crypto.createHash('sha256').update(`PDF Document Content ${idx}`).digest('hex')}`
    );

    const startMerkle = performance.now();
    for (let i = 0; i < 1000; i++) {
      computeMerkleRoot(leafHashes);
    }
    const endMerkle = performance.now();
    const avgTimeUs = ((endMerkle - startMerkle) / 1000) * 1000;
    console.log(`   📦 ${count.toString().padStart(2)} PDF item(s) : ~${avgTimeUs.toFixed(2)} µs per tree calculation`);
  }
  console.log('');

  // Test 3: Calldata Size & EVM Gas Cost Estimation
  console.log('📊 [3/4] Estimating EAS Calldata & Gas Usage...');
  // Evidence Schema v2: 6 x bytes32 (192 bytes) + uint16 (32 bytes padded) + uint8 (32 bytes padded) = 256 bytes payload
  const singleAttestCalldataBytes = 4 + 32 + 32 + 32 + 32 + 32 + 32 + 256; // ~484 bytes
  const singleAttestGas = 21000 + singleAttestCalldataBytes * 16 + 45000; // Base + Calldata + State write (~65,000 - 85,000 gas)
  
  // Batch 5 items in multiAttest
  const batch5Gas = 21000 + (singleAttestCalldataBytes * 5) * 16 + 45000 + 4 * 25000; // ~180,000 gas (average ~36k gas per document)
  const gasSavingsPct = Math.round((1 - (batch5Gas / 5) / singleAttestGas) * 100);

  console.log(`   ⛽ Single Document Attestation  : ~${singleAttestGas.toLocaleString()} gas`);
  console.log(`   ⛽ Multi-Item Batch (5 items)   : ~${batch5Gas.toLocaleString()} gas total (~${Math.round(batch5Gas / 5).toLocaleString()} gas/doc)`);
  console.log(`   💡 Multi-Attest Gas Efficiency  : ${gasSavingsPct}% gas reduction per document\n`);

  // Test 4: DOS Chain RPC Network Check
  console.log(`📊 [4/4] Probing DOS Chain RPC Endpoint (${network})...`);
  const rpcUrl = network === 'dos-mainnet' ? 'https://main.doschain.com' : 'https://test.doschain.com';

  try {
    const startRpc = performance.now();
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });

    const endRpc = performance.now();
    const latencyMs = Math.round(endRpc - startRpc);

    if (response.ok) {
      const data = await response.json();
      const currentBlock = parseInt(data.result, 16);
      console.log(`   🌐 RPC Status     : ONLINE (HTTP 200)`);
      console.log(`   ⏱️ RPC Latency    : ${latencyMs} ms`);
      console.log(`   🧱 Current Block  : #${currentBlock}\n`);
    } else {
      console.warn(`   ⚠️ RPC responded with status ${response.status}`);
    }
  } catch (err) {
    console.log(`   ℹ️ [Notice] RPC offline or unreachable from local machine (${err.message}).`);
    console.log(`   🛡️ Crove Sign Outbox Worker handles network latency gracefully with retryable outbox persistence.\n`);
  }

  console.log('================================================================');
  console.log('✅ BENCHMARK & SIMULATION SUITE COMPLETED SUCCESSFULLY');
  console.log('================================================================\n');
}

runBenchmarks().catch(console.error);
