# HWPX 원본 색상 호환 정책

## 최신 공개 배포 상태 — HTTPS·대표 브라우저 경로 검증 완료

2026-10-26 공개 자산 커밋 `0efc30f2`의 [배포 workflow 40264419074](https://github.com/ohah/hwpjs/actions/runs/40264419074)는 build/deploy 성공으로 완료됐습니다. [실제 Pages manifest](https://ohah.github.io/hwpjs/editor/manifest.json)의 SHA256은 `268b5f21334ab4f5da8ce79d734e1318db895ddca1a3af2a53b271a8e03f885f`이며, manifest를 포함한 28개 자산의 HTTPS 200·바이트 수·SHA 일치를 확인했습니다. 배포된 WASM SHA256은 `3fc519b22c4c3f69d7e64c5337247163fcf0b7f8175e80c124325b922effccf0`입니다.

배포 후 실제 HTTPS `/playground`에서 noori의 trusted 키 입력 20회와 개별 Native revision 20회·색상, 찾아 바꾸기 후 입력 및 Ctrl/Meta undo·redo의 캐럿·포커스, headless API invoke의 ready 상태를 확인했고 소유 브라우저를 종료했습니다. 동일 G2의 로컬 Canvas/API E2E와 Rspress build/link/license/public 검사는 별도 근거로 구분합니다. 이 대표 경로 검증을 전체 문서·모든 편집 명령·한/글 조판 동치의 완료로 확대하지 않습니다. 아래 `5d2fa4…`는 최초 소스 게시 당시 공개 상태를 남긴 역사 기록입니다.

이번 G2에 V2 history 후보는 포함하지 않으며 기본 16개 이력 보관 제한은 계속됩니다. HEAD 소스의 typed color 존재가 G2의 r5 추가 UI/코어 overlay 포함이나 새 npm 출시를 뜻하지 않습니다. 새 패키지의 npm 출시는 아직 하지 않았습니다.

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

<!-- paragraph-background-asymmetric-raw-d849:begin -->
## d849 문단 배경의 비대칭 원시 저장 검사

고정 d849와 공식 core dist에서 Noori HWP/HWPX의 명시 배경 교체 저장 4개를 수집했습니다. 생성 실행은 저장 뒤 null-prototype 관측과 일반 객체의 비교에서 종료 1이므로 전체 typed 적용·undo/redo·재열기 통과로 세지 않습니다. 후속 독립 검사는 같은 저장 SHA를 읽으며 생성 실패를 소급해 성공으로 바꾸지 않습니다. 원본 대상은 세 번째 source 문단으로, HWP는 ParaShape8→BorderFill1, HWPX는 paraPr8→borderFill2였습니다. 두 원본의 면 색 원값은 `0xFFFFFFFF`/`#FFFFFFFF`, 보조색 원값은 `0xFF000000`/`#FF000000`이고, 이는 Noori의 별도 유채색 표 머리글 대응 검증이 아닙니다. 저장 대상은 각각 ParaShape45→BorderFill19, paraPr45→borderFill0으로 연결됐으며 형식 간 ID 동치를 가정하지 않았습니다.

비대칭 단색 요청 RGB `#123456`·보조색 `#ABCDEF`에 대해 HWP 원시 COLORREF 바이트 `12 34 56 00`·`AB CD EF 00`, HWPX의 고정 Noori legacy tuple에서 XML `#563412`·`#efcdab`를 확인했습니다. HWPX 선형의 두 색은 `#563412` 다음 `#cdab98`이며 원본 version.xml은 두 저장물 모두 바이트 일치했습니다. 기대값은 제품 decoder가 아닌 고정 literal이고 여섯 자리 hex의 대소문자만 정규화합니다. 현대 form-002의 정확 version tuple은 표준 RGB로 별도 고정했으며 첫 문단 paraPr21→borderFill2의 면 색은 none입니다. 이 원문 추출을 현대 문서 Native 쓰기 성공이나 전체 버전 규칙으로 확대하지 않습니다.

HWP 선형은 payload offset57/61에서 `12 34 56 00`·`98 AB CD 00`의 순서를 관측했습니다. 다만 [공식 revision1.3 표23·28](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf)의 폭을 합하면 색 배열 후보 위치는 `32+4+6×2=48`이고, 실제 여섯 값도 요청값과 일치하지 않습니다. 실제 바이트를 `1+5×4` 폭으로 읽으면 요청값과 맞지만 이는 명세에서 도출한 독립 근거가 아니므로 선형 schema 통과로 세지 않습니다. BorderFill 앞32바이트의 원본 보존은 확인했고, 색 뒤 추가 속성·tail의 소유 해석과 전체 보존은 미완료입니다. 공식 표와 실제 저장의 불일치만 기록하며 어느 쪽이 올바르다고 단정하지 않습니다. 전체 비대상 CFB/XML 보존·undo 저장 원본 바이트 일치·실제 UI/Canvas·운영 배포도 이 검사로 완료하지 않습니다. 상세 원문·실패·핀은 `zig-out/verification/paragraph-background-raw-color-oracle-r1/REPORT.ko.md`와 `FINAL-PARTIAL-RECEIPT.json`에 보존합니다.
<!-- paragraph-background-asymmetric-raw-d849:end -->
