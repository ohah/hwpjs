# 짝 픽스쳐의 배경색과 채널 순서 조사

2026-10-25 noori 두 형식이 같은 문서를 변환한 파일이라는 사용자 설명에 따라 배경색이 있는 다른 짝 픽스쳐를 재조사했습니다. XML 문자열과 바이너리 정수 표기가 같다는 사실만으로 같은 화면 색 또는 서로 다른 원본 문서라고 결론 내리지 않습니다.

## 원시 값과 실제 제품 화면

`tools/fixture-background-color-survey.mjs`는 독립 CFB.js/Node zlib·레코드 oracle과 Python 표준 ZIP/XML로 동일 basename을 조사합니다. 93파일·45쌍 중 암호 픽스쳐 `password-12345` 1쌍의 내용 추출은 실패했습니다. 미완전 추출을 종료 상태1로 유지합니다. 입력 93개 SHA256은 전후 동일합니다. 유채색 pattern background가 있는 5쌍의 26개 HWP 리소스 값은 대응 HWPX 리소스 목록 어디엔가 같은 정수 hex로 존재했습니다. 이는 리소스 inventory이며 같은 ID나 순번이 같은 셀임을 뜻하지 않습니다. noori의 HWP ID15/16은 HWPX ID16/17로 이동합니다. 추가로 독립 레코드 계층·셀 주소/병합 범위·표 전체 텍스트를 대조한 31개 표에서, 비어 있지 않은 텍스트로 대응을 검증한 유채색 셀 84개가 모두 이 raw hex 유지 패턴을 보였습니다. borderfill의 빈 셀 2개는 비어 있지 않은 텍스트 검증 수에서 제외하며 table-bug의 두 유채색 리소스는 직접 표 셀 참조가 없어 리소스 관측에만 포함합니다.

| 파일 | HWP 원시 COLORREF 예 | HWP에서 해석한 RGB | HWPX XML faceColor | 첫 화면 Canvas에서 확인 |
| --- | --- | --- | --- | --- |
| noori | 0x00A5E7E7 | #E7E7A5 노란색 | #A5E7E7 청록색 | 두 형식 모두 확인 |
| borderfill | 0x00FF7F3F | #3F7FFF 파란색 | #FF7F3F 주황색 | 두 형식 모두 확인 |
| chart | 0x0000FFFF | #FFFF00 노란색 | #00FFFF 청록색 | 두 형식 모두 확인 |
| sample-5017 | 0x00FFCC99 | #99CCFF | #FFCC99 | 첫 화면에 해당 배경 미관측 |
| table-bug | 0x00F7EBDD / 0x00CCF2FF | #DDEBF7 / #FFF2CC | #F7EBDD / #CCF2FF | 첫 화면에 해당 배경 미관측 |

`tools/fixture-background-color-browser-audit.mjs`는 실제 예제 열기·Canvas fillRect 호출·그리기 직후 픽셀·스크린샷을 기록합니다. 10개 파일을 열었지만 화면 바깥 배경이나 페이지 전체의 픽셀 동치를 검증한 결과가 아닙니다. #E8EDF2는 데모 작업 영역 색으로 문서의 배경색 비교에서 제외합니다. 모든 소유 브라우저는 종료합니다.

## 독립 기준과 남은 원인 경계

noori.html의 SVG에는 rgb(231,231,165)가 있고 noori-1page.jpg도 노란색입니다. 더 중요한 반례는 **noori.hwpx 내부 Preview/PrvImage.png 역시 노란색**이라는 점입니다. 따라서 이전 설명의 “두 원본 문서 자체가 서로 다른 색이다”라는 단정은 유지하지 않습니다. 미리보기는 캐시일 수 있으므로 그것만으로 현재 XML의 실제 한글 import 동작을 증명하지도 않습니다.

한컴 공식 Apache-2.0 공개 모델의 [CXMLAttConverter](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Base/Util.cpp)는 XML 색을 `SetRgb`로 읽고 `GetRgb`로 씁니다. [CColorRef](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Base/Type.h)는 RGB와 COLORREF 변환 시 R/B를 교환합니다. 해당 Type.h 원문을 별도 C++ 시험 프로그램에서 컴파일해 XML A5E7E7 → RGB(165,231,231), HWP COLORREF A5E7E7 → XML E7E7A5를 확인했습니다. 공식 공개 모델의 이 동작은 현재 형식별 표시 해석과 같습니다. 이 소형 시험은 한글 프로그램의 전체 HWPX import 경로 또는 특정 버전 호환 동작을 실행한 증거가 아닙니다.

현재 확정한 것은 **여러 변환 짝에서 반복되는 적·청 채널 순서 불일치와 noori의 미리보기/XML 불일치**입니다. 이 파일들을 만든 변환 경로의 색 직렬화 문제인지, 특정 한글 버전의 필드별 호환 처리인지까지는 확정하지 않았습니다. XML 색을 전역 BGR로 바꾸거나 원본 파일을 고치는 처리는 도입하지 않았습니다.

원시 결과는 `zig-out/verification/color-pair-survey/survey.json`과 `actual-cells.json`, 대응 검증은 `actual-cell-findings.md`, 조사 한계는 같은 폴더 findings.md, 실제 브라우저 최종 10개 열기와 종료 확인은 `zig-out/verification/color-pair-browser/2026-10-24T16-54-02-473Z/result.json`에 보존합니다. 공식 모델 원문과 C++ 실행 근거는 `zig-out/verification/noori-current/hancom-*`, `official-colorref-probe.cpp` 및 실행 파일입니다. 특정 공개 모델의 계약과 제품 한글 전체의 실동작을 구분합니다.
