const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');

// Exercise the actual server functions without its database/worker startup.
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function serverFunction(name, next) {
  return source.slice(source.indexOf(`function ${name}(`), source.indexOf(`\n${next}`, source.indexOf(`function ${name}(`)));
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tontrack-static-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function put(name, content = `public:${name}`) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const context = vm.createContext({
    root, fs, path, URL, Buffer,
    require: createRequire(path.join(__dirname, '..', 'server.js')),
    mime: { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' },
    giftPricePreview: { enabled: () => false },
    json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); },
  });
  vm.runInContext(`${serverFunction('safeStaticPath', 'function requestOrigin')}\n${serverFunction('serveStatic', 'async function runQueuedTonApi')}`, context);
  return { root, put, context };
}

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (method, target) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: target, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, allow: res.headers.allow }));
    });
    req.on('error', reject); req.end();
  });
}

test('static requests cannot read private project files even when they exist', (t) => {
  const { put, context } = fixture(t);
  for (const name of ['.env', '.git/config', 'server.js', 'docs/notes.md', 'data/session.json', 'node_modules/pg/package.json', 'assets/private.js', 'assets/session.json']) {
    put(name, 'SYNTHETIC_PRIVATE_SENTINEL');
    assert.equal(context.safeStaticPath(`/${name}`), null, name);
  }
});

test('the current page entries and public media remain readable', (t) => {
  const { root, put, context } = fixture(t);
  const publicFiles = ['index.html', 'styles.css', 'styles-product-v2.css', 'styles-terminal-system.css', 'styles-ui-restoration.css', 'styles-reference-ui.css', 'chart-platform.js', 'app.js', 'terminal-system.js', 'preview-home.png', 'node_modules/chart.js/dist/chart.umd.js', 'assets/branding/icon.svg', 'assets/branding/background.mp4', 'assets/gifts/models/example.json', 'assets/gift-layer-registry.json'];
  for (const name of publicFiles) {
    put(name);
    assert.equal(context.safeStaticPath(`/${name}?v=current`), path.join(root, name), name);
  }
  for (const alias of ['/', '/miniapp-v2', '/miniapp-v2/']) assert.equal(context.safeStaticPath(alias), path.join(root, 'index.html'));
});

test('ambiguous paths and malformed encodings are denied without throwing', (t) => {
  const { context } = fixture(t);
  for (const target of ['/assets/../server.js', '/assets/%2e%2e/app.js', '/assets/%252e%252e/app.js', '/assets/a%2fb.png', '/assets/a%5cb.png', '/assets/\\..\\server.js', '/app.js:private', '/assets/a.png::$DATA', '//app.js', '/assets/.hidden.png', '/%ZZ', '/%E0%A4%A', '/assets/a%00.png']) {
    assert.equal(context.safeStaticPath(target), null, target);
  }
});

test('symlinks cannot expose files outside the intended public tree', (t) => {
  const { root, put, context } = fixture(t);
  put('private/example.png', 'SYNTHETIC_PRIVATE_SENTINEL');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.symlinkSync(path.join(root, 'private'), path.join(root, 'assets', 'escape'), 'junction');
  assert.equal(context.safeStaticPath('/assets/escape/example.png'), null);
  fs.rmSync(path.join(root, 'assets'), { recursive: true });
  fs.symlinkSync(path.join(root, 'private'), path.join(root, 'assets'), 'junction');
  assert.equal(context.safeStaticPath('/assets/example.png'), null);
});

test('static GET, HEAD and unsupported methods have safe HTTP behavior', async (t) => {
  const { put, context } = fixture(t);
  put('app.js', 'PUBLIC_APP');
  const request = await listen(t, context.serveStatic);
  assert.deepEqual(await request('GET', '/app.js?v=1'), { status: 200, body: 'PUBLIC_APP', allow: undefined });
  assert.deepEqual(await request('HEAD', '/app.js'), { status: 200, body: '', allow: undefined });
  const post = await request('POST', '/app.js');
  assert.equal(post.status, 405);
  assert.equal(post.allow, 'GET, HEAD');
  assert.equal((await request('GET', '/%ZZ')).status, 403);
});

test('the actual request router preserves Lottie and the generated wallet manifest with safe methods', async (t) => {
  const { put, context } = fixture(t);
  put('node_modules/lottie-web/build/player/lottie.min.js', 'PUBLIC_LOTTIE');
  context.port = 0;
  context.http = { createServer: (handler) => { context.requestHandler = handler; } };
  vm.runInContext(`${serverFunction('requestOrigin', 'function isLocalHttpRequest')}\n${serverFunction('tonConnectManifest', 'function parseTonAddress')}`, context);
  const start = source.indexOf('const server = http.createServer(');
  const end = source.indexOf('\n});', start) + '\n});'.length;
  vm.runInContext(source.slice(start, end), context);
  const request = await listen(t, context.requestHandler);
  const player = await request('GET', '/assets/vendor/lottie.min.js');
  assert.equal(player.status, 200);
  assert.equal(player.body, 'PUBLIC_LOTTIE');
  const manifest = await request('GET', '/tonconnect-manifest.json');
  assert.equal(manifest.status, 200);
  assert.equal(JSON.parse(manifest.body).name, 'TonTrack Portfolio');
  assert.equal((await request('HEAD', '/assets/vendor/lottie.min.js')).body, '');
  for (const route of ['/assets/vendor/lottie.min.js', '/tonconnect-manifest.json']) {
    assert.equal((await request('POST', route)).status, 405, route);
    assert.equal((await request('GET', `/assets/..${route}`)).status, 403, route);
  }
});
