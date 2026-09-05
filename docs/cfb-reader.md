# CFB 읽기·검증·쓰기

기준 구현은 저장소의 `legacy/cfb.js` (SheetJS CFB 1.2.0)입니다. 범위는 **CFB 바이너리 컨테이너 읽기**이며, 같은 파일의 디렉터리 순서·경로·스트림 바이트·메타데이터·검색 결과·raw 헤더와 섹터를 비교합니다.

위 기준은 레거시 읽기 호환성에 적용합니다. strict 검증과 v3/v4 writer의 기준은 공식 MS-CFB 12.0입니다. 컨테이너 생성·스트림 추가/교체·이름/부모 변경·삭제 후 재저장을 지원하지만, HWP 본문 파싱·압축·암호 해제 기능은 아닙니다.

## 책임 분리

| 파일 | 책임 |
|---|---|
| `src/cfb/header.zig` | 헤더 필드·버전·섹터 크기 검사 |
| `src/cfb/format.zig` | MiniFAT 크기·컷오프 및 FAT 분류의 단일 규칙 |
| `src/cfb/sectors.zig` | 원본 바이트의 섹터 접근 |
| `src/cfb/allocation.zig` | FAT/DIFAT 구성, 일반 섹터 체인·중복 점유 검사 |
| `src/cfb/directory.zig` | 128바이트 엔트리·UTF-16 이름·메타데이터 해석 |
| `src/cfb/directory_name.zig` | UTF-16·종료 문자·금지 문자 검증, 검증 후 NUL 제거 |
| `src/cfb/directory_tree.zig` | 계층·전체 경로·순환 참조 검사 |
| `src/cfb/path_builder.zig` | 활성/미사용 엔트리 전체의 경로 생성·공통 예산 집계 |
| `src/cfb/streams.zig` | 일반/MiniFAT 스트림 추출·크기 제한 |
| `src/cfb/find.zig` | 이름·경로 검색과 호환 정규화 |
| `src/cfb/uppercase.zig` | 생성된 Unicode 대문자 매핑 데이터 |
| `src/cfb/types.zig` | 엔트리·자원 제한 옵션 |
| `src/cfb/reader.zig` | 공개 File API, 소유권·처리 순서 조립 |
| `src/cfb/strict.zig`, `entry_rules.zig` | strict 헤더/디렉터리 검사, 읽기·쓰기 공통 메타데이터 규칙 |
| `src/cfb/name_order.zig`, `simple_uppercase.zig` | 명세 이름 유효성·비교·검색, Unicode 17 simple 대문자 데이터 |
| `src/cfb/writer_directory.zig` | 편집 모델 검증·부모 관계·중복 검사·형제 트리·엔트리 직렬화 |
| `src/cfb/writer_layout.zig`, `writer.zig` | 섹터 배치·Range Lock 예약·FAT/DIFAT 크기 계산, 컨테이너 직렬화 |
| `src/wasm/cfb_writer.zig`, `document_wire.zig`, `js/cfb-document.mjs` | 저장 결과 수명과 편집 모델의 ABI 경계 변환 |
| `src/wasm/memory.zig` | WASM 임시 입력 메모리 할당·해제 |
| `src/wasm/cfb.zig` | 열린 CFB 수명·오류·검색 |
| `src/wasm/cfb_entries.zig`, `cfb_raw.zig` | 엔트리 필드 및 raw 바이트 ABI |
| `js/wasm-memory.mjs` | JS/WASM 복사와 임시 메모리 정리 |
| `js/input.mjs` | 입력 타입·바이트 범위 검사, 실행 컨텍스트에 독립적인 버퍼 판별 |
| `js/output-bytes.mjs`, `blob-cursor.mjs` | 호스트별 출력 바이트 표현 및 복사본의 레거시 커서 메서드 |
| `src/wasm/cfb_search.zig`, `search_snapshot.zig` | 보관된 검색 메타데이터의 경계 검사·코어 검색 연결 |
| `js/abi-schema.mjs`, `src/wasm/abi_schema.zig` | ABI 기준 스키마와 생성된 Zig 선언 |
| `js/abi.mjs` | ABI 버전·필수 export·메모리 검사 |
| `js/cfb-entry.mjs`, `cfb-find.mjs`, `cfb-search-snapshot.mjs` | 엔트리 변환·검색 호출·메타데이터 직렬화 |
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

