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

mise(미즈)를 사용하여 필요한 도구를 설치합니다:

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

## 개발 배경

### 개발 동기

심심해서.  
2주 동안 작업하였습니다.  
관련 프로그램이 있나 찾아보았더니 위에서도 언급한 hwpjs, pyhwp 등이 이미 공개되어있었습니다.  
살짝 만들기 싫었지만 그냥 만들었습니다.  
개발 시작시 타입스크립트, 속도를 위하여 WASM 등을 고려하였으나 호환성이나 접근성, 사용 편의를 위해 순수한 자바스크립트로 개발하였습니다.

### 미완성 상태인데 공개하는 이유

1. 어느정도 틀은 잡았으나 나머지 작업량이 방대한걸 알아버려서.
2. 누군가에게 만든다고 떠들고 싶어서.
3. 현재 나와있는 웹버전 hwpjs보다는 조금 더 진척 되어 보여서
4. 공식문서가 좆같아서.

### 이름 중복에 대한 고민

이미 어느정도 구현 된 상태에서 목적과 이름이 같은 (소스는 다름) 동명의 소스가 깃허브에 hwpjs가 있다는걸 알았습니다.  
생성자 명을 이미 hwpjs로 해버려서 수정하기에는 번거롭고 제가 네이밍 센스가 없기 때문에 수정할만한 이름이 떠오르지 않았습니다.  
언제든지 개명이 가능한 플러그인이니 원하시는 플러그인 이름이 있으면 남겨주세요

### 알려진 이슈

- 한글 버전 5017 이하에서 작성된 문서에서 이미지가 있는 경우 불러오지 못하는 이슈가 있습니다.  
공식 문서에서도 잘못 쓰여있는 대표적인 내용 중 하나로 현재도 어찌저찌 처리 가능하지만, 땜빵이 아닌 정확하게 잘못된 코드를 문서화 하여 처리 할 예정에 있어 보류 중입니다.

## 개발 진행 내역

1. 페이지 처리, 페이지 여백 처리(일부 미완성)
2. 테이블 처리
3. 글자 서식 적용(언어별 서식 미적용, 자간, 장평, 공백 개행단락의 부정확한 크기 등 일부 미구현)
4. 글머리표 적용(일부 구현)

### 개발시 에로사항

공식문서가 생각보다 많이 부정확하여 속성이나 데이터를 가져오는데 번거로움이 있음.  
웹과 한글 문서간의 서식을 css만으로 처리하기에 애매한 부분이 있음.  
ex) 줄간격의 경우 적용은 되어있으나 css와 hwp문서의 줄간격 수치의 오차범위를 잡기 어렵다.

### 개발 목표

1. 대부분의 문서 구현(공개 문서가 정확하지 않아 100%는 현실적으로 불가능)
2. 웹워커 형식의 구동버전

### 업데이트 내역

#### 0.01 Beta
- HWPATAG_PARA_LINE_SEG를 활용한 높이 적용.
- TABLE의 셀 속성에 대한 문서가 부정확함. 기본값 외에 적용되지 않게 적용.

#### 0.02 Beta
- DOCINFO에 있는 스타일정보를 클래스화 시켜 소스를 좀 더 효율적으로 수정.
- 우선 알고 있는 모든 서식 적용. 단 언어별로 다른 서식을 정해야 하나 유니코드 구분 등 여러가지 번거로운 작업이 있어 한글 서식을 일괄 적용시킴
- 폰트 및 자간 좀 더 유사하게 적용.
- 머리말 꼬리말 적용.
- 테이블, 이미지, 객체 등의 글자처럼 취급 적용
- 썸네일(한글에서 기본지원하는) 출력 함수(getPrvImage), 한글 내에 써진 모든 텍스트가 저장되는 변수 추가.

#### 0.03 Beta
- 개행시 레이아웃 자간 적용
- 글상자 일부 데이터화
- 다단 일부 데이터화
- 글머리표 적용

#### 0.04 Beta
- 언어별 서식 적용(기타, 기호, 사용자 제외)
- PARA_TEXT ctrl_id 인코딩 문제 수정, 구분자 추가
- 단락 나누는 구조 일부 변경

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
