# EMF poly record 후행 호환성

## 공통 record 경계

Microsoft [EMF Records](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)는 모든 record의 4바이트 정렬과 명세되지 않은 끝 extra data 무시를 규정한다. 개별 poly record의 Count는 의미 배열 길이를 정의한다. 따라서 parser는 Count-derived 의미 범위가 record 안에 완전히 존재하는지는 요구하지만 그 범위가 record 끝과 같아야 한다고 강제하지 않는다.

`record_extent.requiredEnd`가 다음 공통 계약을 단독 소유한다.

- 선언 `Size`와 실제 record slice 길이는 일치해야 한다.
- u64로 계산한 의미 끝이 `usize`와 실제 record 범위 안에 있어야 한다.
- 성공하면 의미 배열을 자를 `usize` 끝을 반환한다.

`poly_layout.zig`는 32/16비트 단일·다중 record의 point/count 배열을 반환된 의미 끝까지만 빌린다. `poly_draw.zig`는 point와 type 배열 뒤 4바이트 정렬까지를 의미 끝으로 삼고, `padding`에는 0~3바이트 alignment padding만 포함한다. 그 뒤 extra data는 point·type·padding 어디에도 포함하지 않는다.

Count를 늘리면 기존 후행 bytes가 새 point/type data로 재분류될 수 있다. 이 경우 새 Count-derived 범위가 record 안에 있으면 유효하고, 범위를 넘을 때만 잘림 오류다. 입력 길이에 맞춰 Count를 줄이거나 누락 배열을 합성하지 않는다.

## 검증

32/16비트 단일·다중 poly와 POLYDRAW/16, 공용 record extent, 전체 framing을 명시적으로 수집한 167개 테스트와 전체 native 1,313개 테스트를 통과했다. 필수 prefix 잘림, u32 최대 Count, 선언/실제 길이 불일치, 의미 배열 후행 오염, POLYDRAW alignment padding과 다음 record 경계를 검사한다.

임시 복사본에 선언 크기 검사 제거, 공용 exact-size 회귀, 단일·다중 point slice 오염, POLYDRAW padding 오염·exact-size 회귀, 다중 point extent 누락의 7개 변이를 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 21회 실행에서 모두 검출됐다.

최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,352/1,352 테스트를 통과했다. native test는 1,313개이고 HWP corpus 584개 파일에서 8,905,827개 조건을 검사했다. 실제 corpus에는 EMF가 없으므로 실제 한글 생성기 호환성 근거로 확대하지 않는다.