바이트 입력은 `Uint8Array`(Node Buffer 포함), `ArrayBuffer`, 또는 0~255 정수 배열입니다. 다른 실행 컨텍스트의 버퍼도 지원합니다. `Uint16Array` 등 다른 뷰, 범위 밖/소수/문자열 배열 원소, 255를 넘는 binary 문자열 문자, 알 수 없는 입력 타입은 조용히 절삭하지 않고 거부합니다.

`FileIndex`/`FullPaths`, 선택적 `raw.header`/`raw.sectors`를 반환합니다. 엔트리에는 name/type/color/L/R/C/CLSID/state/start/size/ct/mt 및 스트림 content가 포함됩니다. raw FILETIME은 Zig에서 u64로 보존하고 JS 어댑터에서 Date로 변환합니다.

JS 어댑터는 WASM i64 반환을 unsigned로 해석한 뒤 FILETIME을 변환하며, 이름 앞의 U+FEFF도 보존합니다. JS Date는 밀리초 정밀도이고, 전체 FILETIME 비트는 native/직접 ABI에서 확인합니다.

WASM 인스턴스당 열린 CFB는 하나입니다. 새 read는 이전 내부 CFB를 해제하지만, JS 결과는 복사본이므로 계속 사용할 수 있습니다. 이름·경로 메타데이터는 읽기 전용으로 취급합니다. `content`의 커서와 바이트는 수정할 수 있지만 내부 CFB나 입력 원본에 반영되지 않으며, CFB 저장 기능을 의미하지 않습니다. 직접 ABI를 사용할 때 입력 포인터·크기는 호출자가 할당한 유효한 영역이어야 하며, 엔트리 포인터는 다음 open/close까지 유효합니다. 병렬 문서에는 별도 reader 인스턴스를 사용합니다.

검색 규칙은 `src/cfb/find.zig` 한곳에 있습니다. 현재 문서는 내부 엔트리를, 보관된 결과는 이름·경로를 직렬화한 메타데이터를 같은 함수에 전달합니다. 보관된 결과의 메타데이터는 WeakMap에 캐시하고 호출 동안 WASM에 복사합니다. 다른 문서를 열거나 열기에 실패하거나 `close()`한 뒤에도 검색할 수 있으며, 현재 열린 문서를 교체하지 않습니다. JS 검색 문자열에 단독 surrogate가 있으면 대체문자로 변환하지 않고 `null`을 반환합니다.

현재 ABI는 **5**입니다. JS 초기화는 다른 버전과 필수 export/메모리 누락을 거부합니다. `js/abi-schema.mjs`가 필드 번호·버전·편집 모델 wire 형식의 기준이며 `node tools/generate-abi.mjs`가 Zig 선언을 출력합니다. 모든 빌드 및 네이티브 테스트에서 `--check`로 생성 파일의 일치를 검사합니다. `uses_fat`와 `has_content`는 코어의 분류 및 content 존재 여부를 전달합니다. JS에 FAT 분류나 MiniFAT 존재 조건을 중복 정의하지 않습니다. 검색 snapshot 형식은 ABI 2부터 동일합니다. `cfb_error_ptr/len`은 메시지, `cfb_error_code_ptr/len`은 네이티브 오류 이름을 반환합니다. 헤더 진단은 `Header.parseDiagnostic`의 검증 분기에서 만들어 JS에서 별도로 헤더를 파싱하지 않습니다.

## Strict 검증과 저장 API

```js
import { createCfbReader, removeNode } from './js/cfb.mjs';
const reader = await createCfbReader(wasmBytes);
reader.parse(hwpBytes, { strict: true });
const document = reader.document();
const index = document.nodes.findIndex(n => n.kind === 2 && n.name === 'Section0');
// 실제 Section0 교체에는 별도의 HWP 레코드 인코딩·압축이 필요합니다.
document.nodes[index].content = replacementStreamBytes;
const saved = reader.write(document); // Uint8Array, 원본을 덮어쓰지 않음
reader.parse(saved, { strict: true });
console.log(reader.findExact('/BodyText/Section0')?.size);
reader.close();
```

새 파일은 `reader.write({version:3, nodes:[{name:'Root Entry',kind:5}, {name:'Data',parent:0,content:new Uint8Array([1,2,3])}]})`로 만듭니다. version은 3 또는 4이며 기본값은 3입니다.

