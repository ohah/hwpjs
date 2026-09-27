# EMF color-space 생성 record 호환성

## 명세와 책임

Microsoft [EMF Records](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)는 명세되지 않은 record 끝 extra data를 무시하도록 규정한다. [EMR_CREATECOLORSPACE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/954af0ff-a8d7-4d34-80ed-89f570bac016)는 handle 뒤 LogColorSpace 객체를, [EMR_CREATECOLORSPACEW](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/d1cd2147-7fb6-4d97-8f7e-a289006b6064)는 LogColorSpaceW·flags·`cbData`·profile data를 둔다.

`record_extent.zig`는 선언 `Size`와 실제 slice 일치 및 필수 prefix를 검사한다. `color_space_creation.zig`는 아래 record 조립만 소유한다.

- ANSI형은 340바이트 필수 prefix를 요구하고 LogColorSpace parser에는 정확한 328바이트 field slice만 전달한다.
- Wide형은 608바이트 고정 prefix와 checked `cbData` 끝, 그 끝을 4바이트로 올림한 0~3바이트 alignment padding을 요구한다.
- Wide형의 `data`와 `padding` view는 각각 선언된 의미 범위만 빌린다. 그 뒤 extra data는 둘 중 어느 view에도 포함하지 않는다.
- 두 형식 모두 필수 의미 범위 뒤의 명세되지 않은 data를 무시한다.

Wide형의 `dwFlags`는 원값으로 보존한다. 공식 C bit는 Data에 color profile data가 있음을 나타내지만 이 wire 계층은 flag와 내장 profile의 ICC 의미 관계를 검증하지 않는다.

`log_color_space.zig`는 정확한 객체 크기·내부 Size·문자 저장소를 계속 검사한다. 객체 field 계약에 record 후행 호환성 정책을 섞지 않는다. Object Table은 생성 payload 전체가 성공한 뒤에만 handle을 점유한다. 내장 profile의 ICC 의미와 색상 재생은 이 파트의 범위가 아니다.

## 검증

관련 color-space creation·Object Table·framing을 명시적으로 수집한 167개 테스트와 전체 native 1,313개 테스트를 통과했다. ANSI/W의 모든 필수 prefix 잘림, 선언/실제 record 길이 불일치, 내부 객체 크기, `cbData` overflow·범위, padding 분리, 후행 data 무시와 다음 record 경계를 검사한다. Wide형의 동일한 후행 바이트가 `cbData` 증가 시 profile data로 재분류되는 경우도 확인한다.

임시 복사본에 ANSI exact-size 회귀, ANSI 객체 slice 오염, Wide exact-extent 회귀, padding에 extra 포함, ANSI/W 선언 크기 검사 제거, `dwFlags`를 `cbData`로 오독하는 7개 변이를 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 21회 실행에서 모두 검출됐다.

최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,352/1,352 테스트를 통과했다. native test는 1,313개이고 HWP corpus 584개 파일에서 8,905,827개 조건을 검사했다. 실제 corpus에는 EMF가 없으므로 실생성기 호환성 근거로 확대하지 않는다.

2026-09-27 재검증에서는 `src/`의 임시 import 진입점으로 `color_space_creation.zig`를 수집해 Debug·ReleaseSafe·ReleaseFast 각각 15/15개(진입점과 의존 모듈 포함)를 통과했다. 이 진입점은 검증 뒤 제거했다. 루트 `EMF framing` 필터도 세 모드 각각 97/97개, 전체 Debug `zig build test`는 5/5 단계·2,656/2,656개가 통과했다. 위 7종 변이와 세 모드 전체 `audit`은 이번에 재실행하지 않았다.
