import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.resolve('public/og-default.svg')).href);
await page.screenshot({ path: 'public/og-default.png' });
await browser.close();
