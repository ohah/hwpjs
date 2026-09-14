# EMF 핸들·팔레트 record 호환성

## 명세와 공통 경계

Microsoft [EMF Records](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)의 일반 규칙에 따라 record 끝의 명세되지 않은 extra data는 무시한다. 이 파트의 record는 사용하지 않는 고정 필드가 없으므로 필수 prefix 잘림은 허용하지 않는다. 선언 `Size`와 실제 slice 일치 및 필수 prefix 판정은 `record_extent.zig`가 단독 소유한다.

공용 PointL·LogPen·LogBrushEx 같은 객체 parser는 호출자가 넘긴 정확한 field slice만 검사한다. record parser만 고정 필드 뒤 extra data를 허용하므로 객체 크기 계약과 record 호환성 정책을 중복하지 않는다.

## 적용 범위

- `palette_records.zig`: CREATEPALETTE 16바이트와 count-derived entry 배열, SELECTPALETTE 12바이트, SETPALETTEENTRIES 20바이트와 count-derived entry 배열, RESIZEPALETTE 16바이트, REALIZEPALETTE 8바이트를 필수 prefix로 검사한다.
- palette entry slice는 `base + count * 4`까지만 노출한다. record의 후행 data를 의미 entry로 오인하지 않는다.
- `basic_object_creation.zig`: CREATEPEN 28바이트와 CREATEBRUSHINDIRECT 24바이트를 필수 prefix로 검사한다.
- `object_table.zig`: SELECTOBJECT와 DELETEOBJECT의 12바이트 필수 prefix를 검사한다. payload 검증이 성공한 뒤에만 선택·삭제 상태를 변경한다.
- `color_space_records.zig`: SETCOLORSPACE와 DELETECOLORSPACE의 12바이트 필수 prefix를 검사한다.

offset/size section이나 자체 가변 payload 보존 정책이 필요한 color-space creation, poly, font, bitmap brush, extended pen은 이 문서의 완료 범위가 아니다.

## 검증

명시적 test root로 관련 모듈과 framing을 포함한 167개 테스트를 실행했고, 전체 native 1,313개 테스트도 통과했다. 필수 prefix의 모든 잘림, 선언/실제 길이 불일치, 후행 data 수용, palette 의미 배열의 정확한 끝, DELETEOBJECT의 실제 상태 전이를 검사한다.

임시 복사본에 공용 경계의 잘림·길이 불일치 허용 및 후행 data 거부, palette 가변 배열의 exact-size 회귀 및 의미 배열 오염, CREATEPEN·DELETEOBJECT의 exact-size 회귀 등 7개 결함을 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 21회 변이 실행에서 모두 검출됐다.

최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,352/1,352 테스트를 통과했다. native test는 1,313개이고 HWP corpus 584개 파일에서 8,905,827개 조건을 검사했다. 실제 corpus에는 EMF가 없으므로 실생성기 호환성 근거로 확대하지 않는다.
