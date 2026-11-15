# HWP5 가시 끝 입력의 서식 상속

이 문서는 390a 정상 엔진에서 확인한 원본 셀·본문·GSO 글상자의 입력 결함과 후속 소스 계약을 구분한다. 수정 엔진의 Native 실행 및 GUI 검증은 별도 승인·증거가 필요하다.

기존 엔진에서 밑줄·취소선을 지정해 ABC를 세 번 입력하고 undo3/redo3 후 일반 D를 입력하면, ABC는 shape5이고 D와 문단 종결 CR은 shape1이었다. 저장 후 새 세션에서도 같은 run 맵을 관측했다. undo/redo가 복원한 ABC의 run 맵은 정상이며, cold reopen 뒤 ordinal/current-reference 입력에서도 같은 결함이 재현됐다. UI pending 의도가 없어도 발생한다.

원인은 일반 입력이 `character_runs.replace`의 `styleAt(start)`를 사용하는 데 있다. H5의 실제 종결 CR 직전에는 가시 텍스트와 다른 CR 전용 run이 있을 수 있다. 화면 caret 관측은 앞의 가시 scalar를 읽지만 Native 일반 삽입은 CR의 run을 읽었다.

## 변경 계약

다음 조건을 모두 만족할 때만 삽입 문자에 직전 가시 scalar의 **전체 기존 character resource ID**를 사용한다.

- 시작과 끝이 같고 삽입 UTF16 길이가 0보다 크다.
- 현재 소유 문단의 실제 마지막 PARA_BREAK 토큰 바로 앞이다.
- 종결 토큰 직전이 비어 있지 않은 가시 텍스트 토큰이다.

종결 CR은 자체 resource ID를 유지한다. 내부 run 경계, 선택 교체, 삭제, 빈 입력, 명시 paint ID, 제어 토큰 뒤의 위치와 implicit-empty는 기존 의미를 유지한다. 입력 권한·range/control 보호·resource 검증·History 소유권은 바꾸지 않는다. pending 의도는 undo/redo를 넘어 보관하지 않으며 UI가 Native 결함을 감추는 삽입 patch를 만들지 않는다.

`visibleTextEnd`는 기존 H5 토큰 parser로 마지막 종결 토큰을 판정한다. 제어 payload 안의 값13을 문단 종결로 해석하지 않는다. live gap은 생성 시 기존 plain 검증을 통과하고 추가 제어 문자를 거부하므로, 자신의 실제 종결 unit만 공통 상속 helper에 전달한다. 일반·batch 경로는 실제 소유 bytes를 판정한다. batch는 기존 단일 run cursor를 유지하며, 유일한 EOF 삽입에서만 앞선 resource를 추가 조회하므로 전체 처리는 O(text + runs + edits)다.

## 현재 entry 영향

| 소유자 / 입력 경로                       | 현재 동작 및 수정 영향                                                                          | 증거 등급                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| H5 원본 셀 ordinal/current-reference     | 기존 390a에서 EOF CR style 상속 결함. 일반 draft와 live history 경로에 공통 규칙 적용           | 기존 WASM Node·저장·cold reopen 재현                                   |
| H5 본문 ordinal                          | 기존 390a에서 같은 결함. `plain_text` / journal 경로에 적용                                     | 기존 WASM Node 재현                                                    |
| H5 GSO 글상자 source/current-reference   | 기존 390a 실제 textbox 원본에서 같은 결함. 셀과 동일한 paragraph splice에 적용                  | 기존 WASM Node 재현; 수정 probe 준비                                   |
| H5 독립 batch / rich batch의 기본 splice | EOF 순수 삽입만 앞선 전체 ID 사용. rich patch는 이어서 명시한 항목만 기존 거래 안에서 적용      | 소스 계약; 수정 Native 미실행                                          |
| H5 생성 본문                             | 기존 paragraph draft를 통과하는 입력에 같은 규칙 적용                                           | 소스 경로 확인; 실제 실행 미완료                                       |
| H5 implicit-empty 원본 셀                | source text 부재를 기존 editable view가 CR로 제공. 앞선 가시 문자가 없으므로 기본 resource 유지 | 기존390a 빈 셀 관측; 수정 probe 준비                                   |
| H5 pending 생성 셀                       | 기존 별도 whole-cell text 모델. 이번 수정 적용 대상 아님; canonical run 모델은 별도 보존 패킷   | 남은 제품 기능                                                         |
| H5 제어 끝·payload                       | 실제 토큰을 검사하며 앞선 토큰이 제어이면 기존 상속 유지. payload 내부 CR을 EOF로 사용하지 않음 | focused probe 준비                                                     |
| H5 명시 style ID / 선택 교체 / 내부 경계 | generic `replace`의 기존 오른쪽 상속·선택 첫 resource·명시 ID와 우측 복원 그대로                | focused probe 준비                                                     |
| HX plain/anchored 및 글상자·셀           | XML text-site/style owner를 사용하며 H5의 저장 CR run을 사용하지 않음. 제품 코드 변경 없음      | 같은390a 원본 셀 Node undo3/redo3/D 정상; 다른 소유자는 소스 경로 확인 |

Main이 별도 수집한 HX GUI의 busy 중간 샘플은 최종 실패로 분류하지 않는다. 최종 settle ABCD와 실제 저장 XML의 charPr5/BOTTOM/SOLID 확인은 Main 소유 증거이며 이 패킷의 실행 수에 합산하지 않는다.

## 검증 범위와 남은 작업

원본 HWP5 셀과 본문에서 문단 끝의 일반 입력, 실행 취소·다시 실행, 저장·재열기를 검사했다. 초기 snapshot 검사에서 `drawing`으로 고른 대상은 글상자 캡션이었다. 후속 검사는 `drawingListSources`의 본문 종류와 현재 물리 리스트를 연결해 **실제 글상자 본문**을 선택한다. 캡션의 자동 번호 제어에 대한 텍스트 창 거부는 유지하고 저장 바이트가 바뀌지 않는지 별도로 검사한다.

`test-caret-eof`는 snapshot 경로의 종결·제어 payload·빈 문단·명시 ID·선택 교체·내부 경계·implicit-empty·할당 실패 회귀를 검사한다. `test-caret-eof-managed`는 원본 셀과 실제 글상자 본문의 관리형 이력을 검사한다. 새 입력이 live backing을 사용하고, 저장 전 materialization을 추가하지 않으며, 저장·재열기와 undo/redo 바이트 및 물리 소유자 바인딩을 유지하는지 확인한다.

일반 웹 SDK의 실제 Canvas에서도 원본 셀에 밑줄·취소선을 적용한 ABC를 입력하고 undo 세 번·redo 세 번 뒤 D를 입력했다. 저장 파일을 별도 CFB 리더와 레코드 해석기로 읽어 ABCD 전체가 같은 서식을 쓰는 것을 확인했다. 실제 파일을 다시 열고 문단 끝으로 이동했을 때도 두 서식 표시가 유지됐다. 통제된 Surface 검사는 이 실제 브라우저·저장 파일 검사와 구분한다.

대기 중인 생성 셀의 풍부한 서식 모델, 모든 개체 내부 입력 및 완전한 재조판은 이 변경의 완료 범위가 아니다. 생성 셀 모델은 별도 소유 계약으로 확장한다.
