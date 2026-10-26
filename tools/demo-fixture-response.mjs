import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demoFixtures, demoFixturePrefix, fixtureUrl } from '../web/preview/fixture-catalog.mjs';

// Called after the server's method and URL checks; exact decoded path only.
export async function respondDemoFixture(
  root,
  path,
  method,
  response,
  io = { readFile, realpath },
) {
  // Preserve the old server route, but derive the UI route from its catalog.
  const legacyPrefix = '/demo-fixtures/';
  if (!path.startsWith(demoFixturePrefix) && !path.startsWith(legacyPrefix)) return false;
  const fixture = demoFixtures.find(
    (item) =>
      path === decodeURIComponent(fixtureUrl(item.id)) || path === `${legacyPrefix}${item.id}`,
  );
  if (!fixture) {
    response.writeHead(404);
    response.end();
    return true;
  }
  const expected = resolve(root, fixture.path);
  const file = await io.realpath(expected);
  if (file !== expected) {
    response.writeHead(404);
    response.end();
    return true;
  }
  const body = await io.readFile(file);
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(method === 'HEAD' ? undefined : body);
  return true;
}
