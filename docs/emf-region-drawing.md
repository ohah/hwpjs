# EMF RegionData drawing records

## 명세와 책임

Microsoft [EMR_FILLRGN](https://learn.microsoft.com/ja-jp/openspecs/windows_protocols/ms-emf/a1bb0f88-bb22-4956-b45a-7005546561cc), [EMR_FRAMERGN](https://winprotocoldoc.z19.web.core.windows.net/MS-EMF/%5BMS-EMF%5D-220429.pdf), [EMR_INVERTRGN](https://winprotocoldoc.z19.web.core.windows.net/MS-EMF/%5BMS-EMF%5D-220429.pdf), [EMR_PAINTRGN](https://winprotocoldoc.z19.web.core.windows.net/MS-EMF/%5BMS-EMF%5D-220429.pdf)과 [EMF record 공통 호환성 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)을 기준으로 한다.

`region_drawing.zig`는 같은 RegionData를 사용하는 네 레코드의 조립만 소유한다.

- `FILLRGN`: 32바이트 고정부, bounds, RgnDataSize, brush handle
- `FRAMERGN`: 40바이트 고정부, 위 필드와 signed width·height
- `INVERTRGN`: 28바이트 고정부, bounds와 RgnDataSize
- `PAINTRGN`: 28바이트 고정부, bounds와 RgnDataSize

모든 좌표와 stroke 크기는 signed 원값으로 보존한다. offset 24의 `RgnDataSize`로 checked semantic end를 계산하고 그 범위만 [공통 RegionData parser](emf-clipping-selection.md)에 전달한다. 선언 범위 뒤의 문서화되지 않은 record data는 공통 호환성 규칙에 따라 거부하지 않고 `trailing_data`로 분리한다. record의 bounds와 RegionDataHeader bounds는 용도가 다른 두 필드이므로 같다고 강제하거나 하나로 합치지 않는다.

`framing.zig`는 네 종류를 모두 구조 검증하고 `region_drawing_records`로 집계한다. `object_table.zig`는 FILLRGN과 FRAMERGN의 brush handle만 소비한다. 살아 있는 명시적 brush 또는 정의된 stock brush를 허용하며 0, 죽은 handle, pen/font/palette/color-space, stock 예약 gap을 거부한다. INVERTRGN과 PAINTRGN은 각각 색 반전과 현재 선택 brush를 사용하므로 별도 brush handle 검사가 없다.

## 검증 기록과 한계

네 operation tag, 고정 prefix의 모든 절단, 선언/실제 record extent, RgnDataSize overflow와 nested RegionData 오류, signed bounds·width·height, brush handle, 선언 범위와 후행 data 분리, 무관 record 비수용, framing 집계 및 Object Table 참조를 직접 검사한다. explicit·stock brush 성공과 0·dead·wrong-kind·stock gap 실패 후 통계 불변성도 확인한다.

FILLRGN 분류 제거, PAINTRGN/INVERTRGN 교환, FRAMERGN width/height 교환, RgnDataSize offset 변경, 후행 data 거부, nested 선언 범위 무시, 무관 EXTSELECTCLIPRGN 오분류, brush 검사 제거, stock brush 거부, explicit brush를 pen으로 검사, framing 연결 제거의 11개 변이는 Debug·ReleaseSafe·ReleaseFast에서 모두 탐지되어 `33/33` 실행이 실패했다.

정상 소스의 Debug·ReleaseSafe·ReleaseFast 전체 audit은 각 `40/40` 단계와 `1,374/1,374` 테스트를 통과했다.

RegionData rectangle 병합, bounds 최적화 사용, 실제 fill/frame/invert/paint 픽셀 재생은 구현 범위가 아니다. 실제 HWP corpus에는 EMF BinData가 없어 한글 생성기 표본 호환성 근거로 확대하지 않는다.