- `document()`는 현재 열린 파일의 독립적인 편집 모델을 반환합니다. `nodes[0]`은 root(kind=5), 나머지는 storage(kind=1) 또는 stream(kind=2)이며 `parent`는 nodes 배열 인덱스입니다. 이름/부모 변경, content 교체, nodes.push로 추가한 뒤 `write()`합니다. 부모가 자식보다 앞에 있을 필요는 없습니다.
- 삭제는 `removeNode(document,index)`로 subtree와 자식들을 제거하고 부모 인덱스를 재매핑합니다. 새 모델을 반환하며 남은 바이트 버퍼는 공유합니다. 배열을 직접 splice하면 parent 인덱스도 호출자가 수정해야 합니다.
- `clsid`는 파일 표현 그대로의 16바이트, `state`는 u32, `created`/`modified`는 raw FILETIME u64 **BigInt**입니다. JS Date를 경유하지 않아 정밀도를 잃지 않습니다. 생략한 메타데이터는 0입니다. 명세상 금지된 메타데이터는 조용히 버리지 않고 오류로 반환합니다.
- `findExact(path)`는 **현재 열린 파일**의 루트 상대 계층 검색입니다. `/`는 root입니다. 명세의 길이 우선·UTF-16 단위 simple 대문자 비교를 사용하며, 레거시 find의 basename/제어문자 별칭은 적용하지 않습니다. 정렬되지 않은 비표준 파일은 먼저 strict로 검증해야 합니다.
- Zig는 `cfb.writer.write(allocator,nodes,options)`와 `File.findExact(path)`, `File.toNodes(allocator)`를 제공합니다. write의 반환 바이트와 toNodes의 배열은 호출자가 free합니다. toNodes의 이름/내용은 File에서 빌리므로 File의 수명 안에서 사용합니다. writer는 입력을 변경하지 않습니다.
- direct ABI의 `cfb_write`/`cfb_document` 결과는 `cfb_output_ptr/len`으로 접근하고 `cfb_output_free`로 해제합니다. 다음 write/document 호출은 이전 출력도 해제합니다. JS는 즉시 복사·해제합니다. write 실패는 열려 있던 reader를 변경하지 않습니다.

strict는 헤더 CLSID/BOM/v4 패딩, 최소/전체 섹터 크기, FAT/DIFAT 목록·종료·EOF 이후 항목·할당 소유권, MiniFAT 개수·소유권, storage/stream/root/unused 필드, 중복 이름·전역 정렬·연속 red, Range Lock 참조를 검사합니다. v3 size high DWORD는 호환 요구에 따라 무시하며 minor의 SHOULD 값은 강제하지 않습니다. 기본 parse/read는 기존 호환 모드를 유지합니다.

저장 시 정상 필드·이름·부모 계층·모든 stream 바이트를 보존합니다. 물리 섹터 배치·unused 엔트리·여유 공간·헤더 minor/transaction signature·트리 색상은 정규화/재생성하므로 **파일 전체 바이트가 원본과 같다는 보장은 아닙니다.** 제자리 수정·동시 접근·트랜잭션 API는 제공하지 않습니다.

자원 제한은 여전히 적용됩니다. WASM은 전체 메모리 기반이며 입력/출력과 편집 wire 각각 기본 256 MiB 한도가 있습니다. 네이티브 Options는 한도를 조정할 수 있지만 실제 메모리·usize 한계도 적용됩니다. Range Lock 배치/제외는 구현하고 2 GiB 경계 계산을 테스트했으나, 실제 2 GiB 초과 파일이나 명세 최대 16 TiB 파일을 왕복 실측한 것은 아닙니다.

이번 검증: 네이티브 20개·Node/WASM 46개, 실제 HWP 48개 × v3/v4 재저장(스트림 904개)과 모든 편집 모델 필드, 16 MiB 다중 DIFAT, 생성 계층 64개, strict 변이 2,048건, 할당 실패 전수 주입, 손상된 wire·실패 후 복구를 검사합니다. Chromium에서는 기존 읽기 비교 외에 생성·수정 14조합을 확인합니다. HWP 본문 의미/렌더링의 검증은 아닙니다.

## 레거시 읽기 호환성과 의도적 차이

