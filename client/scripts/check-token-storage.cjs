const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function loadStorage(file) {
  const calls = [];
  let secureToken = null;
  const storage = { multiRemove: async (keys) => calls.push(['removeLegacy', keys]) };
  const secure = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
    getItemAsync: async () => secureToken,
    setItemAsync: async (key, token, options) => { calls.push(['secureWrite', key, options]); secureToken = token; },
    deleteItemAsync: async () => { secureToken = null; },
  };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require(name) {
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (name === 'expo-secure-store') return secure;
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return { exports, calls };
}
(async () => {
  for (const file of ['lib/tokenStorage.ts', 'lib/tokenStorage.web.ts']) {
    const { exports: store, calls } = loadStorage(file);
    assert.equal(await store.getStoredToken(), null);
    await store.storeToken('test-session');
    assert.equal(await store.getStoredToken(), 'test-session');
    await store.removeStoredToken();
    assert.equal(await store.getStoredToken(), null);
    assert.equal(calls.filter(([kind]) => kind === 'removeLegacy').length, 1);
    if (file.endsWith('.web.ts')) assert.equal(calls.length, 1);
    else assert.equal(calls[1][2].keychainAccessible, 'device-only');
  }
  assert.equal(await loadStorage('lib/tokenStorage.web.ts').exports.getStoredToken(), null);
  console.log('Native secure storage, legacy cleanup, sign-out, and ephemeral web sessions passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
