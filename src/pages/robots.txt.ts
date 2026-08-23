import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('SITE_URL is required', { status: 500 });

  const sitemap = new URL('sitemap.xml', site).href;
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
};
