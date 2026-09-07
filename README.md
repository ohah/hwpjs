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

반환값은 CFB 스트림의 원시 바이트입니다. HWP/HWPX 본문 파싱·편집 API는 아직 제공하지 않습니다.

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

스트림 추가·교체·저장과 옵션·자원 제한은 [CFB API](docs/cfb-reader.md#api)를 참고하세요.
