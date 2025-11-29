import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  base: '/hwpjs/',
  title: 'HWPJS',
  description: '한글과컴퓨터의 한/글 문서 파일(.hwp)을 읽고 파싱하는 라이브러리',
  icon: '/logo.png',
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/ohah/hwpjs',
      },
    ],
  },
  builderConfig: {
    output: {
      // SSG 빌드 시 @ohah/hwpjs 관련 모듈을 번들링하지 않도록 external 처리
      externals: [
        '@ohah/hwpjs',
        '@napi-rs/wasm-runtime',
        /^@ohah\/hwpjs/,
        /^@napi-rs\/wasm-runtime/,
      ],
    },
    resolve: {
      // SSG 빌드 시 WASM 관련 파일을 번들링하지 않도록 처리
      alias: {
        '@ohah/hwpjs/dist/hwpjs.wasi.cjs': false,
      },
    },
  },
});
