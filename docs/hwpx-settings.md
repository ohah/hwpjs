# HWPX settings.xml 원값 검사

`Document.inspectSettings`는 OPF manifest의 정확한 `settings.xml` 항목을 선택해 해제하고, 공통 XML 문법·namespace 검사 뒤 2011 `app:HWPApplicationSetting`의 직접 `app:CaretPosition`과 `config:config-item-set`/`config:config-item` 값을 읽습니다. `inspectKnown`에도 포함됩니다. 선택 항목이 없으면 `present=false`, 빈 배열을 반환하며 기본값을 만들지 않습니다. 중복 항목, 잘못된 media-type, 외부 항목, 암호화 문서는 별도 오류입니다.

Caret의 `listIDRef`·`paraIDRef`·`pos`는 존재/부재를 구별하고 XML 정규화 원문을 소유합니다. 존재하면 unsigned 32-bit 어휘·범위를 검사하지만 실제 문단/목록과의 참조 연결이나 커서 위치 의미는 아직 확인하지 않습니다. 여러 Caret 요소도 순서대로 보존합니다. Config set의 이름, 항목 순서·이름·타입·정규화 본문을 보존합니다. 실파일에서 관측된 무namespace `name`·`type`과 ODF의 `config:name`·`config:type`을 구분해 읽으며 두 방식이 같은 요소에 겹치면 오류입니다. `boolean`과 `short`는 각각 값 어휘와 16-bit 범위를 검사합니다. 모르는 타입·이름은 손실 없이 보존하고 `unsupported_types`/`other_elements`로 남깁니다. 빈 이름/타입이나 누락은 별도로 보존하며 유효한 기본값으로 승격하지 않습니다.

2011 외 OWPML 버전 루트는 명시적 미지원 오류입니다. 전체 settings 스키마, `DocDistribute` 및 이후 namespace, 인쇄 설정의 동작 의미, 참조 무결성, 편집·저장은 미구현입니다. 알려진 두 값 종류의 성공과 settings 전체 지원을 혼동하지 않습니다. 파서는 XML 바이트·속성·값·개수 한도를 적용하고, 반환 보고서는 입력 ZIP 및 `Document`와 독립적으로 소유됩니다.

근거: [한컴 OWPML 모델의 HWPApplicationSetting](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/Etc/HWPApplicationSetting.h), [CaretPosition](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Class/Etc/CaretPosition.cpp), [ODF config schema](https://docs.oasis-open.org/office/OpenDocument/v1.3/OpenDocument-v1.3-part3-schema.html). 실제 HWPX에는 ODF 표기와 다른 무namespace 속성이 있어 두 입력을 별도로 다룹니다.

합성 ZIP 테스트는 존재/부재, 원문·CDATA·두 속성 namespace, 미지원 노드, 잘못된 루트/숫자, 한도, `inspectKnown` 연결, 전 할당 실패 지점을 확인합니다. 이 테스트만으로 실파일의 모든 settings 값 변형이나 전체 포맷 적합성이 입증되지는 않습니다.

2026-09-24 선택 실파일 대조: HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개에서 `settings.xml` 455개, Caret 455개, config set 104개, config item 816개였습니다. Caret `pos`의 값 합계 9,116, `short` 값 합계 20,842, 참인 `boolean` 0개, 미지원 타입 0개가 Zig `inspectKnown`의 8개 shard와 독립 Python ZIP/ElementTree 조사에서 일치했습니다. 이 corpus에는 참인 Boolean이나 미지원 config 타입의 실파일 검증이 없으며, 2011 외 버전과 전체 settings 스키마 적합성도 입증하지 않습니다.

최종 소스에서 `zig build test --summary all`의 Debug 2,212/2,212 테스트, `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig build -Doptimize=ReleaseSafe`, `zig fmt --check build.zig src`, `git diff --check`가 통과했습니다. settings 단위 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 통과했고, `inspectKnown` 실파일 8개 shard도 최종 소스로 다시 실행했습니다. 이 검증은 지원한 부분의 회귀 검사이며 전체 HWPX 문서 의미의 완성도 주장은 아닙니다.
