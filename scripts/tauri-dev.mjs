#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const channel = String(process.env.CRM_CHANNEL || '').trim().toLowerCase() === 'dev' ? 'dev' : 'prod';
const config = channel === 'dev'
  ? {
      identifier: 'com.serverraum247.mietparkcrm.desktop.dev',
      productName: 'CRM Buddy Desktop Dev',
      plugins: {
        updater: {
          active: false,
        },
      },
    }
  : {
      identifier: 'com.serverraum247.mietparkcrm.desktop',
      productName: 'CRM Buddy Desktop',
      plugins: {
        updater: {
          active: true,
        },
      },
    };

const cliArgs = process.argv.slice(2);
const tempConfigPath = path.join(os.tmpdir(), `crm-buddy-tauri-dev-${channel}-${Date.now()}.json`);
fs.writeFileSync(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

const result = spawnSync('npx', ['tauri', 'dev', '--config', tempConfigPath, ...cliArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CRM_CHANNEL: channel,
    VITE_APP_CHANNEL: channel,
  },
});

try {
  fs.unlinkSync(tempConfigPath);
} catch {
  // best effort cleanup
}

process.exit(result.status ?? 1);
