# HWP5 구역 개수 불일치의 원본 검증

## 2026-10-18 전수 reader 대조

RHWP 참조 폴더의 정규 `.hwp`/`.hwpx` 파일 975개를 서명으로 분류했다. HWP3 26개는 사용자 요청 범위 밖이며 성공/실패에 합산하지 않는다. 범위 내 949개 중 HWP5 509개와 HWPX 435개, 합계 944개의 텍스트 reader가 성공했다. 문단 합계는 690,523개다. 이는 모든 필드·편집 명령·페이지 조판의 지원 증명이 아니다.

거부 5개는 암호화 2개와 `SectionCountMismatch` 3개다. 암호화 파일은 이 비밀번호 없는 reader 실행에서 거부됐으며 별도 암호 해제 흐름의 실패로 판단하지 않는다. 기존 기본 WASM `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`과 차트 통합 후보 `891fe0a1cb560083251ac50130505dc2dabac57f6ebeaf37f90bc226e76a676a`의 전체 reader JSON 대조도 944개 동일 응답·5개 동일 거부·26개 범위 제외로 종료했다. 동일 거부를 지원 성공으로 세지 않는다.

## 원본과 버전별 실측

로컬 HWP5 문서 속성 계약에서 구역 개수는 DOCUMENT_PROPERTIES(tag16) payload 첫 UINT16이다. 독립 `olefile`/raw DEFLATE/레코드 framing 검사와 native CFB 조회의 모든 활성 스트림 payload·이름·크기를 대조했다. 아래 세 파일은 payload 길이도 모두 26바이트다.

| 참조 파일 | 버전 | DocInfo 선언 | 실제 BodyText |
|---|---|---:|---:|
| `issue5715/float_chart_ghost_ladder_gap.hwp` | 5.0.0.6 | 2 | Section0 하나 |
| `issue5802/hf_cross_section_inherit.hwp` | 5.0.2.4 | 11 | Section0·Section1 둘 |
| `issue5828/landscape_rowbreak_bleed.hwp` | 5.0.3.0 | 4 | Section0 하나 |

이 사례의 첫 필드를 버전별 다른 오프셋으로 읽어야 한다는 증거는 없다. 실제 저장된 구역 개수와 선언이 다르다. 메타데이터만 오래됐는지 본문이 빠졌는지는 이 실측으로 확정할 수 없다. 없는 구역의 내용을 만들어내거나 전체 복원으로 표시하지 않는다.

## 반례와 책임 경계

- 원본 strict CFB API의 관측 오류는 `InvalidFat`이다. permissive CFB 조회 결과를 strict-valid로 부르지 않으며, 독립 라이브러리와 모든 활성 스트림을 대조했다.
- 메모리에서 root 생성 시각을 0으로 하고 CFB writer로 관리 정보를 정규화한 복사본도 HWP5 reader는 `SectionCountMismatch`로 거부한다. CFB 단계만 고쳐서 구역 선언 불일치를 해결했다고 주장하지 않는다.
- 같은 메모리 모델에서 DocInfo 선언 UINT16만 실제 개수로 바꾸면 strict CFB 재검사 후 남아 있는 1/2/1구역을 읽는다. 문단은 각각 118/23/2,614개다. 비대상 스트림 inventory와 payload는 모두 유지한다. 제품의 자동 복구 기능을 추가한 것은 아니다.
- 잘못된 개수와 0은 여전히 거부한다. 1바이트 DOCUMENT_PROPERTIES는 native에서도 거부하며 독립 Python 일반/-O 실행도 거부한다. 원본 메모리·파일 SHA256은 유지한다.
- 회귀 선언은 3개이며 기존 기본 WASM·후보 각각 3/3, 실패·skip 0이다. 최초 실행은 테스트 해시 helper가 CFB API의 Array 출력을 처리하지 못해 실패했고 Buffer 변환 후 재검사했다. 해당 실패를 제품 파서 문제로 세지 않는다.

RHWP 참조 `e8800c8de`의 관련 소스는 변경 없음으로 확인했다. `src/parser/cfb_reader.rs:262`는 실제 연속 Section 스트림을 세며 `src/parser/mod.rs:459`는 그 수로 섹션을 읽는다. `doc_info.rs:185`가 읽은 선언 값과 일치하는지로 이 수를 정하지 않는다. 이는 이번에 확인한 소스 전략이며 해당 세 파일을 RHWP 실행기로 열었다는 증거는 아니다. 우리 기본 strict 경로를 같은 방식으로 조용히 완화하지 않는다.

독립 도구는 테스트용 기존 `olefile` 0.47(BSD)과 Python 표준 라이브러리를 사용한다. 제품 의존성은 추가하지 않는다. 실행 명령은 [개발·검증 명령](development-commands.md)의 구역 개수 원본 검사 항목이 소유한다.
