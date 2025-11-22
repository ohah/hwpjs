import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
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
});
