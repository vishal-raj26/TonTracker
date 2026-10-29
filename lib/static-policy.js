const fs = require('fs');
const path = require('path');

const entries = new Set([
  '/index.html', '/styles.css', '/styles-product-v2.css',
  '/styles-terminal-system.css', '/styles-ui-restoration.css',
  '/styles-reference-ui.css', '/chart-platform.js', '/app.js',
  '/terminal-system.js', '/preview-home.png',
  '/node_modules/chart.js/dist/chart.umd.js',
]);
const mediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif', '.avif', '.mp4', '.webm', '.woff', '.woff2', '.ttf']);

function resolveStaticPath(root, requestTarget) {
  if (typeof requestTarget !== 'string') return null;
  const rawPath = requestTarget.split('?')[0];
  // Reject separators before decoding; decode only once and deny residual escapes.
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || /%2f|%5c/i.test(rawPath)) return null;
  let pathname;
  try { pathname = decodeURIComponent(rawPath); } catch { return null; }
  if (['/', '/miniapp-v2', '/miniapp-v2/'].includes(pathname)) pathname = '/index.html';
  const segments = pathname.slice(1).split('/');
  if (segments.some((segment) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment) || segment.endsWith('.'))) return null;
  const media = pathname.startsWith('/assets/') && mediaExtensions.has(path.extname(pathname));
  const layerMetadata = pathname === '/assets/gift-layer-registry.json'
    || /^\/assets\/gifts\/(?:[a-zA-Z0-9_-]+\/)*models\/[a-zA-Z0-9_-]+\.json$/.test(pathname);
  const lottiePlayer = pathname === '/assets/vendor/lottie.min.js';
  if (!entries.has(pathname) && !media && !layerMetadata && !lottiePlayer) return null;
  if (lottiePlayer) segments.splice(0, segments.length, 'node_modules', 'lottie-web', 'build', 'player', 'lottie.min.js');
  const filePath = path.resolve(root, ...segments);
  try {
    // No public path component may redirect into a private tree (including assets/ itself).
    const realRoot = fs.realpathSync(root);
    const expectedPath = path.resolve(realRoot, ...segments);
    if (fs.realpathSync(filePath) !== expectedPath || !fs.statSync(filePath).isFile()) return null;
  } catch { return null; }
  return filePath;
}

module.exports = { resolveStaticPath };
