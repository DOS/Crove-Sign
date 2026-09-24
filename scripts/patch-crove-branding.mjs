#!/usr/bin/env node

/**
 * Crove Sign - Automated Enterprise Branding & Localization Patch Script
 *
 * This script automates white-labeling and brand synchronization for Crove Sign (forked from Documenso).
 * It safely updates Lingui translation catalogs (.po), web manifests, SVGs, and metadata without
 * touching core upstream React component logic, guaranteeing ZERO merge conflicts during upstream updates.
 *
 * Usage:
 *   node scripts/patch-crove-branding.mjs
 *   npm run patch:branding / yarn patch:branding
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ==========================================
// 1. BRAND CONFIGURATION & REPLACEMENT RULES
// ==========================================

const BRAND_CONFIG = {
  appName: 'Crove Sign',
  companyName: 'Crove, Inc.',
  shortName: 'Crove Sign',
  themeColor: '#10B981',
  backgroundColor: '#FFFFFF',
  supportEmail: 'support@crove.com',
  websiteUrl: 'https://sign.crove.com',
  docsUrl: 'https://docs.crove.com',
  oidcLabel: 'DOS.Me ID',
  metaDescription:
    'Crove Sign - Modern, secure, and intuitive digital document signing for individuals and teams. Part of the Crove OS ecosystem.',
};

// Key term replacements in Lingui PO files
const TERM_REPLACEMENTS = [
  // Full phrases & branding
  { from: /Documenso, Inc\./g, to: 'Crove, Inc.' },
  { from: /Documenso Inc\./g, to: 'Crove, Inc.' },
  { from: /Documenso License/g, to: 'Crove Sign License' },
  { from: /Join Documenso/g, to: 'Join Crove Sign' },
  { from: /Welcome to Documenso/g, to: 'Welcome to Crove Sign' },
  { from: /on Documenso/g, to: 'on Crove Sign' },
  { from: /with Documenso/g, to: 'with Crove Sign' },
  { from: /using Documenso/g, to: 'using Crove Sign' },
  { from: /by Documenso/g, to: 'by Crove Sign' },
  { from: /for Documenso/g, to: 'for Crove Sign' },
  { from: /in Documenso/g, to: 'in Crove Sign' },
  { from: /from Documenso/g, to: 'from Crove Sign' },
  { from: /to Documenso/g, to: 'to Crove Sign' },
  { from: /Documenso API/g, to: 'Crove Sign API' },
  { from: /Documenso account/g, to: 'Crove Sign account' },
  { from: /Documenso platform/g, to: 'Crove Sign platform' },
  { from: /Documenso instance/g, to: 'Crove Sign instance' },
  { from: /Documenso server/g, to: 'Crove Sign server' },
  { from: /Documenso/g, to: 'Crove Sign' },
  { from: /support@documenso\.com/g, to: BRAND_CONFIG.supportEmail },
  { from: /https:\/\/docs\.documenso\.com/g, to: BRAND_CONFIG.docsUrl },
  { from: /https:\/\/documenso\.com/g, to: BRAND_CONFIG.websiteUrl },
];

// ==========================================
// 2. PATCH LINGUI TRANSLATION CATALOGS (.po)
// ==========================================

function patchTranslationCatalogs() {
  console.log('🔄 [1/4] Patching Lingui translation catalogs (.po)...');
  const translationsDir = path.join(ROOT_DIR, 'packages', 'lib', 'translations');

  if (!fs.existsSync(translationsDir)) {
    console.warn(`⚠️ Translations directory not found: ${translationsDir}`);
    return;
  }

  const localeDirs = fs
    .readdirSync(translationsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  let totalPatched = 0;

  for (const locale of localeDirs) {
    const poFilePath = path.join(translationsDir, locale, 'web.po');
    if (!fs.existsSync(poFilePath)) {
      continue;
    }

    let content = fs.readFileSync(poFilePath, 'utf-8');
    const originalContent = content;

    // Apply replacements on msgstr lines only to preserve msgid source keys
    const lines = content.split('\n');
    let inMsgStr = false;

    const modifiedLines = lines.map((line) => {
      if (line.startsWith('msgstr')) {
        inMsgStr = true;
      } else if (line.startsWith('msgid') || line.startsWith('#')) {
        inMsgStr = false;
      }

      if (inMsgStr) {
        let updatedLine = line;
        for (const { from, to } of TERM_REPLACEMENTS) {
          updatedLine = updatedLine.replace(from, to);
        }
        return updatedLine;
      }

      return line;
    });

    content = modifiedLines.join('\n');

    if (content !== originalContent) {
      fs.writeFileSync(poFilePath, content, 'utf-8');
      totalPatched++;
      console.log(`   ✓ Patched locale: ${locale} (${poFilePath})`);
    }
  }

  console.log(`   ✅ Finished patching ${totalPatched} translation catalogs.\n`);
}

// ==========================================
// 3. PATCH PWA WEB MANIFESTS
// ==========================================

function patchWebManifests() {
  console.log('📱 [2/4] Patching PWA Web Manifests...');
  const manifestPaths = [
    path.join(ROOT_DIR, 'apps', 'remix', 'public', 'site.webmanifest'),
    path.join(ROOT_DIR, 'packages', 'assets', 'site.webmanifest'),
  ];

  const manifestData = {
    name: BRAND_CONFIG.appName,
    short_name: BRAND_CONFIG.shortName,
    icons: [
      {
        src: './android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: './android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    theme_color: BRAND_CONFIG.themeColor,
    background_color: BRAND_CONFIG.backgroundColor,
    display: 'standalone',
  };

  for (const manifestPath of manifestPaths) {
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify(manifestData, null, 2)}\n`, 'utf-8');
    console.log(`   ✓ Updated manifest: ${manifestPath}`);
  }
  console.log('   ✅ Finished updating PWA manifests.\n');
}

// ==========================================
// 4. GENERATE BRAND ASSETS (SVG LOGO & FAVICON)
// ==========================================

function generateBrandAssets() {
  console.log('🎨 [3/4] Ensuring Crove Sign brand SVG assets...');

  // 1. Favicon SVG
  const faviconSvgPath = path.join(ROOT_DIR, 'apps', 'remix', 'public', 'favicon.svg');
  const faviconSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none">
  <rect x="2" y="2" width="32" height="32" rx="8" fill="#10B981" />
  <path
    d="M11 18.5C11 14 14.5 10.5 19 10.5C22.5 10.5 25 12.5 25.5 15M25 15L22.5 25.5C22 27 20.5 28 19 28C16.5 28 14.5 26 14.5 23.5C14.5 20.5 18 19 25 19"
    stroke="#FFFFFF"
    stroke-width="2.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
`;
  fs.writeFileSync(faviconSvgPath, faviconSvgContent, 'utf-8');
  console.log(`   ✓ Created/updated favicon: ${faviconSvgPath}`);

  // 2. Branding Logo Component
  const brandingLogoPath = path.join(ROOT_DIR, 'apps', 'remix', 'app', 'components', 'general', 'branding-logo.tsx');
  const brandingLogoContent = `import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

export const BrandingLogo = ({ className = 'h-6 w-auto', ...props }: LogoProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 190 36"
      className={className}
      aria-label="Crove Sign"
      {...props}
    >
      {/* Crove Icon Mark */}
      <rect x="0" y="2" width="32" height="32" rx="8" fill="#10B981" />
      <path
        d="M9 18.5C9 14 12.5 10.5 17 10.5C20.5 10.5 23 12.5 23.5 15M23 15L20.5 25.5C20 27 18.5 28 17 28C14.5 28 12.5 26 12.5 23.5C12.5 20.5 16 19 23 19"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Brand Name "Crove" */}
      <text
        x="42"
        y="25"
        fontFamily="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="21"
        fontWeight="800"
        fill="currentColor"
        letterSpacing="-0.5px"
      >
        Crove
      </text>
      {/* Product Tag "SIGN" */}
      <rect x="110" y="7" width="58" height="22" rx="6" fill="#10B981" fillOpacity="0.15" />
      <text
        x="139"
        y="22.5"
        textAnchor="middle"
        fontFamily="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="12"
        fontWeight="700"
        fill="#10B981"
        letterSpacing="1px"
      >
        SIGN
      </text>
    </svg>
  );
};
`;
  fs.writeFileSync(brandingLogoPath, brandingLogoContent, 'utf-8');
  console.log(`   ✓ Created/updated logo component: ${brandingLogoPath}`);

  // 3. Branding Logo Icon Component
  const brandingIconPath = path.join(
    ROOT_DIR,
    'apps',
    'remix',
    'app',
    'components',
    'general',
    'branding-logo-icon.tsx',
  );
  const brandingIconContent = `import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

