# HWPX 내장 SVG 구조 검사

## 범위와 책임

`src/image/svg/structure.zig`는 SVG를 **XML 문법·namespace·루트**까지만 검사합니다. 공통 `xml/document.zig`의 제한된 방문자를 사용하며 문서를 렌더링하거나 URL을 가져오지 않습니다. 루트는 [W3C SVG 문서 구조](https://www.w3.org/TR/SVG11/struct.html)에 따라 `http://www.w3.org/2000/svg` namespace의 `svg`여야 합니다. 접두사 표기와 UTF BOM은 공통 XML 계층에 맡기고, DTD/미해결 개체 참조는 거부합니다. `Options.svg.xml`의 입력·요소·깊이·이벤트·속성·참조 한도는 그대로 적용하되 namespace 검사는 끌 수 없습니다.

`src/hwpx/image_payloads.zig`가 ZIP 해제·대상 중복 제거·MIME 대조·한도·실패 진단을 소유합니다. 기존 이미지 시그니처 판별을 우선하고, 그 뒤 `<svg` 시작 모양(선택적 UTF-8 BOM·XML 공백 포함) 또는 정확한 `image/svg+xml` 선언 또는 `.svg` 경로를 SVG 검사 후보로 선택합니다. 후보의 XML/루트 오류는 `Target.format=svg`, `inspection=svg_xml_structure`, `inspection_error`로 남기며 정상 SVG로 세지 않습니다. 정확한 XML namespace 루트 판정은 이미지 코어 한 곳에서만 수행합니다. 후보 근거가 없는 다른 바이트는 여전히 `unknown`입니다. PNG 바이트가 `.svg` 경로에 있어도 PNG 시그니처가 우선하고 MIME 불일치는 별도 기록됩니다.

등록된 SVG 미디어 타입은 [W3C 등록](https://www.w3.org/TR/SVG11/mimereg.html)의 `image/svg+xml`입니다. 실파일 OPF의 `image/svg`는 자동으로 같은 값으로 정규화하지 않고 `media_matches=false`로 남깁니다. 구조 검사 성공은 SVG 스키마·도형 속성·스타일·필터·글꼴·외부 참조·스크립트·렌더링 안전성이나 화면 동일성의 증거가 아닙니다. XML 방문자는 스크립트를 실행하지 않지만, 검사된 바이트를 다른 SVG 렌더러에 전달할 때 별도 보안 정책이 필요합니다.

## 실파일·적대적 검증

로컬 `reference/rhwp/samples/issue3460/svg_picture_repro.hwpx`의 SHA-256은 `1d348927597b5519c65acf56206561247089720e7eac76711dca3541416a4f2e`입니다. `BinData/BIN0001.svg`(8,008바이트)와 `BinData/BINHDR.svg`(5,104바이트)는 모두 XML·SVG 루트 검사를 통과하지만 OPF는 `image/svg`로 선언합니다. 따라서 동일 문서의 그림 보고서는 SVG 대상 2개, SVG 내부 오류 0개, MIME 불일치 2개여야 합니다. 독립 Python ZIP/ElementTree 조사기의 8개 shard에서는 이 두 대상이 shard 5에만 있고, 기존 `unknown` 2개가 SVG 2개로 이동하며 그 shard의 MIME 불일치가 2→4개가 됩니다. 전체 corpus의 다른 이미지 형식·대상 수·인코딩 바이트 합계는 그대로여야 합니다.

합성 반례는 접두사 루트·잘못된 namespace·SVG 아닌 루트·DTD·미해결 개체·절단 XML·선언만 SVG인 임의 바이트·PNG 시그니처 우선·비표준 MIME·XML 요소 한도를 구분합니다. 형식 내부 오류는 다른 이미지 대상 검사를 막지 않되, 한도·할당 실패는 전체 검사 오류로 전파합니다. 위 한 개 추적 HWPX 테스트는 기본 root 테스트에 포함되지만, 8개 corpus shard 전체 대조는 기본 audit에 포함되지 않습니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

최종 소스에서는 SVG 코어·그림·브러시 선택 검사와 모든 할당 실패 경로, 독립 Python oracle 자체 반례, ReleaseFast corpus shard 0~7이 통과했습니다. 공유 이미지 코어의 SVG 분기를 브러시 보고서에서도 직접 확인했으며, corpus 브러시 SVG는 0건입니다. ReleaseSafe 전체 audit는 종료 코드 0, 제품 빌드는 5/5단계로 통과했습니다. 최종 Debug 전체 `zig build test --summary all`은 5/5단계·2,489/2,489 테스트를 통과했습니다.
