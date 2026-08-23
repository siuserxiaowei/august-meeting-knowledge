import { defineConfig } from 'astro/config';
import { normalizeBase } from './src/lib/paths';

const basePath = normalizeBase(process.env.BASE_PATH).replace(/^\//, '').replace(/\/$/, '');
const origin = process.env.SITE_URL || 'https://example.com';

export default defineConfig({
  output: 'static',
  base: basePath,
  site: new URL(basePath ? `/${basePath}/` : '/', origin).href,
  trailingSlash: 'always',
  build: {
    format: 'directory'
  },
  vite: {
    build: {
      cssMinify: true
    }
  }
});
