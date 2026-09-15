# EMF EOF 팔레트

## 공식 형식과 책임 경계

Microsoft [EMR_EOF](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3f47fde0-0e6b-40c1-87f3-f4129af03aa1)는 `nPalEntries`, record 시작 기준 `offPalEntries`, 선택적 PaletteBuffer와 물리적으로 마지막인 `SizeLast`를 정의한다. `eof.zig`가 Type, 선언 `Size`와 실제 slice 일치, 20바이트 필수 범위, 마지막 DWORD의 `SizeLast == Size`를 소유한다. 선언 범위 검사는 `record_extent.zig`를 재사용한다.

`eof_palette.zig`는 외부에서 별도 EOF 값을 받지 않고 record를 `eof.zig`로 정확히 한 번 해석한 뒤 `{eof, palette}`를 함께 반환한다. 이 조립 경계 때문에 짧은 record, 다른 record에서 온 count/offset, 검증되지 않은 SizeLast가 palette slice 계산에 들어갈 수 없다.

entry 수가 0이면 `offPalEntries`는 무시하며 16바이트 prefix와 마지막 SizeLast 사이를 `undefined_before`로 보존한다. entry가 있으면 offset은 16 이상이고 SizeLast 시작 이전이어야 한다. `nPalEntries * 4`는 u64에서 계산하고 모든 [LogPaletteEntry](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c1f7b285-be16-4112-a4e6-0b2fd4c1d148)가 SizeLast보다 앞에 완전히 존재해야 한다. offset 앞뒤의 UndefinedSpace는 별도 borrowed slice로 보존하고 entry slice에 섞지 않는다.

`framing.zig`는 Header와 EOF의 palette count 일치, EOF가 유일한 마지막 record인지와 전체 record 수를 조립한다. `log_palette_entry.zig`는 Reserved/Blue/Green/Red wire 순서만 소유하며, Reserved는 명세상 무시 대상이므로 값을 보존한다. 색상 재생과 시스템 팔레트 적용은 현재 범위가 아니다.

## 검증

명시적 test root에서 EOF·palette·framing 관련 172개 테스트를 Debug·ReleaseSafe·ReleaseFast에서 통과했다. 모든 20바이트 prefix 절단, 선언/실제 Size 불일치, SizeLast 위치·값, 0개일 때 임의 offset, offset 양끝, 최대 count, 정확 entry slice, 앞뒤 UndefinedSpace, accessor 범위를 직접 검사한다. 합성 EMF에서는 Header count 연결과 EOF의 실제 종단 위치까지 확인한다.

임시 소스 복사본에 다음 10개 결함을 각각 주입했다. 세 최적화 모드의 30회 실행이 모두 결함을 검출했고 변형은 제품 트리에 남기지 않았다.

- 선언 `Size`와 실제 slice 불일치 허용
- 확장 EOF에서도 고정 offset의 DWORD를 SizeLast로 사용
- entry가 0일 때 무시 대상 offset을 검증
- 존재하는 palette를 빈 것으로 처리
- 15바이트 offset 허용
- entry가 마지막 SizeLast를 침범하도록 허용
- SizeLast를 뒤 UndefinedSpace에 포함
- 뒤 UndefinedSpace를 entry slice에 포함
- Header와 EOF의 palette count 비교 제거
- palette 조립기에서 `eof.parse`를 우회

실제 HWP corpus 584개에는 EMF가 0개이므로 실생성기 호환성 근거로 확대하지 않는다. 최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,357/1,357 테스트를 통과했다. 이 중 native test는 1,318개이고 HWP5 감사에서 8,905,827개 조건을 검사했다.
