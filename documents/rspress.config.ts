import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  base: '/hwpjs/',
  title: 'HWPJS',
  description: '한글과컴퓨터의 한/글 문서 파일(.hwp)을 읽고 파싱하는 라이브러리',
  icon: '/logo.svg',
  logo: '/logo.svg',
  logoText: 'HWPJS',
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
      // @napi-rs/wasm-runtime을 번들에 포함시켜 브라우저에서 require 에러 방지
      // externals 설정 제거
    },
    tools: {
      rspack: {
        resolve: {
          // 브라우저 환경에서 ESM으로 처리
          conditionNames: ['browser', 'import', 'module', 'require'],
        },
      },
    },
  },
});
