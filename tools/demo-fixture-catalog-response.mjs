import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { demoFixtures } from '../web/preview/fixture-catalog.mjs';

export const demoFixtureCatalogPath = '/demo-fixture-catalog.json';

/** File availability only, never a Native capability/support declaration.
 * Keep the exact resolved-path equality policy of demo-fixture-response.mjs.
 * That module remains the sole owner of serving fixture bytes.
 */
export async function respondDemoFixtureCatalog(
  root,
  path,
  method,
  response,
  io = { access, realpath, stat },
) {
  if (path !== demoFixtureCatalogPath) return false;
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
    response.end();
    return true;
  }
  const fixtures = await Promise.all(
    demoFixtures.map(async (fixture) => {
      const expected = resolve(root, fixture.path);
      let available = false;
      try {
        // Reject symlink aliases just as the existing byte-serving route does.
        if ((await io.realpath(expected)) === expected) {
          const before = await io.stat(expected);
          if (before.isFile()) {
            // No bytes or file descriptors: check read permission, then reject any
            // observed path/identity/permission change during this observation.
            await io.access(expected, constants.R_OK);
            if ((await io.realpath(expected)) === expected) {
              const after = await io.stat(expected);
              available =
                after.isFile() &&
                ['dev', 'ino', 'mode', 'ctimeMs'].every((key) => before[key] === after[key]);
            }
          }
        }
      } catch {
        /* Missing/inaccessible optional assets do not break the catalog. */
      }
      return {
        id: fixture.id,
        name: fixture.name,
        label: fixture.label ?? fixture.name,
        available,
      };
    }),
  );
  const body = Buffer.from(JSON.stringify(fixtures));
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': body.length,
  });
  response.end(method === 'HEAD' ? undefined : body);
  return true;
}
