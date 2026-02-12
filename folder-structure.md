# 폴더 구조

## 프로젝트 구조

```
hwpjs/
├── crates/
│   └── hwp-core/          # 공유 Rust 라이브러리 (핵심 HWP 파싱 로직 + 뷰어 기능)
│       ├── src/
│       │   ├── document/  # 문서 파싱 모듈
│       │   └── viewer/    # 문서 변환/뷰어 모듈 (마크다운, PDF(지원 예정) 등)
│       └── tests/
│           ├── fixtures/  # 테스트용 HWP 파일들
│           └── snapshots/ # 스냅샷 테스트 결과 파일들
├── packages/
│   └── hwpjs/             # 멀티 플랫폼 패키지 (Node.js, Web, React Native)
│       ├── src/           # NAPI-RS 바인딩 코드 (Node.js/Web용)
│       │   └── lib.rs     # NAPI-RS 바인딩 진입점
│       ├── src-cli/       # CLI 도구 소스 코드
│       │   ├── index.ts   # CLI 진입점
│       │   └── commands/  # CLI 명령어 (to-json, to-markdown, info, extract-images, batch)
│       ├── src-reactnative/ # React Native 바인딩 코드
│       │   ├── index.ts   # React Native 모듈 진입점
│       │   └── NativeReactNative.ts # 네이티브 모듈 타입 정의
│       ├── crates/lib/    # React Native용 Rust FFI 코드
│       │   └── src/       # FFI 구현 (ffi.rs, generated.rs, hwpjs_impl.rs, lib.rs)
│       ├── cpp/           # C++ 바인딩 코드 (Craby용)
│       ├── android/       # Android 네이티브 코드
│       ├── ios/           # iOS 네이티브 코드
│       ├── bin/           # CLI 실행 파일 (hwpjs.js)
│       ├── dist/          # 빌드 결과물
│       └── npm/           # 플랫폼별 바이너리 패키지
├── examples/              # 사용 예제 코드
│   ├── node/              # Node.js 예제
│   ├── web/               # Web 예제
│   ├── react-native/      # React Native 예제
│   └── cli/               # CLI 사용 예제
├── docs/                  # 문서 사이트 (Rspress)
└── legacy/                # 기존 JavaScript 구현
```

## hwp-core 모듈 구조

`crates/hwp-core/src/` 디렉토리는 HWP 파일 구조에 맞춰 다음과 같이 구성됩니다:

```
src/
├── document/     # HWP 문서 파싱 (FileHeader, DocInfo, BodyText, BinData 등)
│   ├── fileheader/    # FileHeader 스트림
│   ├── docinfo/       # DocInfo 스트림 (문서 정보)
│   ├── bodytext/      # BodyText 스토리지 (본문)
│   └── bindata/       # BinData 스토리지
├── viewer/       # 문서 변환/뷰어 모듈
│   ├── core/          # 공통 뷰어 로직 (Renderer trait, process_bodytext 등)
│   ├── markdown/      # 마크다운 변환 (완료)
│   ├── html/          # HTML 변환 (완료)
│   ├── canvas/        # Canvas 변환 (예정)
│   └── pdf/           # PDF 변환 (예정)
├── types.rs      # HWP 자료형 정의 (표 1: 자료형)
├── cfb.rs        # CFB (Compound File Binary) 파싱
├── decompress.rs # zlib 압축 해제
└── lib.rs        # 라이브러리 진입점 및 HwpParser
```

**구조 원칙**:

- HWP 파일 구조(스펙 문서 표 2)와 1:1 매핑
- 각 스트림/스토리지는 독립적인 모듈로 분리
- 상수, 직렬화 등은 별도 파일로 분리하여 가독성 향상
- **CFB 경로 처리는 CfbParser에 중앙화**

## 워크스페이스 설정

- **Bun 워크스페이스**: `packages/*` 디렉토리를 워크스페이스로 관리. 각 패키지는 독립적으로 빌드 및 배포 가능.
- **Cargo 워크스페이스**: `crates/*` 및 `packages/*/Cargo.toml`을 워크스페이스 멤버로 포함. NAPI-RS는 Cargo 워크스페이스에서 정상 작동.

## 패키지별 구조 요약

| 패키지 | 역할 | 주요 디렉토리 |
|--------|------|----------------|
| `crates/hwp-core` | HWP 파싱 + 뷰어 | `src/document/`, `src/viewer/`, `tests/fixtures/`, `tests/snapshots/` |
| `packages/hwpjs` | Node/Web/RN 래퍼 | `src/`(NAPI-RS), `src-cli/`, `src-reactnative/`, `crates/lib/`, `cpp/`, `android/`, `ios/` |
| `examples/` | 사용 예제 | `node/`, `web/`, `react-native/`, `cli/` |
| `docs/` | 문서 사이트 (Rspress) | 루트 레벨 |

## packages/hwpjs 이중 빌드 시스템

- **NAPI-RS**: Node.js/Web용 — `src/lib.rs`, `bun run build:node`
- **Craby**: React Native용 — `crates/lib/`, `cpp/`, `craby build`
- **tsdown**: TypeScript 번들링 — ESM/CJS, React Native용 `dist/react-native/`

환경별 exports는 `package.json`의 `exports` 필드로 분기 (react-native, browser, node).

## 뷰어 모듈 구조

`crates/hwp-core/src/viewer/`:

- **core/**: `Renderer` trait, `process_bodytext`, `process_paragraph` 등 공통 로직
- **markdown/**, **html/**: 완료. **canvas/**, **pdf/**: 예정
- HTML 뷰어는 플랫 구조 (`document.rs`, `paragraph.rs` 등). 테이블은 `ctrl_header/table/` 서브모듈.
