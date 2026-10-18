# 전체 fixture 파서·편집기 완료 조건

사용자 목표는 HWP5/HWPX 문서의 파싱·편집과 RHWP형 Canvas 편집 UI입니다. HWP3는 요청으로 제외합니다. 아래는 완료 판정의 기준이며, 개별 통과의 상세 수치/재현은 링크한 주제 문서가 소유합니다. 부분 통과에 맞춰 목표를 축소하지 않습니다.

| 요구 | 현재 확인 근거 | 아직 완료를 입증하지 못한 부분 |
| --- | --- | --- |
| 전체 입력 목록 | [후보 추적 감사](unknown-candidate-fixture-verification.md), [참조 reader 대조](unknown-reader-parity-current.md) | 추적 파일과 참조 corpus 밖 모든 버전/입력에 대한 보장은 아님 |
| HWP5/HWPX 파싱 | 전체 reader JSON 회귀와 암호 제공/저장 구역 명시 경로 | 같은 응답은 같은 누락도 포함할 수 있어 모든 의미 필드 구현의 증거가 아님 |
| 실제 문서 편집 | 추적 HWP5 전 문단 prefix·숫자 의존 입력·이력·재열기, HWPX 전용 입력/Worker 감사 | prefix와 제한된 명령 통과는 임의 위치·모든 서식/개체/구역 명령 완료가 아님 |
| 복잡한 원문 보존 | [unknownObj](hwpx-unknown-object-anchors.md), [필드 결과](reference-field-results-current.md) | 미닫힘 필드 거부와 미해석 개체의 의미/편집/표시가 남음 |
| Worker/Canvas·실제 UI | [메뉴/개체 Chromium](hwpx-unknown-object-browser.md), [제목](hwpx-title-field-browser-roundtrip.md), [메모](hwpx-memo-browser-roundtrip.md) | 선택한 사례의 실측이며 모든 fixture/메뉴/개체 조작·OS IME·클립보드 전수는 아님 |
| RHWP형 UI·원본 조판 | 기존 메뉴/툴바/속성 패널과 Canvas 입력 | 리본/전체 명령 경험·원래 한글의 글꼴/줄/표/쪽 배치 동치를 전수 입증하지 못함 |
| 저장·재열기 | 주제별 독립 XML/CFB·비대상 payload·history 검사 | 모든 ZIP/CFB metadata·opaque 의미·복잡한 결합 편집의 전수 무손실 보장은 아님 |
| 최신 소스 gate·제품 반영 | [native 구간](native-prefix-coverage-current.md)과 각 집중 진단 | 구형 고정 바이너리/집중 결과를 최신 전체 gate로 합산하지 않음. 기본 WASM/실제 외부 응답의 승격은 별도 |

암호 없는 원본 읽기 거부를 암호 제공 경로의 미지원과 동일시하지 않습니다. 누락 구역의 명시적 사본은 존재하는 부분만 제공하며 missingContentRecovered=false입니다. 정책상 안전한 거부/사본을 원본 전체 편집 가능이나 사라진 내용 복원으로 계수하지 않습니다.

완료에는 위 요구별로 같은 현재 소스/산출물의 권위 있는 근거가 필요합니다. 실행 중·중단·같은 거부·대역 Canvas·정적 HTTP 성공은 해당 범위 이상의 완료 증거가 아닙니다. 현재 전체 목표는 미완료입니다. 남은 순서는 최신 후보의 추적 Worker/편집 감사 마무리, 실패 주입 진단과 최신 전체 gate, 제품 반영 검증, 남은 의미/서식/개체·조판 및 UI 전수 확장입니다.
