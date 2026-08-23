import type { APIRoute } from 'astro';
import { loadMeetings } from '@/lib/content';
import { loadSyntheses } from '@/lib/syntheses';

const staticRoutes = ['', 'meetings/', 'insights/', 'learning/', 'coverage/'];

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async ({ site }) => {
  if (!site) return new Response('SITE_URL is required', { status: 500 });

  const meetings = await loadMeetings();
  const syntheses = await loadSyntheses(meetings.map(({ id }) => id));
  const routes = [
    ...staticRoutes,
    ...meetings.map(({ id }) => `meetings/${id}/`),
    ...syntheses.map(({ id }) => `insights/${id}/`)
  ];
  const urls = routes.map((route) => new URL(route, site).href);
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
};
