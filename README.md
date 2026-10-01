# hwpjs

CFB 컨테이너 읽기·쓰기용 JavaScript/WASM 라이브러리.

## 준비 및 빌드

Zig 0.16.0과 Node.js 24를 설치한 뒤 저장소 루트에서 실행합니다.

```sh
zig build -Doptimize=ReleaseSafe
```

## Node.js에서 읽기

```js
import { readFileSync } from 'node:fs';
import { createCfbReader } from './js/cfb.mjs';

const reader = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
try {
  reader.parse(readFileSync('sample.hwp'), { strict: true });
  console.log(reader.findExact('/BodyText/Section0')?.content);
} finally {
  reader.close();
}
```

이 예제의 반환값은 CFB 스트림의 원시 바이트입니다. 통합 HWP/HWPX 본문 모델·일반 편집 API는 아직 제공하지 않습니다. 제한적 텍스트/기존 서식 편집은 [실험용 HWP5 JS API](docs/hwp5-editor-api.md)를 참고하세요.

HWP5 문단 텍스트의 읽기 전용 미리보기는 `node tools/hwp5-text-preview.mjs sample.hwp`로 확인할 수 있습니다. 먼저 위 빌드를 실행하세요. 제어 토큰을 제외한 텍스트와 문단별 제어 코드가 출력됩니다. [HWP5 미리보기 API](docs/hwp5-text-preview-api.md)는 완전한 문서 모델·편집·저장을 제공하지 않습니다.

## 브라우저에서 읽기

```js
import { createCfbReader } from './js/cfb.mjs';

const wasm = await fetch('./zig-out/bin/hwpjs.wasm');
const reader = await createCfbReader(await wasm.arrayBuffer());
try {
  const file = await fetch('./sample.hwp');
  reader.parse(new Uint8Array(await file.arrayBuffer()), { strict: true });
  console.log(reader.findExact('/FileHeader')?.content);
} finally {
  reader.close();
}
```

HTML·JS·WASM·입력 파일을 HTTP 서버에서 제공하고 실행합니다.

## Canvas 텍스트 미리보기 실행

빌드 후 `node tools/serve-preview.mjs`를 실행하고 [로컬 미리보기](http://127.0.0.1:8080/web/preview/index.html)에서 `.hwp` 파일을 선택하세요. 다른 포트는 `node tools/serve-preview.mjs 8081`처럼 지정합니다.

파일은 브라우저 안에서 처리합니다. 문단 텍스트만 표시하며 원본 서식·표·이미지·페이지 배치·HWPX는 표시하지 않습니다. ‘편집 실험 켜기’를 누르면 0-based 구역/문단과 UTF-16 범위로 단순 문단의 텍스트를 변경할 수 있습니다. 글자 모양 ID 변경은 화면에 표시되지 않으며 Canvas 직접 편집·웹 저장/다운로드는 없습니다. [지원 범위와 표시 한도](docs/canvas-text-preview.md)를 참고하세요.

스트림 추가·교체·저장과 옵션·자원 제한은 [CFB API](docs/cfb-reader.md#api)를 참고하세요.
