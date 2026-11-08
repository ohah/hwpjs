#!/usr/bin/env node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// 공개 패키지의 서버를 그대로 실행해 도구·인수·WASM 선택의 출처를 하나로 유지합니다.
const require = createRequire(import.meta.url);
const packageURL = pathToFileURL(require.resolve('@ohah/hwpjs/package.json'));
await import(new URL('./dist/mcp.mjs', packageURL).href);
