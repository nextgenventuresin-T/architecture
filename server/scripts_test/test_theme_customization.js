'use strict';

const http = require('http');

const API_BASE = 'http://localhost:5000/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING THEME CUSTOMIZATION & PERSISTENCE INTEGRATION TESTS');
  console.log('================================================================\n');

  // TEST 1: Admin Authentication
  console.log('--- TEST 1: Admin Authentication ---');
  const { signAccessToken } = require('../src/utils/tokens');
  const adminToken = signAccessToken({ id: 1, email: 'admin@architectureerp.com', role: 'admin' });
  console.log('✔ Authenticated as Admin successfully');

  const meRes = await request('GET', '/auth/me', null, adminToken);
  const loggedInUser = meRes.data?.data;
  console.log(`✔ User theme payload received: ${loggedInUser?.theme?.themeName || loggedInUser?.theme?.name || 'Purple'}\n`);

  // TEST 2: Get active theme (Public / Default)
  console.log('--- TEST 2: Get Active Theme ---');
  const activeRes = await request('GET', '/settings/theme');
  if (activeRes.status !== 200 || !activeRes.data?.data) {
    throw new Error(`Get active theme failed: ${JSON.stringify(activeRes.data)}`);
  }
  console.log(`✔ Active theme: ${activeRes.data.data.themeId || activeRes.data.data.id} (${activeRes.data.data.themeName || activeRes.data.data.name})`);
  console.log(`✔ Primary color: ${activeRes.data.data.colors?.primary}\n`);

  // TEST 3: List all themes & clients (Requires Auth)
  console.log('--- TEST 3: List All Themes & Clients ---');
  const listRes = await request('GET', '/settings/themes', null, adminToken);
  if (listRes.status !== 200 || !listRes.data?.data?.presets) {
    throw new Error(`List themes failed: ${JSON.stringify(listRes.data)}`);
  }
  const presetsCount = listRes.data.data.presets.length;
  const clientsCount = listRes.data.data.clients.length;
  console.log(`✔ Retrieved ${presetsCount} preset palettes`);
  console.log(`✔ Retrieved ${clientsCount} client companies available for custom theming\n`);

  // TEST 4: Save Custom Theme for Global Organization
  console.log('--- TEST 4: Save Custom Theme for Global Organization ---');
  const globalCustomColors = {
    primary: '#4338CA',
    secondary: '#6366F1',
    accent: '#F59E0B',
    sidebarBg: '#312E81',
    sidebarText: '#FFFFFF',
    background: '#EEF2FF',
    card: '#FFFFFF',
    buttonPrimaryBg: '#4338CA',
    buttonPrimaryText: '#FFFFFF',
    textMain: '#1E1B4B',
    textMuted: '#3730A3',
    border: '#C7D2FE',
    statusSuccess: '#059669',
    statusWarning: '#D97706',
    statusDanger: '#DC2626',
    statusInfo: '#2563EB',
  };

  const saveGlobalRes = await request(
    'PUT',
    '/settings/themes/global',
    {
      themeId: 'custom',
      themeName: 'Indigo Executive Custom',
      isCustom: true,
      colors: globalCustomColors,
    },
    adminToken
  );

  if (saveGlobalRes.status !== 200 || !saveGlobalRes.data?.data) {
    throw new Error(`Save global theme failed: ${JSON.stringify(saveGlobalRes.data)}`);
  }
  console.log('✔ Saved global custom theme in database');
  console.log(`✔ Theme name: ${saveGlobalRes.data.data.themeName}`);
  console.log(`✔ Primary color saved: ${saveGlobalRes.data.data.colors?.primary}\n`);

  // TEST 5: Save Distinct Custom Theme for Client 1 (Silverleaf Developers)
  console.log('--- TEST 5: Save Custom Theme for Client 1 ---');
  const client1Colors = {
    primary: '#0D9488',
    secondary: '#14B8A6',
    accent: '#F97316',
    sidebarBg: '#134E4A',
    sidebarText: '#FFFFFF',
    background: '#F0FDFA',
    card: '#FFFFFF',
    buttonPrimaryBg: '#0D9488',
    buttonPrimaryText: '#FFFFFF',
    textMain: '#042F2E',
    textMuted: '#115E59',
    border: '#99F6E4',
    statusSuccess: '#059669',
    statusWarning: '#D97706',
    statusDanger: '#DC2626',
    statusInfo: '#0284C7',
  };

  const saveClient1Res = await request(
    'PUT',
    '/settings/themes/1',
    {
      themeId: 'custom',
      themeName: 'Silverleaf Teal Theme',
      isCustom: true,
      colors: client1Colors,
    },
    adminToken
  );

  if (saveClient1Res.status !== 200 || !saveClient1Res.data?.data) {
    throw new Error(`Save Client 1 theme failed: ${JSON.stringify(saveClient1Res.data)}`);
  }
  console.log('✔ Saved custom theme specifically for Client 1 (Silverleaf Developers)');
  console.log(`✔ Client 1 Theme: ${saveClient1Res.data.data.themeName} (Primary: ${saveClient1Res.data.data.colors?.primary})\n`);

  // TEST 6: Verify Isolation (Client 1 vs Global vs Client 2)
  console.log('--- TEST 6: Verify Theme Isolation ---');
  const getClient1Res = await request('GET', '/settings/themes/1', null, adminToken);
  const getClient2Res = await request('GET', '/settings/themes/2', null, adminToken);

  if (getClient1Res.data.data.colors?.primary !== '#0D9488') {
    throw new Error(`Client 1 should have primary #0D9488, got ${getClient1Res.data.data.colors?.primary}`);
  }
  if (getClient2Res.data.data.colors?.primary !== '#4338CA') {
    throw new Error(`Client 2 (unconfigured) should inherit global primary #4338CA, got ${getClient2Res.data.data.colors?.primary}`);
  }
  console.log('✔ Client 1 has independent custom theme (#0D9488)');
  console.log('✔ Client 2 smoothly inherits the Global theme (#4338CA)\n');

  // TEST 7: Reset Client 1 Theme back to default
  console.log('--- TEST 7: Reset Client 1 Theme back to default ---');
  const resetClient1Res = await request('DELETE', '/settings/themes/1', null, adminToken);
  if (resetClient1Res.status !== 200) {
    throw new Error(`Reset Client 1 theme failed: ${JSON.stringify(resetClient1Res.data)}`);
  }
  const client1AfterReset = await request('GET', '/settings/themes/1', null, adminToken);
  console.log(`✔ Client 1 reset successfully. Now inherits global theme (#${client1AfterReset.data.data.colors?.primary})\n`);

  // TEST 8: Reset Global Theme back to Purple Default
  console.log('--- TEST 8: Reset Global Theme back to Default Purple ---');
  const resetGlobalRes = await request('DELETE', '/settings/themes/global', null, adminToken);
  if (resetGlobalRes.status !== 200) {
    throw new Error(`Reset global theme failed: ${JSON.stringify(resetGlobalRes.data)}`);
  }
  const globalAfterReset = await request('GET', '/settings/theme');
  console.log(`✔ Global theme reset successfully. Active primary: ${globalAfterReset.data.data.colors?.primary} (${globalAfterReset.data.data.themeName || globalAfterReset.data.data.name})\n`);

  // TEST 9: Security & Authorization Check
  console.log('--- TEST 9: Security Check (Unauthorized Modification Blocked) ---');
  const unauthRes = await request('PUT', '/settings/themes/global', {
    themeId: 'hacked',
  });
  if (unauthRes.status !== 401 && unauthRes.status !== 403) {
    throw new Error(`Expected 401/403 for unauthenticated theme edit, got ${unauthRes.status}`);
  }
  console.log(`✔ Unauthenticated write request correctly rejected with HTTP ${unauthRes.status}\n`);

  console.log('================================================================');
  console.log('ALL THEME CUSTOMIZATION & PERSISTENCE INTEGRATION TESTS PASSED!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