- v3(512), v4(4096), MiniFAT(64), 4096바이트 컷오프, 확장 DIFAT, 빈 스트림·중첩 스토리지 지원.
- find는 전체 경로·루트 상대 경로·이름, Unicode 대문자 비교, NUL 제거·제어문자 1~6의 `!` 별칭을 처리합니다. Unicode 테이블은 생성 당시 Node 버전에 고정됩니다.
- 레거시가 허용하는 비표준 minor/BOM/헤더 CLSID는 보존합니다. 섹터 크기·예약 영역·컷오프는 검사합니다.
- 사이클·공유 섹터·고아 활성 엔트리·잘린 데이터·잘못된 UTF-16은 오류로 거부합니다. 레거시의 손상 입력 무한 루프나 조용한 잘림을 재현하지 않습니다.
- v4 디렉터리 섹터 개수는 실제 체인과 대조하며, DIFAT에서 확인한 FAT/DIFAT 섹터 역할은 FAT 마커와 대조합니다. 모순되면 오류로 거부합니다.
- 사용 중인 일반/MiniFAT 스트림의 FREESECT 마커, 루트의 형제 참조, 스트림의 자식 참조, 활성 엔트리의 잘못된 색상·이름 종료·금지 문자를 거부합니다. UTF-16 유효성은 NUL 제거 전에 검사합니다. 이는 트리의 모든 정렬·red-black 균형 조건을 검증한다는 의미는 아닙니다.
- 기본 제한: 입력/개별 스트림 256 MiB, 합계 스트림 512 MiB, 엔트리 100만 개, 경로 합계 64 MiB. Zig Options에서 조정할 수 있습니다. 전체 힙 사용량은 테이블·입력 복사·경로·추출 데이터 때문에 이 제한들과 별개입니다.
- CFB 스트림은 **원시 바이트**입니다. HWP 압축 해제·암호 해제·문단 해석은 다음 계층입니다.
- 레거시 모듈의 ZIP/MIME 자동 감지 및 writer API의 동일한 반환 형태는 지원하지 않습니다. 새 CFB writer는 위의 별도 편집 모델 API입니다. `content`에는 레거시의 `l`, `read_shift`, `chk`, `write_shift`를 제공합니다. 커서 메서드는 JS 복사본에만 작용합니다.
- v4 크기는 u64로 읽습니다. 레거시의 하위 32비트 읽기 오류를 복제하지 않으며, 대용량 파일은 설정한 메모리 제한을 따릅니다.
- `content`의 존재 여부는 레거시처럼 미니 스트림 backing과 시작 섹터에 따라 결정하며, 빈 스트림이라고 일괄 생략하거나 빈 배열을 붙이지 않습니다. 스토리지·미사용 엔트리에도 빈 `content`가 있을 수 있습니다. Node Buffer 입력의 내용은 Buffer, 비-Buffer 입력의 내용은 배열입니다. 빈 content 할당은 Node에서 Buffer, 브라우저에서 배열을 사용합니다. raw는 입력의 Buffer/배열/Uint8Array 표현을 따릅니다.

## 검증

```sh
zig build test
zig build compare -Doptimize=ReleaseSafe
node tests/cfb/serve.mjs
# Chromium 등에서 http://127.0.0.1:11309 열기
```

2026-09-05 결과: HWP 48개 + 합성 12개 = 60개, 스트림 483개, 검색 5,496건 일치. 합성 입력에는 Unicode 경로·0/1/63/64/65/4095/4096/4097바이트·8 MiB 확장 DIFAT·v4·일반/MiniFAT 단편화 스트림·CLSID·상태·타임스탬프가 포함됩니다. 손상 입력 16개를 WASM에서 거부합니다. 네이티브 테스트는 할당 실패 전수 주입, 미니 스트림, 제한 및 오류 경로를 검사합니다. Chromium에서 HWP 48개·스트림 452개를 레거시 JS와 비교합니다.

첫 SSOT 회귀 검증(`c2e6d6b2` 당시): 수정 전 경로 제한 11바이트에 실제 14바이트가 반환되었고, 검색 수명 불일치·v4 개수 모순·FAT 역할 모순·ABI 미검증의 5개 Node 테스트가 실패했습니다. 수정 후 네이티브 9개와 Node 계약 테스트 9개가 통과했습니다. 계약 테스트에는 DIFAT 역할 모순, 지원 버전의 필수 export/메모리 누락도 포함합니다. Node와 Chromium 양쪽에서 Unicode·제어문자·경로 검색 264건을 열림/다른 문서 열림/열기 실패/닫힘 상태에 걸쳐 레거시와 비교합니다. `zig build compare`는 레거시 비교와 계약 테스트를 함께 실행합니다.

