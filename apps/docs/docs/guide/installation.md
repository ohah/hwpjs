# 설치와 패키지

이번 안내는 현재 개발 workspace 기준이며, 제품 모노레포 변경은 순차 공개 중이므로 main의 새 clone이나 npm에서 즉시 설치·빌드할 수 있음을 보장하지 않습니다.

## 로컬 workspace부터 시작

정식 core 배포 이름은 `@ohah/hwpjs`입니다. 다만 아래 예제는 새 umbrella tarball의 실제 선언 파일로 검사한 canonical import를 사용하며, 새 Zig/WASM API는 아직 npm에 게시하지 않았습니다. 내부 개발 패키지 이름은 별도로 유지될 수 있습니다. 현재 공개 `@ohah/hwpjs@0.1.0-rc.10`은 기존 Rust/NAPI·WASI 패키지이므로 설치만으로 이 가이드의 새 API를 사용할 수 없습니다. [패키지 이름과 게시 상태](./package-names.md)를 먼저 확인하세요.

제품 패키지와 workspace 메타데이터가 함께 준비된 개발 checkout에서는 다음 단일 의존성을 사용합니다. 아래 JSON은 현재 main의 모든 앱에 이미 적용됐다는 뜻이 아닙니다.

```json
{
  "dependencies": {
    "@ohah/hwpjs": "workspace:*"
  }
}
```

manifest·잠금파일과 선행 제품 소스가 함께 준비된 checkout에서 의존성을 설치합니다. 현재 main만으로 아래 frozen install과 제품 빌드의 완전한 재현을 보장하지 않습니다. 현재 workspace는 Bun 1.4.4를 사용합니다.

```bash
bun install --frozen-lockfile
```

| 패키지 | 역할 | 추가 조건 |
| --- | --- | --- |
| `@ohah/hwpjs` | 상태·선택·명령·저장 | 문서 Runtime 주입 필요 |
| `@ohah/hwpjs/runtime` | Reader/Worker factory와 WASM loader | 별도 export 경로 |
| `@ohah/hwpjs/vanilla` | Canvas 렌더링과 입력 호스트 | 브라우저 DOM |
| `@ohah/hwpjs/react` | React CanvasSurface와 hooks | 현재 workspace React 19.3.1 |
| `@ohah/hwpjs/svelte` | Svelte CanvasEditor와 action | 현재 workspace Svelte 5.57.2 |
| `@ohah/hwpjs/react-native` | Native provider/transport 기반 | experimental; [미완료 경계](../frameworks/react-native.md) |

React/Svelte 어댑터는 같은 `@ohah/hwpjs` 패키지의 subpath입니다. React 또는 Svelte를 사용하는 앱만 해당 선택적 peer를 준비하세요. subpath를 별도 npm 의존성 이름으로 추가하지 않습니다.

## 빌드된 패키지와 소스의 차이

package exports는 빌드된 `dist`를 가리킵니다. workspace 연결만으로 Worker나 WASM이 생성되지는 않습니다. 아래 명령은 제품 소스·생산 도구·의존성 메타데이터가 함께 준비된 개발 checkout 기준이며, fresh clone에서 즉시 실행 가능함을 보장하지 않습니다. `/absolute/path/...`는 사용할 실제 입력·출력 경로로 바꾸세요.

### 내부 개발 웹 패키지 빌드

저장소 루트에서 내부 workspace 패키지를 빌드합니다. 이 명령은 단일 공개 `@ohah/hwpjs` 패키지를 생산하는 명령과 구분합니다.

```bash
bun run build:web --wasm=/absolute/path/to/hwpjs.wasm
```

### 단일 공개 패키지 후보 생산과 pack

저장소 루트에서 공개 패키지 생산 도구를 실행합니다. JS와 타입 선언을 소스에서 새로 생성하고 명시한 WASM을 포함하며, 기본 결과 디렉터리는 `packages/hwpjs/dist`입니다. 내부 workspace 패키지의 기존 `dist`를 입력으로 사용하지 않습니다. 검증한 도구 환경은 Bun 1.4.4·TypeScript 7.0.2·Svelte 5.57.2이며 React 타입 의존성도 필요합니다. `--wasm=...`는 필수 인수이고 환경변수로 자동 대체하지 않습니다.

```bash
mise exec -- bun tools/build-public-package.mjs --wasm=/absolute/path/to/hwpjs.wasm
```

생산 후 `packages/hwpjs` 디렉터리에서 로컬 tarball을 만듭니다. tarball 생성은 npm 게시가 아닙니다.

```bash
cd packages/hwpjs
mise exec -- bun pm pack --ignore-scripts --filename /absolute/path/to/hwpjs-umbrella.tgz
```

공개 패키지의 root·runtime·어댑터·worker·WASM export가 tarball에 포함된 결과를 가리키는지 확인해야 합니다. 이미 실행 중인 데모의 파일을 바꾸려면 별도의 배포 절차가 필요합니다. 문서 사이트 빌드는 제품 패키지나 WASM을 빌드하지 않습니다.

외부 프로젝트에 배포할 때는 패키지 게시 상태와 `exports`가 가리키는 파일을 먼저 확인하세요. 다음 단계는 [Runtime · WASM 설정](./runtime.md)입니다.

## 문서 예제 검사 범위

로컬 문서 타입 검사는 `packages/hwpjs/src`의 실제 public wrapper를 사용합니다. 이 제품 소스와 관련 workspace 메타데이터가 아직 함께 공개되지 않은 checkout에서는 예제 검사가 동작하지 않을 수 있습니다. 독립 문서 사이트 빌드와 제품 소스에 의존하는 예제 타입 검사는 별도이며, 제품 패키지·빌드 도구·의존성 메타데이터를 포함한 후속 커밋과 동기화해야 합니다.
