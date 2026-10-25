# 패키지 이름과 게시 상태

정식 core 배포 이름은 **`@ohah/hwpjs`**입니다. 현재 개발 workspace의 이름과 지금 npm에서 설치되는 패키지는 구분해야 합니다.

| 대상 | 현재 확인한 상태 | 사용 시 주의 |
| --- | --- | --- |
| npm의 `@ohah/hwpjs@0.1.0-rc.10` | 기존 Rust/NAPI·WASI 변환 패키지 | 새 `createEditor`·typed command API가 아님 |
| 로컬 `@hwpjs/core`, `@hwpjs/vanilla`, `@hwpjs/react`, `@hwpjs/svelte` | 현재 개발 workspace manifest | npm 게시 패키지로 확인되지 않음 |
| 새 `@ohah/hwpjs` Zig/WASM API | 준비 중, npm 게시하지 않음 | 기존 이름에 설치 명령만 실행해 새 API를 얻을 수 없음 |

기존 공개 패키지는 루트 `.`의 browser/node/react-native 조건과 `./package.json`을 export합니다. `/runtime`, `/worker`, `/wasm`은 현재 공개 rc.10의 export가 아닙니다. 이 문서가 설명하는 새 API로 기존 패키지의 함수를 바꿔 읽지 마세요.

## 새 배포 구조 검토

내부 모노레포의 core·Vanilla·React·Svelte·React Native 분리는 유지하면서, 외부에는 단일 `@ohah/hwpjs`와 하위 경로를 제공하는 umbrella 구성을 사용합니다. 실제 tarball 소비 검증과 npm 게시는 별개입니다.

| 후보 import 경로 | 의미 |
| --- | --- |
| `@ohah/hwpjs` | canonical core API |
| `@ohah/hwpjs/runtime` | Reader/Worker runtime과 WASM loader |
| `@ohah/hwpjs/worker`, `@ohah/hwpjs/wasm` | 배포된 Worker/WASM asset export |
| `@ohah/hwpjs/vanilla` | Canvas surface |
| `@ohah/hwpjs/react` | React adapter, 선택적인 React peer 필요 |
| `@ohah/hwpjs/svelte` | Svelte adapter, 선택적인 Svelte peer 및 SSR 경계 필요 |
| `@ohah/hwpjs/react-native` | experimental Native provider 기반; 기기 연결·검증 별도 |

`@ohah/hwpjs/core`는 별도로 npm에 게시하는 이름이 아닙니다. 단일 패키지의 `./core` export로 제공할 수 있지만, 여기서는 core의 canonical 경로를 루트 `@ohah/hwpjs`로 둡니다. 어댑터를 `@ohah/hwpjs-react` 같은 별도 패키지로 발행하는 방식은 비교안이며 확정 정책이 아닙니다.

## 지금 예제를 실행하려면

가이드 예제의 canonical imports는 새 단일 umbrella tarball을 clean consumer에 설치하고 실제 packed 선언 파일로 검사했습니다. 이 검증은 npm 게시를 뜻하지 않습니다. 기존 내부 workspace 이름과 외부 subpath는 별도로 유지될 수 있습니다. 아직 공개하지 않은 API에 `bun add @ohah/hwpjs`만 안내해 설치 성공처럼 보이게 하지 않습니다.

[공개 API 직접 실행](../api/playground.mdx)은 배포에 포함된 실제 내부 패키지·WASM을 사용합니다. 실행 화면의 `@ohah/hwpjs` 코드 표기는 새 canonical 이름을 설명하며, npm에서 동일 API가 이미 게시됐다는 뜻은 아닙니다.
