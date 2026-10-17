# 표 번호 참조 문서의 글자 서식 보존

로컬 표 번호 상호참조가 있는 구역에서 **텍스트 위치를 유지하는 글자 서식**을 변경합니다. 번호 선언·개체 ID·필드 명령·표시 문자열은 그대로 유지하며, 원래 없던 대상 ID를 추정하거나 저장된 표시값을 현재 계산값으로 승인하지 않습니다. [표 번호 원본 대상](hwp5-table-number-targets.md)의 조회와 달리 이 경로는 대상을 해석하지 않는 보존 허가입니다. 대상이 없는 기존 참조도 원본 그대로 남습니다.

## 계약과 책임

`cross_reference_format_retention.tableNumber`는 기존 command semantics를 사용해 로컬/표/번호 요청만 선택합니다. 외부 문서·페이지·대상 텍스트·상대 위치·그림 번호는 이 허가 대상이 아닙니다. 미지원 옵션이나 잘못된 target 종류도 기존 오류를 유지합니다.

`source_policy.validateCharacterFormat`과 `validateUnselectedCharacterFormat`은 선택 구역/그대로 보존할 다른 구역을 구분합니다. 기존 `field_source_bindings`의 원본 필드 토폴로지 검사를 재사용하며 표 번호만 결과 평가를 생략합니다. 책갈피 이름은 기존 대상 검증을 유지합니다. 다른 구역의 수식·미지 컨트롤 제한도 유지합니다. `plain_text_source`의 character_format 목적과 Session의 두 글자 서식 명령만 이 정책을 사용합니다.

선택 구역의 필드 입력·구조 변경·상호참조 결과 계산에는 허가를 전달하지 않습니다. 일반 splice의 수정하지 않는 다른 구역 보존은 [별도 입력 계약](hwp5-unselected-table-number-text.md)을 따릅니다. 글자 속성은 새 리소스와 run 참조로 기록하지만 텍스트를 바꾸지 않습니다. 저장의 stale-layout 동의는 계속 필요하며, 페이지 배치와 원본 한글의 조판 동치는 주장하지 않습니다. 필드 표시의 글자 모양을 바꾸는 것과 표시 문자열을 직접 수정하는 것은 다릅니다. 기존 불완전한 번호 참조를 복구하거나 편집 후 번호를 새로 계산하는 기능은 아직 남아 있습니다.

## Canvas 연결과 남은 허가 문제

아래는 최초 서식 허가 당시 기록입니다. 현재 다른 구역의 로컬 표 번호 참조 때문에 문서 전체를 텍스트 읽기 전용으로 만들지는 않으며, 갱신한 Canvas 검증과 입력 계약은 [비대상 표 번호 보존](hwp5-unselected-table-number-text.md)을 따릅니다.

`table-number-format-canvas.test.mjs`는 실제 Worker/WASM과 Canvas controller/renderer를 연결한 DOM 대역 검사입니다. 분리한 main 소스/같은 후보에서1/1·skip0으로 `hwpspec.hwp`의 선택에 글자 서식을 적용하고 독립 전체 CFB/레코드 oracle·undo/redo를 통과했습니다. 이 테스트 자체는 실제 Chromium/OS IME 검사가 아니며, 후속 Chromium 다운로드/재업로드 실측은 [원본 입력 적격성](hwp5-text-source-eligibility.md)의 검증 절이 소유합니다.

이 연결 검사에서 reader의 문단 로컬 `editable=true`가 다른 구역의 미지원 참조를 반영하지 않는 UI 허가 불일치를 재현했습니다. 후속 [원본 입력 적격성](hwp5-text-source-eligibility.md) 변경은 새 ABI에서 해당 입력을 UI부터 거부하고 서식 선택을 유지합니다. 구형 ABI의 미확인 동작과 새 후보의 검증 범위는 해당 문서가 소유합니다. 서식 전용 허가와 일반 입력 허가를 다시 합치지 않습니다.

## Native와 공개 API 결과

최종 확대 공개 회귀는7/7·skip0입니다. 위 새2문서와 기존 보정본 배포2검사, 다른 구역의 숫자 참조 보호1검사, 서식 disclosure2검사를 같은 후보로 실행했습니다. 다른 종류의 미지원 상호참조까지 일괄 허용하지 않았습니다. 전체 native 실행은 이전 소스의 별도 검사로, 이번 변경 전체가 포함된 전수 통과로 보고하지 않습니다.

분리한 main 기준 ReleaseSafe/Debug 집중검사 각각5/5, ReleaseSafe WASM 빌드와 공개 JS 회귀4/4가 skip 없이 통과했습니다. 후보 SHA256은 `5104a41b9ed5340b303b9a3a4d8d822cbdb1543c7e83f1f8fcf5e99ac9ec4275`입니다. 두 실제 문서의 공개 거래에서 독립 CFB/레코드 oracle로 DocInfo 전체·전체 구역·비대상 스트림을 기대 변경과 대조했고, 반대 굵게 값을 기대한 반례는 실패했습니다. 저장 재열기·undo/redo·입력 거부 후 redo 보존과 기존 normalized distribution2회귀도 포함합니다. 개체 ID/번호 선언/참조 결과는 동일하지만 재직렬화 오프셋은 바뀔 수 있습니다. 오프셋을 영속 ID로 취급하지 않으며 정확한 이동은 전체 구역 byte oracle이 검사합니다. 기본 제품 WASM이나 데모를 이 후보로 교체하지 않았습니다.

실제 HWP5 배포용 `hwpspec.hwp`와 `hwp-3.0-HWPML.hwp`에서 첫 일반 텍스트 구간의 굵게 값을 반전하고 실제 변경을 확인했습니다. 명시적 보정본/배포용 열기로 시작해 저장·재열기를 수행하고, 전체 구역의 문단 헤더/글자 run/line segment 외 모든 원본 레코드를 대조했습니다. 따라서 이 native 검사만으로 세 제외 태그나 DocInfo 전체의 정확성을 주장하지 않습니다. 파일명 HWP3처럼 보이는 후자도 HWP5이며 HWP3 지원을 추가하지 않습니다.

축소한 실제 참조 문단은 전체 부분 할당 실패를 검사합니다. 이 파생 입력의 대상은 존재하지 않지만 서식 검사는 성공하고 일반 텍스트 거래는 계속 거부합니다. 같은 길이로 command의 번호 요청을 페이지 요청으로 바꾼 반례는 서식도 거부합니다. 외부/페이지/텍스트/상대 위치/그림/책갈피와 잘못된 옵션의 허가 판정도 검사합니다. 분리한 main Debug 집중검사5/5와 작업 트리 ReleaseSafe7/7은 skip 없이 통과했습니다.

명령: `zig test src/root.zig -O ReleaseSafe --test-filter 'table number character format' --test-filter 'table number format retention'`와 Debug. 공개 API·독립 전체 저장 검사는 `HWPJS_TEST_WASM=/absolute/candidate/bin/hwpjs.wasm node --test tests/hwp5/table-number-character-format.test.mjs`입니다. reference 없는 실제 원본 검사는 명시적으로 skip합니다. 이 native/API 범위가 Canvas 서식 버튼·전체 픽스쳐 편집·번호 재계산의 완료를 뜻하지 않습니다.
