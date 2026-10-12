# HWPX 조건부 개체 주변 입력 조사

## 현재 재현

2026-10-12 SHA256 `7b41bb97ffbb2bf77e21a40dd3e88968383a641734c759c956f854408d12ced3`의 로컬 WASM으로 `reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx`를 검사했습니다. `node tools/hwpx-specialized-input-audit.mjs --wasm=zig-out/bin/hwpjs.wasm '--fixture=reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx'`는 1시도·0검증·`UnsupportedFieldLabelRange` 1건, 앵커 조회의 `UnsupportedParagraphControl`을 보고했습니다. 도구의 exit 0은 미지원 거부를 포함한 정상 보고 종료이며 편집 성공이 아닙니다.

원본 `Contents/section0.xml`은 run 직접 자식 `hp:switch` 안에 case/chart와 default/OLE를 두고 그 뒤에 빈 `hp:t`를 둡니다. 현재 `run_anchor.kind`는 run 직접 자식 개체와 일부 ctrl을 분류하지만 switch 자체나 그 안의 chart/OLE를 앵커로 분류하지 않습니다. `editor_session.siteOptions`는 selected 분기 정책을 사용하며 빈 capability 집합의 default 선택은 기존 공통 선택기가 담당합니다. 읽기 성공과 주변 편집 거부는 서로 다른 계층의 결과입니다.

## 구현·검증 경계

분기 선택 규칙의 단일 출처는 [조건부 참조 선택](hwpx-switch-selection.md)입니다. 구조 진단은 [switch 구조](hwpx-switch-shape.md)를 따릅니다. 편집 앵커 확장은 이 정책을 복제하거나 차트 지원 capability를 자동 선언하지 않아야 합니다. 선택 분기와 wrapper 소유권을 구분하고 비활성 분기를 포함한 원문 보존을 검사해야 합니다. 차트와 OLE를 같은 문단의 별도 표시 앵커 두 개로 중복 계산하지 않습니다.

이 문서는 현재 재현과 누락 경계만 기록합니다. 주변 입력·임의 치환/삭제·분할/병합·서식·저장 재열기/이력·Worker/Canvas 연결, 독립 전체 XML/ZIP 비교 및 namespace/중복 분기/잘못된 소유권/할당 실패 반례는 아직 이 기능의 완료 증거가 없습니다. 차트 데이터 편집·OOXML 렌더링은 주변 입력 지원과 별개이며 전체 픽스쳐 목표에서 생략하지 않습니다.
