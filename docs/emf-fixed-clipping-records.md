# EMF 고정 clipping records

## 명세와 범위

Microsoft [Clipping Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/0ca0d18e-324e-452f-9a41-26e1a82e3e03), [EMR_OFFSETCLIPRGN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/8bf2b60d-3b19-4bd1-b2d7-c89b027ad808), [EMR_EXCLUDECLIPRECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/a521411e-b877-4199-abb6-b4514b3574f8), [EMR_INTERSECTCLIPRECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/13cd0c98-d4e9-4ca7-a79d-58055bf45c79)을 기준으로 한다.

`clipping_records.zig`는 고정 payload인 네 레코드만 소유한다.

- `OFFSETCLIPRGN`: 16바이트 필수 prefix와 signed PointL offset
- `SETMETARGN`: 매개변수가 없는 8바이트 필수 prefix
- `EXCLUDECLIPRECT`: 24바이트 필수 prefix와 signed RectL
- `INTERSECTCLIPRECT`: 24바이트 필수 prefix와 signed RectL

공통 선언 Size와 실제 record slice 일치 및 필수 prefix 검사는 `record_extent.zig`, PointL·RectL wire 순서는 `geometry.zig`가 단일 출처다. 네 동작은 같은 좌표 배치라도 서로 바뀌지 않도록 별도 union tag로 보존한다. 명세에 좌표 정렬이나 정규화 MUST가 없으므로 음수·역방향 rectangle을 구조 계층에서 거부하지 않는다. EXCLUDE/INTERSECT의 lower/right edge 재생 의미와 실제 clipping-region 상태 계산은 후속 playback 계층의 책임이다.

`framing.zig`는 모든 record를 이 파서에 전달하고 인식한 고정 clipping record 수를 Summary에 보존한다. `SELECTCLIPPATH`와 RegionData를 사용하는 `EXTSELECTCLIPRGN`은 이 모듈이 수용하지 않으며 [별도 selection 파트](emf-clipping-selection.md)가 소유한다.

## 검증 기록과 한계

각 레코드의 signed 극값·wire 순서·operation tag, 모든 필수 prefix 절단, 선언/실제 크기 불일치, 후행 data 허용, 무관 타입 비수용과 네 레코드의 framing 연결을 직접 검사한다. 필수 길이 약화, SETMETARGN 누락, EXCLUDE/INTERSECT tag 교환, 공통 extent 검사 우회, SELECTCLIPPATH 오분류, framing 연결 제거의 7개 변이는 Debug·ReleaseSafe·ReleaseFast에서 모두 탐지되어 `21/21` 변이 실행이 실패했다.

정상 소스의 Debug·ReleaseSafe·ReleaseFast 전체 audit은 각 `40/40` 단계와 `1,364/1,364` 테스트를 통과했다.

이 파트는 wire 구조를 검증할 뿐 clipping 결과를 계산하거나 렌더링하지 않는다. 현재 실제 HWP corpus에는 EMF BinData가 없어 실제 한글 생성기의 clipping record 다양성을 검증했다는 뜻도 아니다.