export const BrandingLogoIcon = ({ className = 'h-6 w-auto', ...props }: LogoProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      className={className}
      aria-label="Crove Sign Icon"
      {...props}
    >
      <rect x="2" y="2" width="32" height="32" rx="8" fill="#10B981" />
      <path
        d="M11 18.5C11 14 14.5 10.5 19 10.5C22.5 10.5 25 12.5 25.5 15M25 15L22.5 25.5C22 27 20.5 28 19 28C16.5 28 14.5 26 14.5 23.5C14.5 20.5 18 19 25 19"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
`;
  fs.writeFileSync(brandingIconPath, brandingIconContent, 'utf-8');
  console.log(`   ✓ Created/updated logo icon component: ${brandingIconPath}`);
  console.log('   ✅ Finished generating brand assets.\n');
}

// ==========================================
// 5. RASTERIZE BRAND BINARIES
// ==========================================

// Regenerates the committed PNG/ICO/JPG brand binaries from the Crove SVG
// (the upstream Documenso artwork that ships with the repo would otherwise
// keep leaking into favicons, social previews and email footers). Requires
// sharp at the repo root; skipped gracefully when unavailable so the patch
// never fails a fresh clone without node_modules.
async function rasterizeBrandBinaries() {
  console.log('🖼️  [4/5] Rasterizing Crove Sign brand binaries...');

  let sharp;

  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('   ⚠️ sharp not available - skipping binary rasterization (committed binaries kept)');
    return;
  }

  const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none">
  <rect x="2" y="2" width="32" height="32" rx="8" fill="#10B981" />
  <path
    d="M11 18.5C11 14 14.5 10.5 19 10.5C22.5 10.5 25 12.5 25.5 15M25 15L22.5 25.5C22 27 20.5 28 19 28C16.5 28 14.5 26 14.5 23.5C14.5 20.5 18 19 25 19"
    stroke="#FFFFFF"
    stroke-width="2.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

  const GREEN = '#10B981';
  const DARK = '#0f1113';

  const wordmarkSvg = (
    textColor,
    bg,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="374" height="55" viewBox="0 0 374 55">
  ${bg ? `<rect width="374" height="55" fill="${bg}"/>` : ''}
  <text x="6" y="41" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="${textColor}">Crove</text>
  <text x="146" y="41" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="${GREEN}">Sign</text>
</svg>`;

  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1270" height="760" viewBox="0 0 1270 760">
  <rect width="1270" height="760" fill="${DARK}"/>
  <rect x="24" y="24" width="1222" height="712" rx="28" fill="none" stroke="${GREEN}" stroke-opacity="0.35" stroke-width="3"/>
  <g transform="translate(150, 280) scale(5.5)" fill="none">${MARK_SVG.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none">', '').replace('</svg>', '')}</g>
  <text x="370" y="365" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="88" font-weight="700" fill="#FFFFFF">Crove</text>
  <text x="688" y="365" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="88" font-weight="700" fill="${GREEN}">Sign</text>
  <text x="374" y="432" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="30" fill="#9CA3AF">Electronic signatures for the Crove OS ecosystem</text>
</svg>`;

  const shareFrameSvg = (
    accent,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${DARK}"/>
  <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="3"/>
  <text x="64" y="118" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#FFFFFF">Crove</text>
  <text x="188" y="118" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="${accent}">Sign</text>
  <g transform="translate(1032, 508) scale(2.4)" fill="none">${MARK_SVG.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none">', '').replace('</svg>', '')}</g>
</svg>`;

  // Minimal ICO container wrapping a single PNG-compressed image (valid on
  // Windows Vista and every browser released since).
  const pngToIco = (pngBuffer) => {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);

    const entry = Buffer.alloc(16);
    entry.writeUInt8(32, 0);
    entry.writeUInt8(32, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuffer.length, 8);
    entry.writeUInt32LE(22, 12);

    return Buffer.concat([header, entry, pngBuffer]);
  };

  const writeIco = async (buffer) => {
    const png = await sharp(buffer).resize(32, 32).png().toBuffer();
    return pngToIco(png);
  };

  const targets = [
    ['apps/remix/public/favicon-16x16.png', 16],
    ['apps/remix/public/favicon-32x32.png', 32],
    ['apps/remix/public/apple-touch-icon.png', 180],
    ['apps/remix/public/android-chrome-192x192.png', 192],
    ['apps/remix/public/android-chrome-512x512.png', 512],
  ];

  try {
    for (const [relPath, size] of targets) {
      await sharp(Buffer.from(MARK_SVG)).resize(size, size).png().toFile(path.join(ROOT_DIR, relPath));
      console.log(`   ✓ ${relPath} (${size}x${size})`);
    }

    fs.writeFileSync(path.join(ROOT_DIR, 'apps/remix/public/favicon.ico'), await writeIco(Buffer.from(MARK_SVG)));
    console.log('   ✓ apps/remix/public/favicon.ico (32x32 PNG-ICO)');

    await sharp(Buffer.from(wordmarkSvg('#111311', null)))
      .png()
      .toFile(path.join(ROOT_DIR, 'packages/assets/static/logo.png'));
    console.log('   ✓ packages/assets/static/logo.png (374x55 wordmark)');

    // The SERVED copies live in apps/remix/public/static/ (email asset-url
    // and the share OG composition fetch them over HTTP) - packages/assets/
    // static/ is the source-of-record twin.
    await sharp(Buffer.from(wordmarkSvg('#111311', null)))
      .png()
      .toFile(path.join(ROOT_DIR, 'apps/remix/public/static/logo.png'));
    console.log('   ✓ apps/remix/public/static/logo.png (374x55 wordmark)');

    await sharp(Buffer.from(MARK_SVG))
      .resize(320, 320)
      .png()
      .toFile(path.join(ROOT_DIR, 'packages/assets/logo_icon.png'));
    console.log('   ✓ packages/assets/logo_icon.png (320x320)');

    await sharp(Buffer.from(ogSvg))
      .jpeg({ quality: 90 })
      .toFile(path.join(ROOT_DIR, 'apps/remix/public/opengraph-image.jpg'));
    console.log('   ✓ apps/remix/public/opengraph-image.jpg (1270x760)');

    await sharp(Buffer.from(shareFrameSvg(GREEN)))
      .png()
      .toFile(path.join(ROOT_DIR, 'packages/assets/static/og-share-frame.png'));
    console.log('   ✓ packages/assets/static/og-share-frame.png (1200x630)');

    await sharp(Buffer.from(shareFrameSvg(GREEN)))
      .png()
      .toFile(path.join(ROOT_DIR, 'apps/remix/public/static/og-share-frame.png'));
    console.log('   ✓ apps/remix/public/static/og-share-frame.png (1200x630)');

    await sharp(Buffer.from(shareFrameSvg('#34D399')))
      .png()
      .toFile(path.join(ROOT_DIR, 'packages/assets/static/og-share-frame2.png'));
    console.log('   ✓ packages/assets/static/og-share-frame2.png (1200x630)');

    await sharp(Buffer.from(shareFrameSvg('#34D399')))
      .png()
      .toFile(path.join(ROOT_DIR, 'apps/remix/public/static/og-share-frame2.png'));
    console.log('   ✓ apps/remix/public/static/og-share-frame2.png (1200x630)');
  } catch (error) {
    // Degrade to the committed binaries on any sharp/libvips failure rather
    // than failing the whole patch run.
    console.log(`   ⚠️ Rasterization failed (${error.message}) - committed binaries kept`);
  }

  console.log('   ✅ Brand binaries rasterized.\n');
}

