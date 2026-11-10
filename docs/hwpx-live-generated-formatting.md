# HWPX 편집 중 생성 문단의 서식 저장

새 HWPX 문서에서 Enter로 만든 본문 문단에 굵게를 적용하면 같은 세션에서는 `UnsupportedInlineControl`로 실패하고, 저장한 파일을 다시 열면 성공하던 오류를 수정합니다. 글자 위치·문단 번호·현재 텍스트는 정상이었고, 실패 지점은 최종 저장 검증의 styled run writer였습니다.

## 원인과 책임

분할된 문단은 현재 텍스트를 별도로 소유하면서 원래 첫 문단의 XML을 템플릿으로 재사용합니다. 이 템플릿의 run에는 텍스트 외에 `secPr`와 단 설정이 있습니다. 일반 텍스트/서식 검증은 이 구역 설정을 위치를 차지하지 않는 메타데이터로 허용했지만, `character_style_run_fragment.zig`는 field 소유권이 없는 일반 경로에서만 이를 거부했습니다. 따라서 서식 모델 작성 후 저장 검증에서 실패해 명령 전체가 rollback됐습니다.

`column_boundary_group_xml.writeStyled`는 먼저 템플릿을 이용한 중간 styled XML을 만든 뒤, 생성 문단에는 기존 `styled_continuation_xml` 정책으로 상속 구역 설정을 제거합니다. 중간 run 생성이 먼저 실패해 이 제거 단계에 도달하지 못했던 것입니다. 파일을 다시 열면 생성 문단의 원본 XML에는 이미 제거된 결과가 들어 있으므로 오류가 드러나지 않았습니다.

수정은 일반 styled fragment에서도 올바른 namespace의 `secPr`를 허용하도록 검사 한 곳을 맞춥니다. 원본 문단의 메타데이터 보존, 생성 문단의 제거, 다른 미지원 컨트롤과 잘못된 UTF-16 범위 거부는 기존 담당 모듈에 유지합니다. XML을 우회 저장·재열기 하거나 알 수 없는 컨트롤을 통째로 허용하지 않습니다.

## 검증과 범위

`src/hwpx/generated_formatting_regression_tests.zig`는 실제 메모리 문서와 직접/관리형 이력을 사용합니다. 굵게·기울임·크기·정렬, 같은/다른 템플릿, 선택 범위, 반복 분할·병합, 구역·단 설정의 원본 1회 보존과 생성 문단 부재, 미지원 컨트롤 거부를 확인합니다. 할당 실패는 이력 첫 명령과 직접 setter의 정해진 위치 표본을 검사했으며, 모든 할당 지점의 전수 검사는 아닙니다.

실제 새 WASM에서 Worker Runtime과 canonical 공개 SDK로 같은 세션의 새 본문에 네 서식을 적용합니다. 독립 ZIP/XML 비교는 본문 텍스트·대상 charPr/paraPr·구역 및 단 설정을 확인합니다. 원문은 그대로이고 대상만 굵게·기울임·19pt·CENTER가 됩니다. 저장 전 첫 서식 적용에는 외부 저장·재열기가 없습니다. undo/redo와 HWP5 입력·이력·Worker 계약 회귀도 별도로 확인합니다.

근거는 `zig-out/verification/hwpx-generated-formatting-r1/`의 `diagnosis/`, `native/regression-result.json`, `runtime/`, `hwp5-native-contract.log`, `browser/`에 나눕니다. 새 Native 검증 해시는 `72dadc5054047db9af10bf2eff69ea186804d4451644ba9cba7ad9abd3c87d74`입니다. `native-module-profiles.ts`는 ABI 이름 일치만으로 등록하지 않고 이 콘텐츠의 실제 입력·이력·Worker 계약 검증을 근거로 추가합니다. 전체 Native suite나 모든 HWPX 문서·서식·조판의 완료를 뜻하지 않습니다.
