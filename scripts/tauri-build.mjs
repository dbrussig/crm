#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function resolveSigningIdentity() {
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

    const preferredPrefixes = [
      'Developer ID Application:',
      'Apple Development:',
      'Apple Distribution:',
    ];

    for (const prefix of preferredPrefixes) {
      const match = identities.find((identity) => identity.startsWith(prefix));
      if (match) return match;
    }

    return identities[0] || '';
  } catch {
    return '';
  }
}

const cliArgs = process.argv.slice(2);
const tauriArgs = ['tauri', 'build', ...cliArgs];
let tempConfigPath = '';

const signingIdentity = resolveSigningIdentity();
if (signingIdentity) {
  tempConfigPath = path.join(os.tmpdir(), `crm-buddy-tauri-signing-${Date.now()}.json`);
  fs.writeFileSync(
    tempConfigPath,
    `${JSON.stringify({ bundle: { macOS: { signingIdentity } } }, null, 2)}\n`,
    'utf8'
  );
  tauriArgs.push('--config', tempConfigPath);
  console.log(`[tauri-build] Verwende macOS-Signierung: ${signingIdentity}`);
} else if (process.platform === 'darwin') {
  console.warn('[tauri-build] Keine macOS-Signier-Identität gefunden. Fallback auf Standard-Build ohne stabile Signierung.');
}

const result = spawnSync('npx', tauriArgs, {
  stdio: 'inherit',
  env: process.env,
});

if (tempConfigPath) {
  try {
    fs.unlinkSync(tempConfigPath);
  } catch {
    // best effort cleanup
  }
}

process.exit(result.status ?? 1);
