# 프레젠테이션 유지 필드 규칙

`src/hwp5/edit/control_data_presentation_fields.zig`는 관측된 두 레이아웃의 항목 수와 숫자 ID별 wire type만 소유합니다. classic은 presentation 3항목·fill 15항목, expanded_gradient는 6항목·14항목입니다. 알 수 없는 레이아웃·ID와 다른 프로필의 전용 항목은 거부합니다. 숫자 ID에 추측한 의미 이름을 붙이지 않습니다.

이 모듈 자체는 문서를 파싱하거나 편집 제한을 해제하지 않습니다. 부모 관계·직접 자식 수·중복·값·소유 구역 검사는 호출 계층의 책임입니다. 전체 계약은 [HWP5 매개변수](hwp5-parameters-contracts.md)를 따릅니다. 필드 모듈을 커밋한 사실은 호출 계층이나 기본 데모 WASM이 게시되었다는 뜻이 아닙니다.

## 독립 검사

```sh
zig test src/hwp5/edit/control_data_presentation_fields.zig -O ReleaseSafe
```

2026-10-10 Zig 0.16.0에서 1/1 통과했습니다. 두 레이아웃의 개수·프로필 선택, 같은 ID의 프로필별 타입 차이, 잘못된 개수, 다른 프로필 전용 ID, 알 수 없는 ID를 검사합니다. 실제 파일 저장·Canvas·레이아웃 완성 검사는 별도입니다.

## 호출 계층 후보의 실파일 검사

같은 날짜 후보 WASM SHA256 `a9174618b495bfe29f0a91684a39e35e4e37d3298b5856e73ee72d05faa85f47`에 대해 `tests/hwp5/title-mark-editor.test.mjs`와 `tests/hwp5/cross-reference-source-gate.test.mjs`를 정확한 파일 목록으로 실행했습니다. 2/2 통과·skip0·exit0이며 제목 슬롯 52건의 독립 Section/CFB 보존·저장·이력을 확인했습니다. 별도 8건은 `UnsupportedSectionControl`로 거부되며 성공으로 세지 않습니다. root 메타데이터·배열 부모 변조와 기존 classic 유지의 native 검사도 3/3 통과했습니다. 기본 제품 WASM 교체나 모든 참조 결과 갱신 완료의 증거는 아닙니다.

동일 해시의 참조 읽기 감사는 전체 975경로 중 HWP3 26개를 제외한 HWP5/HWPX 949개를 검사했습니다. HWP5 509개·HWPX 435개가 텍스트 읽기·입력 불변 검사를 통과했습니다. 나머지 5개는 `EncryptedDocument` 1개·`UnsupportedEncryption` 1개·`SectionCountMismatch` 3개로 거부되었습니다. 이는 전체 필드 지원·문서 유효성 판정·편집/조판 완료 검사가 아닙니다. 실행기는 `tools/reference-parser-audit.mjs`, 결과는 `/tmp/hwpjs-presentation-root-guard-read-20261010.log`이며 임시 로그는 저장소 배포 산출물이 아닙니다.
