#!/usr/bin/env node

/**
 * Crove Sign - Upstream Release Sync & Brand Patch Automation Script
 *
 * Automates pulling new release versions from upstream (documenso/documenso),
 * merging them cleanly into Crove Sign, and automatically executing the branding
 * patch script (scripts/patch-crove-branding.mjs).
 *
 * Usage:
 *   node scripts/sync-upstream.mjs [--tag=v2.18.0] [--dry-run]
 *   npm run sync:upstream / yarn sync:upstream
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const UPSTREAM_REPO_URL = 'https://github.com/documenso/documenso.git';
const UPSTREAM_API_LATEST = 'https://api.github.com/repos/documenso/documenso/releases/latest';

function runCmd(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, {
    cwd: ROOT_DIR,
    stdio: options.silent ? 'pipe' : 'inherit',
    encoding: 'utf-8',
    ...options,
  });
}

function runCmdOutput(cmd) {
  return execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
}

async function getLatestUpstreamReleaseTag() {
  try {
    const response = await fetch(UPSTREAM_API_LATEST, {
      headers: {
        'User-Agent': 'Crove-Sign-Sync-Script',
        Accept: 'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.tag_name) {
        return data.tag_name;
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch release from GitHub API, falling back to git remote tags:', err.message);
  }

  // Fallback: list remote tags from upstream via git
  const tagsOutput = runCmdOutput(`git ls-remote --tags --sort=-v:refname ${UPSTREAM_REPO_URL}`);
  const match = tagsOutput.match(/refs\/tags\/(v[0-9]+\.[0-9]+\.[0-9]+)/);
  if (match) {
    return match[1];
  }

  throw new Error('Unable to determine latest upstream release tag.');
}

function ensureUpstreamRemote() {
  const remotes = runCmdOutput('git remote').split('\n').map((r) => r.trim());
  if (!remotes.includes('upstream')) {
    console.log(`🔗 Adding upstream remote: ${UPSTREAM_REPO_URL}`);
    runCmd(`git remote add upstream ${UPSTREAM_REPO_URL}`);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('🔄 Crove Sign - Upstream Release Sync & Brand Patcher');
  console.log('======================================================\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let targetTag = args.find((a) => a.startsWith('--tag='))?.split('=')[1];
  const isDryRun = args.includes('--dry-run');

  ensureUpstreamRemote();

  console.log('📥 Fetching upstream tags and metadata...');
  runCmd('git fetch upstream --tags');

  if (!targetTag) {
    console.log('🔍 Detecting latest upstream release...');
    targetTag = await getLatestUpstreamReleaseTag();
  }

  console.log(`📌 Target Upstream Version: ${targetTag}\n`);

  if (isDryRun) {
    console.log('🔍 [Dry-Run] Target tag verified. No modifications made.');
    return;
  }

  // Fetch the specific tag
  runCmd(`git fetch upstream tag ${targetTag} --no-tags`);

  const currentBranch = runCmdOutput('git branch --show-current') || 'dev';
  console.log(`🌿 Current Active Branch: ${currentBranch}`);

  // Merge the upstream tag
  console.log(`\n🔀 Merging upstream release ${targetTag} into ${currentBranch}...`);
  try {
    runCmd(`git merge ${targetTag} --no-edit -m "chore(sync): merge upstream Documenso release ${targetTag}"`);
  } catch (err) {
    console.error(`\n❌ Conflict encountered while merging ${targetTag}. Please resolve conflicts, run 'npm run patch:branding', and commit.`);
    process.exit(1);
  }

  // Run the enterprise branding patch
  console.log('\n🎨 Applying Crove Sign Enterprise Branding...');
  runCmd('node scripts/patch-crove-branding.mjs');

  // Check if any branding files were modified
  const statusOutput = runCmdOutput('git status --porcelain');
  if (statusOutput) {
    console.log('\n💾 Committing Crove Sign branding updates...');
    runCmd('git add -A');
    runCmd(`git commit --no-trailer -m "chore(branding): apply Crove Sign enterprise branding patch for ${targetTag}"`);
  }

  console.log(`\n✨ Successfully synchronized and branded Crove Sign with upstream release ${targetTag}!`);
  console.log('🚀 Next step: Create a release tag and push to trigger automated Docker image build.\n');
}

main().catch((err) => {
  console.error('❌ Error executing upstream sync:', err);
  process.exit(1);
});