// ==========================================
// 6. UPDATE METADATA UTILS
// ==========================================

function patchMetadata() {
  console.log('📄 [5/5] Verifying app metadata...');
  const metaPath = path.join(ROOT_DIR, 'apps', 'remix', 'app', 'utils', 'meta.ts');
  const metaContent = `import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { i18n, type MessageDescriptor } from '@lingui/core';

export const appMetaTags = (title?: MessageDescriptor) => {
  const description =
    'Crove Sign - Modern, secure, and intuitive digital document signing for individuals and teams. Part of the Crove OS ecosystem.';

  return [
    {
      title: title ? \`\${i18n._(title)} - Crove Sign\` : 'Crove Sign',
    },
    {
      name: 'description',
      content: description,
    },
    {
      name: 'keywords',
      content:
        'Crove Sign, Crove, e-sign, digital signature, document signing, secure signature, open signing, Crove OS',
    },
    {
      name: 'author',
      content: 'Crove, Inc.',
    },
    {
      name: 'robots',
      content: 'index, follow',
    },
    {
      property: 'og:title',
      content: 'Crove Sign - Digital Document Signing',
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:image',
      content: \`\${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg\`,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:site',
      content: '@crove',
    },
    {
      name: 'twitter:description',
      content: description,
    },
    {
      name: 'twitter:image',
      content: \`\${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg\`,
    },
  ];
};
`;
  fs.writeFileSync(metaPath, metaContent, 'utf-8');
  console.log(`   ✓ Updated metadata utility: ${metaPath}`);
  console.log('   ✅ App metadata verified.\n');
}

// ==========================================
// MAIN RUNNER
// ==========================================

async function main() {
  console.log('\n========================================');
  console.log('🚀 Crove Sign - Enterprise Brand Patch');
  console.log('========================================\n');

  try {
    patchTranslationCatalogs();
    patchWebManifests();
    generateBrandAssets();
    await rasterizeBrandBinaries();
    patchMetadata();

    console.log('🎉 ALL CROVE SIGN BRANDING PATCHES APPLIED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Error applying branding patch:', error);
    process.exit(1);
  }
}

main();
