# EMF 확장 펜

## 공식 형식과 책임 경계

Microsoft [EMR_EXTCREATEPEN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/d7f51e05-4024-497c-ad4a-8aeca9d34256)은 28바이트 record prefix, 가변 [LogPenEx](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/5b67b3ee-ea00-4f80-9b73-2959804381be), 선택적인 packed DIB로 구성된다. `extended_pen_creation.zig`가 record 종류, 선언 `Size`, handle, 네 DIB offset/size와 조립 순서를 소유한다. 선언 범위와 52바이트 최소 prefix 판정은 `record_extent.zig`를 재사용한다.

`log_pen_ex.zig`는 24바이트 고정부와 `NumStyleEntries * 4`의 정확한 의미 범위를 읽고 소비 끝을 반환한다. style entry 뒤 바이트를 배열로 흡수하지 않는다. pen type·line style·brush style 관계와 실제로 사용되는 ColorRef·ColorUsage·BrushHatch만 검사하고, 명세상 무시되는 필드는 원값으로 보존한다.

`dib_sections.zig`가 선택 DIB의 offset 산술과 slice를 단독 소유한다. LogPenEx 소비 끝이 record 범위 안인지 먼저 확인한다. 네 offset/size가 모두 0이면 DIB가 없는 상태다. 그 경우 LogPenEx 의미 끝 뒤의 문서화되지 않은 record extra data는 [EMF 일반 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)에 따라 무시한다. 일부 필드만 0인 상태는 불완전한 DIB로 거부한다. DIB가 있으면 LogPenEx와 겹치지 않는 UndefinedSpace, 연속된 BmiSrc/BitsSrc, BitsSrc 끝의 0~3바이트 정렬 padding을 분리하고 그 이후 extra data를 어느 의미 slice에도 섞지 않는다.

이 파서는 DIB 바이트의 내부 bitmap 의미를 검사하지 않는다. 비트맵 브러시가 추가로 수행하는 header·palette·pixel·1bpp 검증은 [EMF 비트맵 브러시](emf-bitmap-brush.md)의 별도 책임이다. 실제 펜 렌더링과 무시되는 extra data의 의미 추정도 현재 범위가 아니다.

## 검증

명시적 test root에서 관련 모듈과 framing의 168개 테스트를 Debug·ReleaseSafe·ReleaseFast에서 통과했다. 다음 경계를 직접 검사한다.

- DIB 없는 최소 LogPenEx 뒤 4바이트 extra data 허용
- 두 style entry의 정확한 8바이트와 그 뒤 4바이트 extra data 분리
- 떨어진 DIB 앞 UndefinedSpace와 BitsSrc 뒤 정렬 padding 분리
- DIB 정렬 뒤 4바이트 extra data가 bits·padding에 혼입되지 않음
- 합성 EMF에서 확장 record 다음 EOF 경계와 Object Table 등록 유지
- 모든 최소 prefix 절단, 선언/실제 Size 불일치, 잘린 style 배열 거부

임시 소스 복사본에 다음 9개 결함을 각각 주입했다. 세 최적화 모드의 27회 실행이 모두 결함을 검출했으며 변형은 제품 트리에 남기지 않았다.

- DIB가 없을 때 LogPenEx 뒤 extra data 거부
- 선언 `Size`와 실제 slice 불일치 허용
- style entry slice에 record 꼬리 혼입
- `NumStyleEntries`를 항상 0으로 처리
- 비연속 BmiSrc/BitsSrc 허용
- DIB 뒤 extra data를 padding에 혼입
- 일부만 존재하는 DIB offset/size 허용
- Object Table의 extended pen 등록 제거
- LogPenEx 소비 끝이 record 범위를 넘는 직접 호출 허용

실제 HWP corpus 584개에는 EMF가 0개이므로 실생성기 호환성 근거로 확대하지 않는다. 최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,353/1,353 테스트를 통과했다. 이 중 native test는 1,314개이고 HWP5 감사에서 8,905,827개 조건을 검사했다.
