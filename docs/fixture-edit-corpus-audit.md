# 픽스쳐 편집·저장 전수 감사

대상은 HWP5/HWPX입니다. HWP3와 사용자가 제외한 `hwpers_test4_complex_table.hwp`는 별도로 집계합니다. 같은 파일 해시는 한 번만 실행하고 경로별 결과에 실행 원본을 남깁니다. 알려진 암호12345는 정확한 두 픽스쳐 해시에서만 사용합니다. 관측 CFB/DocInfo 보정은 감사 실행에서 명시적으로 동의한 정책이며 기본 파서 성공과 구분합니다.

파일당 최대8개 후보 중 하나의 공개 typed 텍스트 삽입, 저장, undo/redo, 재열기·재저장과 독립 CFB 레코드 또는 ZIP/XML 대조를 수행합니다. 틀린 기대값을 거부하는 음성 대조도 포함합니다. HWPX는 Python 일반/최적화 모드를 모두 검사합니다. 모든 편집 위치·서식 명령·Canvas 입력·원본 한글 조판 동치를 증명하는 검사는 아닙니다.

## 검사기에서 발견한 누락

- 앵커만 있는 문단도 마지막 앵커 뒤에 collapsed 입력을 시도할 수 있습니다. 후보에서 제거하지 않고 편집 코어가 가능 여부를 판정합니다. 거부 시 저장·이력·문서 관측값이 그대로인지 검사합니다. 앵커 자체를 지우거나 임의의 본문 소유권을 합성하지 않습니다.
- HWPX 구역/단 설정을 가진 텍스트 run은 `preserve_section_metadata: true`로만 독립 검사에 허용합니다. 직접 `secPr`와 단일 `ctrl/colPr`만 폭0으로 취급하고 전체 XML 트리를 보존 대조합니다. 그림·필드·임의 ctrl 허용으로 확대하지 않습니다.
- `paragraph_order: selected_default`의 `index`는 대상 section part 안에서 선택된 문단 순서의0기반 인덱스입니다. 문서 전역 ID와 다릅니다.

후보 선별은 `tools/headless-fixture-edit-targets.mjs`, 독립 편집 대조는 `tools/hwpx-plain-splice-oracle.py`가 각각 소유합니다. 집중 회귀10개가 통과했습니다. 실제 `charshape.hwpx`, `charstyle.hwp`, `hwpSummaryInformation.hwp`, `shapeline.hwp`, `shapepict-scaled.hwp`의 공개 typed API 편집·저장·이력·재열기와 독립 원문 검사도 통과했습니다. 근거는 `zig-out/verification/headless-edit-target-corrections`입니다.

## 아직 완료되지 않은 범위

초기100경로 감사는53검증·37독립 검사기 미지원·6후보 없음·3오류·1제한시간 초과로 종료했습니다. 이후 위 검사기 누락 일부를 수정했으므로 이 수치를 현재 지원률로 해석하지 않습니다. 전체 inventory는1068경로이며 전수 실행 완료 수치와 구분합니다. 감사 실행기는 현재 작업 트리의 데모 로더·빌드 산출물을 사용하므로 게시된 SDK만의 검증과도 구분합니다.

대형 `2025 행정업무운영 편람(최종).hwp`에서 삽입 후 다른 한 문단의 화면 텍스트가4UTF-16단위 짧아졌습니다. 그 행은 삽입 전후 모두 `clipped: true`, 문서는 `limited: true`였습니다. 독립 CFB 대조는 대상 삽입 외 모든 Section 원문 보존을 확인했습니다. 따라서 이 관측만으로 저장 손실이라고 결론 내리지 않습니다. 화면용 전역 텍스트 예산과 완전 원문 검사를 분리하는 후속 작업이 남았습니다. 같은 이름의13.6MB HWPX는60초 제한에 걸려 별도 성능 조사가 필요합니다. 배포용 HWP 두 파일은 현재 공개 SDK 기본 로드에서 `UnsupportedDistribution`으로 거부되며 명시적 배포용 문서 정책 연결도 남아 있습니다.
