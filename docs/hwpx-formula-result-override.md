# 수식 결과 직접 수정 — 내부 저장 기반

현재는 미커밋 작업 트리의 내부 구역 XML writer만 구현했습니다. 공개 세션·WASM·Worker·Canvas 지원으로 해석하지 않습니다.

`formula_result_override_save`는 요청 구역/FORMULA 노드와 공통 field linker의 실제 begin/end 범위를 확인하고, 선택 정책에서 비활성인 필드를 거부합니다. 기존 `formula_result_sites`의 UTF-8/4096바이트/단일 문단·지원 구조 검사를 재사용하며, 일시적인 borrowed Sites로 공통 `text_sites_save`를 호출합니다. 반환 XML만 소유하고 입력 Tree/Sites를 변경하지 않습니다. Command·Formula·LastResult·dirty 속성을 수정하지 않습니다. 이 정책은 수동 본문 결과와 계산 파라미터를 분리하는 내부 직렬화 단계이며, 원본 한글이 직접 편집을 기록하는 모든 상태/속성의 재현은 아직 입증하지 않았습니다. 변경된 다중 텍스트 조각의 배치는 기존 result-sites 정책을 따르므로 사용자 선택 범위와 세부 서식 편집을 대신하지 않습니다.

최종 ReleaseSafe 집중 실행은 root import 선언을 포함5/5·exit0이며 실제 검증 선언4개입니다. 합성 원문의 결과 외 모든 바이트 보존과 전체 할당 실패, 구역/노드/UTF-8/XML 문자/길이·출력 예산 거부, 실제 chart13필드 각각의 정확한 대상 텍스트 바이트 교체 및 입력 보존, 비활성 run-switch 분기 거부를 검사했습니다. fmt check도 통과했습니다.

최초 분기 반례는 switch를 run 밖에 놓아 공통 선택기의 실제 지원 범위를 검사하지 못했고 예상 오류 대신 성공했습니다. 이때 expectError가 예상 밖 반환 버퍼를 정리하지 않아 테스트 누수도 발생했습니다. 반례를 run 안에 배치하고 예상 밖 성공 버퍼를 명시적으로 정리한 최종 재실행이 통과했습니다. 최초 실패를 제품의 비활성 분기 쓰기 성공이나 최종 통과로 혼동하지 않습니다.

다음 구현은 직접 수정값의 세션 소유/clone·실패 원자성, 저장과 표시 연결, 참조 숫자/정의 변경 시 override 해제·재계산, undo/redo 및 재열기 정책, 보호된 결과 범위의 공개 명령과 UI 연결입니다. 실제 독립 ZIP/XML oracle, 브라우저, 최종 전체 native/build gate는 별도로 필요합니다.

후속 `formula_result_override_values`는 필드 begin별 소유 문자열의 set/get/clear/deep clone을 구현합니다. FORMULA 소유 노드·UTF-8·XML 문자·공통 result-sites의 표시 한도를 확인한 뒤 할당 완료 전에는 기존 값을 해제하지 않습니다. 같은 값은 no-op이고 빈 문자열 override와 항목 부재는 별개입니다. 원본 LastResult/본문을 비교해 자동으로 override를 지우지 않으며 세션 거래가 해제 시점을 결정해야 합니다. 개별 저장소 set은 활성 분기/범위 편집 권한을 부여하지 않습니다. 실제 직렬화 writer의 별도 검사가 필요합니다.

최종 집중 ReleaseSafe7/7·exit0은 root import 선언1개와 실제 검증6개이며 앞선 writer4개 및 소유 저장소2개를 포함합니다. deep clone·교체/해제 전체 할당 실패, 실패 시 기존 값 보존, 자기 문자열 일부를 넘기는 alias 교체, 빈 값 및 잘못된 노드/인코딩/문자/길이 거부를 확인했습니다. fmt/diff check도 통과했습니다. 새 저장소와 공통 표시 한도 상수는 미커밋 runtime이며 세션·checkpoint·표시·재계산·UI에 아직 연결하지 않았습니다.
