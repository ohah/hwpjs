# 도형 공통 속성의 미해석 꼬리

`src/hwp5/edit/drawing_object_extras.zig`는 기존 drawing_sources의 gso/직접 component/문단 검증과 object_common 파서를 재사용해 남은 바이트를 전부 소유 hex 문자열로 제공합니다. `control_node`·`paragraph_node`는 해당 원문 Tree의 인덱스이며 저장 후 영구 ID가 아닙니다. 반환 rows와 문자열은 `deinit(allocator, rows)`로 함께 해제합니다. source buffer의 수명에 기대거나 binary를 UTF-8 문자열로 잘못 변환하지 않습니다.

기존 `drawingSources`의 scalar 응답은 변경하지 않습니다. 새 decoder는 extra_bytes/소문자 hex 길이·문법·identity 순서/중복을 검사합니다. 로컬 통합 API는 `drawingObjectExtras(section)`이며 미제공 ABI는 명시적 오류입니다. Session/WASM/JS editor 연결은 아직 미커밋 통합 대상입니다. 이 코어/decoder 게시를 기본 데모의 새 API 제공으로 읽지 않습니다.

한컴 표69의46+2×설명 길이를 넘어서는 꼬리가 실제 HWP5-nopassword에 존재합니다. RHWP `parser/control/shape.rs`도 description 이후 남은 바이트를 raw_extra로 보존하며 의미를 해석하지 않습니다. 이를 근거로0을 패딩으로 단정하거나 geometry 제한을 해제하지 않습니다. 페이지 배치의 `UnsupportedHwp5DrawingObjectExtension`은 계속 유지합니다.

## 2026-10-10 검증

native2/2·exit0: 실제 첫 도형 header/control/component를 두 형제로 정규화한 파생 바이트의 꼬리를ff80으로 바꾸고, source buffer 변조 뒤 소유 문자열 불변·모든 할당 실패·부분 rows 정리를 검사했습니다. 파생본은 원본 문서가 아니며 전체 문서 지원으로 세지 않습니다. 같은 세 모듈만 기존 HEAD에 추가한 별도 Git tree에서도2/2와 ReleaseSafe 빌드가 통과했습니다.

로컬 후보 WASM SHA256 `0a72c99752e18c69369937cb34db091fba7215481c377ab90c459b89244cd79b`의 실파일·기존 scalar·wire를 별도 책임으로 분리한4파일4/4·skip0·exit0을 확인했습니다. 실제30도형 모두 extra_bytes2/hex0000을 독립 CFB.js/고정offset으로 대조했고, 조회·입력·undo/redo·오류 뒤 재조회·원본 불변을 확인했습니다. 꼬리 의미/렌더링·전체 body 필드·기본 WASM 승격 증거가 아닙니다.

```sh
zig test src/drawing_extra_source_test.zig -O ReleaseSafe --test-filter 'drawing opaque'
node --test tests/hwp5/drawing-object-extras-wire.test.mjs
```
