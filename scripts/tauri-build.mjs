#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROD_IDENTIFIER = 'com.serverraum247.mietparkcrm.desktop';
const PROD_PRODUCT_NAME = 'CRM Buddy Desktop';
const DEV_IDENTIFIER = 'com.serverraum247.mietparkcrm.desktop.dev';
const DEV_PRODUCT_NAME = 'CRM Buddy Desktop Dev';

function resolveChannel() {
  return String(process.env.CRM_CHANNEL || '').trim().toLowerCase() === 'dev' ? 'dev' : 'prod';
}

function resolveChannelConfig(channel) {
  if (channel === 'dev') {
    return {
      identifier: DEV_IDENTIFIER,
      productName: DEV_PRODUCT_NAME,
      updaterActive: false,
      installPath: `/Applications/${DEV_PRODUCT_NAME}.app`,
    };
  }

  return {
    identifier: PROD_IDENTIFIER,
    productName: PROD_PRODUCT_NAME,
    updaterActive: true,
    installPath: `/Applications/${PROD_PRODUCT_NAME}.app`,
  };
}

function runOrThrow(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Befehl fehlgeschlagen: ${command} ${args.join(' ')}`);
  }
}

function installBuiltApp(channelConfig) {
  if (process.platform !== 'darwin') return;
  if (process.env.APPLE_SKIP_INSTALL === '1') {
    console.log('[tauri-build] Installation nach /Applications per APPLE_SKIP_INSTALL=1 übersprungen.');
    return;
  }

  const srcApp = path.resolve(`src-tauri/target/release/bundle/macos/${channelConfig.productName}.app`);
  const dstApp = channelConfig.installPath;

  if (!fs.existsSync(srcApp)) {
    throw new Error(`Build-App nicht gefunden: ${srcApp}`);
  }

  console.log(`[tauri-build] Installiere App nach ${dstApp}`);
  runOrThrow('rm', ['-rf', dstApp]);
  runOrThrow('ditto', [srcApp, dstApp]);
  runOrThrow('find', [dstApp, '-name', '._*', '-delete']);
  runOrThrow('xattr', ['-cr', dstApp]);
  runOrThrow('codesign', ['--force', '--deep', '--sign', '-', dstApp]);
  console.log(`[tauri-build] Installiert: ${dstApp}`);
}

function resolveSigningIdentity(channel) {
  if (process.env.APPLE_DISABLE_SIGNING === '1') {
    return '';
  }
  const explicit = String(process.env.APPLE_SIGNING_IDENTITY || '').trim();
  if (explicit) return explicit;
  if (process.platform !== 'darwin') return '';

  try {
    const output = execSync('security find-identity -v -p codesigning', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const identities = output
      .split('\n')
      .map((line) => line.match(/"([^"]+)"/)?.[1] || '')
      .filter(Boolean);

    const preferredPrefixes = channel === 'dev'
      ? ['Apple Development:', 'Developer ID Application:', 'Apple Distribution:']
      : ['Developer ID Application:', 'Apple Development:', 'Apple Distribution:'];

    for (const prefix of preferredPrefixes) {
      const match = identities.find((identity) => identity.startsWith(prefix));
      if (match) return match;
    }

    return identities[0] || '';
  } catch {
    return '';
  }
}

const channel = resolveChannel();
const channelConfig = resolveChannelConfig(channel);
const cliArgs = process.argv.slice(2);
const tauriArgs = ['tauri', 'build', ...cliArgs];
let tempConfigPath = '';
const isInformationalRun = cliArgs.includes('--help') || cliArgs.includes('-h') || cliArgs.includes('--version') || cliArgs.includes('-V');
const shouldInstallBuiltApp = !isInformationalRun && !cliArgs.includes('--no-bundle');

const signingIdentity = resolveSigningIdentity(channel);
if (signingIdentity) {
  tempConfigPath = path.join(os.tmpdir(), `crm-buddy-tauri-signing-${Date.now()}.json`);
  fs.writeFileSync(
    tempConfigPath,
    `${JSON.stringify({
      identifier: channelConfig.identifier,
      productName: channelConfig.productName,
      plugins: {
        updater: {
          active: channelConfig.updaterActive,
        },
      },
      bundle: { macOS: { signingIdentity } },
    }, null, 2)}\n`,
    'utf8'
  );
  tauriArgs.push('--config', tempConfigPath);
  console.log(`[tauri-build] Kanal: ${channel} | Signierung: ${signingIdentity}`);
} else if (process.platform === 'darwin') {
  const disabled = process.env.APPLE_DISABLE_SIGNING === '1';
  console.warn(
    disabled
      ? '[tauri-build] macOS-Signierung per APPLE_DISABLE_SIGNING=1 deaktiviert.'
      : '[tauri-build] Keine macOS-Signier-Identität gefunden. Fallback auf Standard-Build ohne stabile Signierung.'
  );
}

const result = spawnSync('npx', tauriArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    CRM_CHANNEL: channel,
    VITE_APP_CHANNEL: channel,
  },
});

if (tempConfigPath) {
  try {
    fs.unlinkSync(tempConfigPath);
  } catch {
    // best effort cleanup
  }
}

if (result.status === 0 && shouldInstallBuiltApp) {
  installBuiltApp(channelConfig);
}

process.exit(result.status ?? 1);
