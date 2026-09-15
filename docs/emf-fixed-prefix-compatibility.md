# EMF 고정 prefix 호환성

## 공식 규칙과 SSOT

Microsoft [EMF Records](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)는 모든 record를 4바이트 배수로 배치하고, 끝의 미사용 필드 잘림을 호환성을 위해 허용하며, 개별 레코드 명세에 없는 끝 extra data를 무시하도록 규정한다. 현재 이관한 고정 필드는 모두 사용되므로 필수 prefix 중 잘림은 허용하지 않고, 그 뒤의 미정의 data만 무시한다.

`record_extent.zig` 한 곳이 다음 경계를 소유한다.

- `record.size == record.bytes.len`으로 선언/실제 record 범위 일치
- `record.size >= required_size`로 필수 prefix 보장
- prefix 뒤 extra data는 필드 해석에 사용하지 않음

가변 배열 parser는 같은 파일의 `requiredEnd`를 사용해 u64 의미 끝을 검사하고 안전한 `usize` slice 끝을 받는다. 적용 범위와 배열 분리는 [poly record 후행 호환성](emf-poly-record-compatibility.md)이 소유한다.

4바이트 정렬과 stream 범위는 기존 `records.Iterator`가 먼저 검사한다. `PointL`, `SizeL`, `RectL`, `XForm`처럼 정확한 field slice를 받는 공용 객체 parser는 record 호환성 정책을 소유하지 않으므로 정확한 자신의 크기를 계속 요구한다.

## 이관 범위

이 파트에서 다음 11개 모듈의 고정 record를 공용 prefix 경계로 이관했다.

- `path_bracket.zig`: BEGIN/END/CLOSE/FLATTEN/WIDEN/ABORTPATH, 8바이트 prefix
- `transform_records.zig`: SETWORLDTRANSFORM 32, MODIFYWORLDTRANSFORM 36바이트 prefix
- `point_records.zig`: window/viewport/brush origin·extent와 MOVETOEX, 16바이트 prefix
- `mode_records.zig`, `color_records.zig`, `mapper_flags.zig`, `miter_limit.zig`, `text_alignment.zig`: 12바이트 prefix
- `text_justification.zig`: 16바이트 prefix
- `scale_extents.zig`: 24바이트 prefix
- `dc_stack.zig`: SAVEDC 8, RESTOREDC 12바이트 prefix

직전 파트의 `basic_point_drawing.zig`와 `basic_shapes.zig`도 같은 SSOT를 사용한다. palette와 handle 연계 record는 [EMF 핸들·팔레트 record 호환성](emf-handle-record-compatibility.md), color-space creation은 [전용 호환성 문서](emf-color-space-record-compatibility.md), poly 배열은 [poly record 후행 호환성](emf-poly-record-compatibility.md)에서 후속 이관했다. [글꼴 생성](emf-font-creation.md)은 record Size가 가변 객체 형식을 결정하므로 후행 허용 대상이 아님을 별도로 검증했다. offset/size section과 가변 객체를 포함한 bitmap brush·extended pen은 의미 payload 끝과 보존할 extra를 먼저 분리해야 하므로 이 파트의 완료 범위가 아니다.

## 검증

- 선택한 11개 모듈의 39개 테스트를 명시적 test root에서 수집해 통과했다.
- 각 parser는 필수 prefix 잘림, 선언/실제 길이 불일치, extra data 수용을 검사한다.
- framing 합성 EMF에서 path, point, miter, text justification, SAVEDC의 extra data가 다음 EOF 경계와 상태 검증을 깨뜨리지 않는지 확인한다.

## 적대적 검증

임시 복사본에 다음 6개 변이를 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 18회 실행에서 모두 검출됐고 임시 test root는 제거했다.

- 공용 경계가 필수 prefix 잘림을 허용
- 공용 경계가 선언 Size와 slice 길이 불일치를 허용
- 공용 경계가 extra data를 거부
- SETWORLDTRANSFORM을 다시 로컬 정확 32바이트 조건으로 변경
- path bracket을 다시 로컬 정확 8바이트 조건으로 변경
- RESTOREDC를 다시 로컬 정확 12바이트 조건으로 변경

최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,352/1,352 테스트를 통과했다. 이 중 native test는 1,313개이고, HWP corpus는 584개 파일에 대해 8,905,827개 조건을 검사했다. 실제 corpus에 EMF가 없으므로 실생성기 extra data 호환성 근거로 확대하지 않는다.
