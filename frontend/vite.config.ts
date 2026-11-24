import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Single source of truth for the release number: the VERSION file at the repo root.
// (scripts/bump-version.mjs updates it, package.json and the changelog together.)
const version = readFileSync(resolve(__dirname, '../VERSION'), 'utf8').trim();

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const commit = process.env.GITHUB_SHA?.slice(0, 7) || git('rev-parse --short HEAD') || 'dev';
const builtAt = new Date().toISOString();
const build = builtAt.slice(0, 10).replace(/-/g, '.');

/** Emits dist/version.json so an open browser tab can detect that a newer release was deployed. */
function versionManifest(): Plugin {
  return {
    name: 'nuvis-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version, build, commit, builtAt }, null, 2) + '\n',
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionManifest()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(build),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the flip engine out of the dashboard/admin graph; only reader/preview routes pull it in.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-pageflip': ['page-flip'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Same-origin in dev so the httpOnly refresh cookie works.
    proxy: {
      '/api': 'http://localhost:8080',
      '/storage': 'http://localhost:8080',
    },
  },
});
