---
pageType: home
hero:
  name: HWPJS
  text: 문서 편집의 중심은 API
  tagline: HWP5 · HWPX를 읽고, 선택하고, 편집하고, 저장하세요. UI는 사용하는 프레임워크에 맡깁니다.
  actions:
    - theme: brand
      text: 시작하기
      link: /guide/installation
    - theme: alt
      text: 문서 데모 열기
      link: /playground
features:
  - title: Headless core
    details: 문서 수명과 명령을 DOM 없이 다룹니다. Runtime은 앱에서 주입합니다.
  - title: 하나의 Canvas 호스트
    details: Vanilla · React · Svelte 어댑터가 같은 렌더러와 입력 구현을 사용합니다.
  - title: 명확한 지원 경계
    details: typed 공개 API와 저수준 엔진 기능을 구분합니다. 문서별 지원 여부를 확인하세요.
---

## 현재 workspace를 위한 문서

이 사이트는 현재 Zig/WASM 기반 workspace의 공개 소스를 설명합니다. 과거 Rust 패키지의 설치법이나 변환 API를 현재 API로 안내하지 않습니다. 패키지의 npm 게시 여부와 빌드된 아티팩트 일치는 별도로 확인해야 합니다.

[설치](./guide/installation.md) → [Runtime 설정](./guide/runtime.md) → [첫 편집과 저장](./guide/editing.md) 순서로 시작하세요. [지원 범위](./guide/limitations.md)에서 완전한 재조판·형식 변환·개체 API의 경계를 확인할 수 있습니다.

## 샘플 파일과 데모

[noori.hwp 샘플·데모](./guide/demo.md)와 [noori.hwpx 샘플·데모](./guide/demo-hwpx.md)를 제공합니다. [문서 데모](/playground)에서 샘플·파일 열기 UI를 확인할 수 있습니다. 구 Rust 변환 UI를 이 사이트에 내장한 것은 아닙니다.