### 반복 검증

후속 두 수정 회차에서 BOM 이름 손실, 디렉터리·FREESECT 검증 누락, unsigned FILETIME, 바이트 절삭, 다른 실행 컨텍스트의 버퍼 거부를 재현하고 수정했습니다. 해당 회차의 네이티브 테스트 10개와 Node 테스트 22개가 통과했습니다. 네이티브 테스트에는 변이 입력 4,096건의 반환 데이터 크기·메모리 정리 검사가 포함됩니다.

```sh
zig build audit -Doptimize=ReleaseSafe
# audit는 네이티브 테스트, 레거시 비교, 계약 테스트, WASM 변이 12,000건을 실행
CFB_MUTATION_SEED=3735928559 node tests/cfb/mutations.mjs
CFB_MUTATION_SEED=305419896 node tests/cfb/mutations.mjs
```

기본 시드 `12648430`과 위 두 시드의 총 36,000건에서 트랩·검사 불변식 위반은 발견되지 않았습니다. 변이 뒤에도 정상 파일을 열 수 있는지 총 360회 확인합니다. 정상 상태로 남은 변이를 전부 오류로 거부하도록 강제하지 않으며, 변이 파일은 레거시 파서에 전달하지 않습니다. Debug/ReleaseSafe/ReleaseFast의 audit 및 Chromium의 실제 HWP 48개·BOM/FILETIME/iframe 버퍼 검증을 수행합니다. 재리뷰에서 확인한 범위 내 추가 중요 지적은 없었으나, 전체 입력 공간이나 메모리 고갈 상황에 대한 완전성 보장은 아닙니다.

이는 테스트된 범위의 호환성 증거이며, 모든 가능한 CFB 파일이나 공격 입력에 대한 완전성 보증은 아닙니다.

### 테스트 공백 보강 및 SSOT (2026-09-05)

- 네이티브 14개, Node/WASM 28개: `zig build audit`에 모두 연결합니다.
- 독립 encoder로 v3/v4 × 연속/역순 MiniFAT × 12개 크기(0~4095) × 16개 payload 변형 = 768개를 생성합니다. 파서와 독립적인 기대 바이트 전체를 Zig/WASM 및 레거시 출력과 비교합니다. 빈 스트림 fixture는 content 속성의 부재를 직접 검증합니다.
- 16 MiB 데이터의 실제 2개 이상 DIFAT 연결·전체 바이트·순환/범위 밖 링크 오류 및 실패 후 복구를 확인합니다. 네이티브 할당 실패 주입에는 별도의 작은 비최소 FAT 배치(237 FAT + 2 DIFAT)를 사용합니다.
- 모든 자원 제한에 비영(非零) 한도−1/한도/한도+1, 2개 스트림의 합산, 20단계 경로 및 미사용 엔트리 경로 합산을 검사합니다. 루트 mini stream의 용량 제한도 별도로 확인합니다.
- 일반 스트림·중첩 디렉터리·다중 DIFAT·검색 별칭 fallback·보관 검색 snapshot에서 할당 실패 전수 주입을 수행합니다. 일반/MiniFAT 공유 섹터의 정확한 오류도 검사합니다.
- 기존 결정적 손상 입력은 정확한 오류 이름으로 검증합니다. 무작위 손상 sweep은 성공/실패 불변식과 정리·트랩 검사용이며, 임의 변이의 정상 의미까지 판정하는 oracle은 아닙니다.
- 제품 규칙의 SSOT와 테스트 정답의 독립성을 구분합니다. 테스트 encoder와 숫자 기대값은 제품 코드에서 생성하지 않습니다. 브라우저 검증은 `agent-browser`로 실제 Chromium에서 기존 HWP·수명·BOM/FILETIME/다른 realm 경계를 실행합니다.

명세: [MS-CFB](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/53989ce4-7b05-4f8d-829b-d08d6148375b). 제3자 코드 고지는 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)에 있습니다.

소스 대조 회차의 함수 대응표, 엄격 비교 범위와 승인 대기 차이는 [cfb-compatibility.md](cfb-compatibility.md)를 확인합니다. 앞선 회차의 테스트 개수는 당시 결과이며, 현재 테스트 목록은 `build.zig`의 audit에 연결되어 있습니다.
