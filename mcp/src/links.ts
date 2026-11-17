/**
 * Universal links (review round 2, U2): https://tigerworkouts.com/.well-known/apple-app-site-association,
 * served by this worker on a route of the tigerworkouts.com zone (wrangler.jsonc) so it goes out as
 * application/json with no redirect. GitHub Pages, which serves the rest of the site, would send an
 * extensionless file as application/octet-stream. The same JSON is in the site's
 * public/.well-known/ as a fallback for when the route is not deployed; a test keeps the two equal.
 */
export const AASA_PATH = '/.well-known/apple-app-site-association';

export const AASA = {
  applinks: {
    details: [
      {
        appIDs: ['2JDH6Z4WZ8.dev.brambruesch.tigerworkouts'],
        components: [
          { '/': '/', '#': '/join/*', comment: "A coach's invite" },
          { '/': '/', '#': '/w/*', comment: 'A workout' },
        ],
      },
    ],
  },
};

export const isAasaPath = (p: string) => p === AASA_PATH;

export const aasaResponse = () => new Response(JSON.stringify(AASA), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
