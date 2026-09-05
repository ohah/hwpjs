# CFB 읽기

기준 구현은 저장소의 `legacy/cfb.js` (SheetJS CFB 1.2.0)입니다. 범위는 **CFB 바이너리 컨테이너 읽기**이며, 같은 파일의 디렉터리 순서·경로·스트림 바이트·메타데이터·검색 결과·raw 헤더와 섹터를 비교합니다.

## 책임 분리

| 파일 | 책임 |
|---|---|
| `src/cfb/header.zig` | 헤더 필드·버전·섹터 크기 검사 |
| `src/cfb/sectors.zig` | 원본 바이트의 섹터 접근 |
| `src/cfb/allocation.zig` | FAT/DIFAT 구성, 일반 섹터 체인·중복 점유 검사 |
| `src/cfb/directory.zig` | 128바이트 엔트리·UTF-16 이름·메타데이터 해석 |
| `src/cfb/directory_tree.zig` | 계층·전체 경로·순환 참조 검사 |
| `src/cfb/streams.zig` | 일반/MiniFAT 스트림 추출·크기 제한 |
| `src/cfb/find.zig` | 이름·경로 검색과 호환 정규화 |
| `src/cfb/uppercase.zig` | 생성된 Unicode 대문자 매핑 데이터 |
| `src/cfb/types.zig` | 엔트리·자원 제한 옵션 |
| `src/cfb/reader.zig` | 공개 File API, 소유권·처리 순서 조립 |
| `src/wasm/memory.zig` | WASM 임시 입력 메모리 할당·해제 |
| `src/wasm/cfb.zig` | 열린 CFB 수명·오류·검색 |
| `src/wasm/cfb_entries.zig`, `cfb_raw.zig` | 엔트리 필드 및 raw 바이트 ABI |
| `js/wasm-memory.mjs` | JS/WASM 복사와 임시 메모리 정리 |
| `js/cfb-entry.mjs`, `cfb-find.mjs` | 엔트리 변환 및 보관된 JS 결과 검색 |
| `js/cfb.mjs`, `cfb-node.mjs` | 읽기 API 및 Node 전용 파일 입력 |

## API

Zig의 `cfb.File.open(allocator, bytes, options)`는 입력을 복사하고 반환 데이터 전체를 소유합니다. `defer file.deinit()`으로 해제합니다. `entries`, `find(allocator, path)`, `readStream(allocator, path)`, `rawHeader()`, `rawSector(id)`를 제공합니다. 반환 슬라이스는 File이 살아 있는 동안만 유효합니다.

브라우저:

```js
import { createCfbReader } from './js/cfb.mjs';
const reader = await createCfbReader(await (await fetch('./zig-out/bin/hwpjs.wasm')).arrayBuffer());
const container = reader.read(new Uint8Array(hwpBytes), { type: 'buffer', raw: true });
const stream = reader.find(container, '/BodyText/Section0');
console.log(stream?.content);
reader.close();
```

`parse(bytes)` 및 `read`의 `buffer`/배열/`base64`/`binary` 입력을 지원합니다. `read`의 기본 입력 타입은 레거시처럼 base64입니다. 파일 경로 입력은 Node 전용 `createNodeCfbReader`의 `read(path, {type:'file'})`를 사용합니다.

`FileIndex`/`FullPaths`, 선택적 `raw.header`/`raw.sectors`를 반환합니다. 엔트리에는 name/type/color/L/R/C/CLSID/state/start/size/ct/mt 및 스트림 content가 포함됩니다. raw FILETIME은 Zig에서 u64로 보존하고 JS 어댑터에서 Date로 변환합니다.

WASM 인스턴스당 열린 CFB는 하나입니다. 새 read는 이전 내부 CFB를 해제하지만, JS 결과는 복사본이므로 계속 사용할 수 있습니다. 결과 객체는 읽기 전용으로 취급합니다. 직접 ABI를 사용할 때 입력 포인터·크기는 호출자가 할당한 유효한 영역이어야 하며, 엔트리 포인터는 다음 open/close까지 유효합니다. 병렬 문서에는 별도 reader 인스턴스를 사용합니다.

## 호환성과 의도적 차이

- v3(512), v4(4096), MiniFAT(64), 4096바이트 컷오프, 확장 DIFAT, 빈 스트림·중첩 스토리지 지원.
- find는 전체 경로·루트 상대 경로·이름, Unicode 대문자 비교, NUL 제거·제어문자 1~6의 `!` 별칭을 처리합니다. Unicode 테이블은 생성 당시 Node 버전에 고정됩니다.
- 레거시가 허용하는 비표준 minor/BOM/헤더 CLSID는 보존합니다. 섹터 크기·예약 영역·컷오프는 검사합니다.
- 사이클·공유 섹터·고아 활성 엔트리·잘린 데이터·잘못된 UTF-16은 오류로 거부합니다. 레거시의 손상 입력 무한 루프나 조용한 잘림을 재현하지 않습니다.
- 기본 제한: 입력/개별 스트림 256 MiB, 합계 스트림 512 MiB, 엔트리 100만 개, 경로 합계 64 MiB. Zig Options에서 조정할 수 있습니다. 전체 힙 사용량은 테이블·입력 복사·경로·추출 데이터 때문에 이 제한들과 별개입니다.
- CFB 스트림은 **원시 바이트**입니다. HWP 압축 해제·암호 해제·문단 해석은 다음 계층입니다.
- 레거시 모듈의 ZIP/MIME 자동 감지, 쓰기·수정 유틸리티, content에 붙는 JS 전용 `read_shift` 메서드는 이 CFB 읽기 API에 포함하지 않습니다. 바이트 해석에는 별도 리더를 사용합니다.
- v4 크기는 u64로 읽습니다. 레거시의 하위 32비트 읽기 오류를 복제하지 않으며, 대용량 파일은 설정한 메모리 제한을 따릅니다.

## 검증

```sh
zig build test
zig build compare -Doptimize=ReleaseSafe
node tests/cfb/serve.mjs
# Chromium 등에서 http://127.0.0.1:11309 열기
```

2026-09-05 결과: HWP 48개 + 합성 12개 = 60개, 스트림 483개, 검색 5,496건 일치. 합성 입력에는 Unicode 경로·0/1/63/64/65/4095/4096/4097바이트·8 MiB 확장 DIFAT·v4·일반/MiniFAT 단편화 스트림·CLSID·상태·타임스탬프가 포함됩니다. 손상 입력 16개를 WASM에서 거부합니다. 네이티브 테스트는 할당 실패 전수 주입, 미니 스트림, 제한 및 오류 경로를 검사합니다. Chromium에서 HWP 48개·스트림 452개를 레거시 JS와 비교합니다.

이는 테스트된 범위의 호환성 증거이며, 모든 가능한 CFB 파일이나 공격 입력에 대한 완전성 보증은 아닙니다.

명세: [MS-CFB](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/53989ce4-7b05-4f8d-829b-d08d6148375b). 제3자 코드 고지는 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)에 있습니다.
