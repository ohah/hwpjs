import { defineConfig } from '@rspress/core';
import { fileURLToPath } from 'node:url';

const base = process.env.HWPJS_DOCS_BASE ?? '/docs/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) {
  throw Error('HWPJS_DOCS_BASE는 /docs/처럼 /로 시작하고 끝나는 경로여야 합니다.');
}

export default defineConfig({
  root: fileURLToPath(new URL('./docs', import.meta.url)),
  outDir: fileURLToPath(new URL('./doc_build', import.meta.url)),
  base,
  themeDir: fileURLToPath(new URL('./theme', import.meta.url)),
  globalStyles: fileURLToPath(new URL('./theme/styles/index.css', import.meta.url)),
  // Raw HTML download links use the same base without document-route normalization.
  replaceRules: [{ search: /__HWPJS_DOCS_BASE__/g, replace: base }],
  route: { cleanUrls: true },
  lang: 'ko',
  title: 'HWPJS',
  icon: '/icon.svg',
  description: 'HWP5 · HWPX 문서를 위한 헤드리스 API와 Canvas 어댑터',
  markdown: { link: { checkDeadLinks: true, checkAnchors: true } },
  // Base can change between Tailscale and Pages builds in the same checkout.
  builderConfig: { performance: { buildCache: false } },
  themeConfig: {
    nav: [
      { text: '시작하기', link: '/guide/installation' },
      { text: '샘플·데모', link: '/guide/demo' },
      { text: '문서 데모', link: '/playground' },
      { text: '공개 API', link: '/api/editor' },
      { text: '프레임워크', link: '/frameworks/vanilla' },
      { text: '지원 범위', link: '/guide/limitations' },
      { text: '로드맵', link: '/roadmap' },
    ],
    sidebar: {
      '/': [
        { text: '시작하기', items: [
          { text: '설치와 패키지', link: '/guide/installation' },
          { text: 'Runtime · WASM', link: '/guide/runtime' },
          { text: '열기 → 선택 → 입력 → 저장', link: '/guide/editing' },
          { text: 'HWP 샘플·데모', link: '/guide/demo' },
          { text: 'HWPX 샘플·데모', link: '/guide/demo-hwpx' },
        ] },
        { text: '프레임워크', items: [
          { text: 'Vanilla', link: '/frameworks/vanilla' },
          { text: 'React', link: '/frameworks/react' },
          { text: 'Svelte', link: '/frameworks/svelte' },
          { text: 'React Native (experimental)', link: '/frameworks/react-native' },
        ] },
        { text: 'API와 경계', items: [
          { text: 'HeadlessEditor', link: '/api/editor' },
          { text: '선택과 서식', link: '/api/selection' },
          { text: '지원 범위와 제한', link: '/guide/limitations' },
          { text: '기존 Rust 문서에서 이동', link: '/guide/migration' },
          { text: '로드맵', link: '/roadmap' },
        ] },
      ],
    },
    footer: { message: 'HWP5 · HWPX / 현재 workspace 소스 기준 문서' },
  },
});
