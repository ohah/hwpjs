# 프레젠테이션 유지 필드 규칙

`src/hwp5/edit/control_data_presentation_fields.zig`는 관측된 두 레이아웃의 항목 수와 숫자 ID별 wire type만 소유합니다. classic은 presentation 3항목·fill 15항목, expanded_gradient는 6항목·14항목입니다. 알 수 없는 레이아웃·ID와 다른 프로필의 전용 항목은 거부합니다. 숫자 ID에 추측한 의미 이름을 붙이지 않습니다.

이 모듈 자체는 문서를 파싱하거나 편집 제한을 해제하지 않습니다. 부모 관계·직접 자식 수·중복·값·소유 구역 검사는 호출 계층의 책임입니다. 전체 계약은 [HWP5 매개변수](hwp5-parameters-contracts.md)를 따릅니다. 필드 모듈을 커밋한 사실은 호출 계층이나 기본 데모 WASM이 게시되었다는 뜻이 아닙니다.

## 독립 검사

```sh
zig test src/hwp5/edit/control_data_presentation_fields.zig -O ReleaseSafe
```

2026-10-10 Zig 0.16.0에서 1/1 통과했습니다. 두 레이아웃의 개수·프로필 선택, 같은 ID의 프로필별 타입 차이, 잘못된 개수, 다른 프로필 전용 ID, 알 수 없는 ID를 검사합니다. 실제 파일 저장·Canvas·레이아웃 완성 검사는 별도입니다.
