# HWPJS

한글과컴퓨터의 한/글 문서 파일(.hwp)을 읽고 파싱하는 라이브러리입니다.

본 제품은 한글과컴퓨터의 한/글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.  
[공개 문서 다운로드](https://www.hancom.com/etc/hwpDownload.do)

## 프로젝트 구조

이 프로젝트는 Bun 워크스페이스를 사용한 모노레포 구조입니다.

```
hwpjs/
├── crates/
│   └── hwp-core/          # 공유 Rust 라이브러리
├── packages/
│   ├── react-native/      # React Native용 래퍼
│   └── node/              # Node.js용 래퍼
├── examples/              # 사용 예제
├── docs/                  # 문서 사이트
└── legacy/                # 기존 JavaScript 구현
```

## 기술 스택

### 현재 버전 (Rust 기반)

- **Rust**: 핵심 로직 구현
- **Craby**: React Native 바인딩
- **NAPI-RS**: Node.js 네이티브 모듈
- **Bun**: 워크스페이스 관리
- **Rspress**: 문서 사이트

### Legacy 버전 (JavaScript)

- [sheetjs - CFB](http://sheetjs.com) - Compound Binary File을 읽기 위한 플러그인
- [pako](https://github.com/nodeca/pako) - Compound Binary File에서 일부 압축 된 코드를 읽기 위한 플러그인(zlib)

## 참고한 프로젝트

- [pyhwp](https://github.com/mete0r/pyhwp)
- [hwpjs](https://github.com/hahnlee/hwp.js)

## 개발 시작하기

### 환경 설정

mise를 사용하여 필요한 도구를 설치합니다:

```bash
mise install
```

### 스크립트

- `bun run test:rust` - Rust 테스트 실행
- `bun run test:node` - Node.js 테스트 실행
- `bun run test:e2e` - E2E 테스트 실행
- `bun run lint` - 린트 검사
- `bun run format` - 코드 포맷팅
- `bun run build` - 전체 빌드

## 사용법

## 이슈 제안 및 건의

해당 깃허브에 남겨주세요.

## 라이센스

MIT License

Copyright (c) 2021 ohah

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 제작자 정보

Copyright ohah
E-mail: bookyoon173@gmail.com
