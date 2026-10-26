# HWPX 원본 색상 호환 정책

## 게시 소스와 공개 배포

2026-10-26 소스 기준은 Native foundation `50ad5257`, 표시 자원 캐시 `59bed088`, 표 채움 확장 `482685bb`입니다. 소스 게시와 공개 산출물 배포는 별개입니다. 이 기록 시점의 GitHub Pages 공개 manifest는 `5d2fa40e34d26c0fc4ba99b524dc6ebcaf8729b896a61e4da9b7d006fc09f9b1`이며, 아래 자동 색상 보정이 그 공개 번들에 반영됐다는 뜻이 아닙니다. [Native 검증 범위](native-published-source-audit.md)를 함께 확인합니다.

## 분류와 변환의 단일 출처

[Native profile](../src/hwpx/source_color_profile.zig)이 원본 version 메타데이터를 읽는 계층의 결과를 받아 분류·decode·encode를 소유합니다. 파일명·문서 SHA·JS ZIP 재파싱으로 판정하지 않습니다. 다음은 전체 버전 구간이 아닌 정확히 관측된 두 조합입니다.

공통 조건은 `major=5`, `minor=1`, `os=1`, `patch/revision` 부재, `targetApplication=WORDPROCESSOR`, `application=Hancom Office Hangul`입니다.

| 추가 원본 식별자 | 의미 |
| --- | --- |
| `micro=0`, `buildNumber=1`, `xmlVersion=1.2`, `appVersion=10, 0, 0, 5060 WIN32LEWindows_8` | `hangul-10.0.0.5060-xml1.2`: 확인한 필드의 COLORREF-hex 호환 |
| `micro=1`, `buildNumber=0`, `xmlVersion=1.5`, `appVersion=12, 0, 0, 4426 WIN32LEWindows_10` | `hangul-12.0.0.4426-xml1.5`: 기존 RGB |
| 불일치·부재 등 나머지 | `unknown`: 기존 RGB 읽기·명시적 쓰기 유지 |

이 식별은 제작자 인증이 아닙니다. 10→12 사이 전체 버전이나 다른 제작자에 규칙을 외삽하지 않습니다. unknown은 잘못된 원본 바인딩과 다르며, 그 이유만으로 쓰기를 금지하지 않습니다. 실제 잘못된 바인딩·미지원 필드·할당 실패의 기존 오류는 유지합니다.

현재 호환 필드는 `character_text_color`, `winBrush.faceColor`, `winBrush.hatchColor`, gradation 자식의 `color.value`입니다. 다른 색 필드·도형 선·표 테두리를 전역 swap하지 않습니다. 글자색의 명시적 편집 encode도 같은 Native 정책을 사용합니다. 공통 encoder가 있다고 해서 브러시·그라데이션의 새 편집/저장 명령까지 지원한다는 뜻은 아닙니다. 원문을 단순히 조회하거나 표시할 때 XML 원값을 재작성하지 않습니다.

## 표시 DTO와 웹 소비

[Native projection](../src/hwpx/source_color_projection.zig)이 정확한 node/field/RGB의 `semantic_fill_colors`를 한 번 만들고, 기존 `semantic_face_colors`는 그 배열의 face 호환 뷰로 파생합니다. raw report는 그대로 보존합니다. 글자색 조회는 기존 `{id,color}` 계약을 유지합니다. provenance는 독립 문서 조회이며 특정 개체 조회의 성공에 색 표시를 의존시키지 않습니다.

[JS 투영](../web/preview/table-semantic-fill-source.mjs)은 소유 node·부모·field·중복·범위 및 호환 뷰 일치를 검사한 뒤 선택된 brush plan 입력에 canonical RGB를 적용합니다. 그라데이션은 보간 **전** 원색을 교체하며 만들어진 stops를 뒤집지 않습니다. JS에 별도 producer 분류기나 codec을 복제하지 않습니다.

옛 Native에 semantic DTO가 없으면 기존 RGB 경로를 유지합니다. 명시적으로 잘못된 DTO나 사용 중인 색의 `null`은 임의 검정/투명으로 추정하지 않고 unavailable로 처리합니다. 비활성 hatch sentinel은 정상 solid face를 막지 않으며, 기존 미지원 radial·gradient/image 조합을 지원으로 바꾸지 않습니다. 원본 alpha/필드 부재와 원값 보존 조건은 색 의미 변환과 별개입니다.

## 검증과 남은 범위

[기본 profile 회귀](../src/hwpx/source_color_profile_tests.zig), [채움 확장 회귀](../src/hwpx/source_color_fill_extension_tests.zig), [웹 semantic 회귀](../tests/hwpx/table-semantic-fill-source.test.mjs), [face 방어 회귀](../tests/hwpx/table-semantic-face-fill.test.mjs), [provenance decoder 회귀](../tests/hwpx/document-provenance-decoder.test.mjs)가 영구 검증 진입점입니다. 실행 명령의 단일 출처는 [개발·검증 명령](development-commands.md)입니다.

확장 집중18/18과 별도 JS 원본4종·5회 흐름에서 legacy→RGB→legacy, single/batch, raw 값·alpha, 무편집 저장 바이트 불변을 대조했습니다. 고립 Canvas의7문서 흐름에서는 noori 단색 `#E7E7A5`, 실제 RGB 문서 유지, HWP 대조, pattern의 면 `#99CCFF`·hatch `#0099FF`, gradient 시작색 `#3F7FFF`와80 stops를 관측했습니다. 기대색은 원본 HWP/독립 XML·owner 자료에서 얻었으며 제품 codec로 기대를 생성하지 않았습니다.

이는 모든 색 필드·문서·플랫폼이나 한컴 raster 동치의 완료가 아닙니다. gradient owner의 비어 있는 셀은 구조/좌표 대응 근거이며 비어 있지 않은 소유 텍스트 대조로 세지 않습니다. 새 RN archive/기기 검증과 공개 번들 승격은 별도입니다. [전체 완료 조건](fixture-editor-completion.md)은 계속 미완료입니다.
