# HWPX OPF 이미지 후보 전수 검사

[BMP 후보는 공통 RGBA 픽셀 검사](hwpx-bmp-pixels.md)를 기본으로 수행합니다. 구조 성공과 픽셀 성공, 누적 RGBA 바이트와 실패 진단은 별도 계약을 따릅니다.

## 범위와 소유권

`Document.inspectManifestImagePayloads()`는 OPF `manifest/item` 중 `media-type`이 대소문자와 무관하게 `image/`로 시작하거나 `href`가 PNG/JPEG/BMP/GIF/WMF/TIFF/PCX/SVG 확장자로 끝나는 후보를 **참조 여부와 무관하게** 선택합니다. 선언과 경로 중 하나만 후보여도 선택하며, 대소문자 차이가 있는 확장자도 같습니다. `isEmbeded="0"`인 외부 항목은 사이트 수에는 포함하지만 네트워크·파일 접근을 하지 않고 `non_embedded_sites`로 셉니다. 그 밖의 항목은 manifest 바인딩의 ZIP 엔트리를 검사합니다.

선택과 후보 사이트 생성은 `src/hwpx/manifest_image_payloads.zig`, ZIP 해제·시그니처 우선순위·형식 내부 검사·MIME 진단·한도는 기존 `src/hwpx/image_payloads.zig`가 소유합니다. `max_targets`는 내장 대상만 제한하며 읽지 않는 외부 후보를 차감하지 않습니다. `Target.item_index`는 OPF 순서이며 각 내장 후보는 한 번씩 검사합니다. 그림·브러시 보고서와 중복되는 항목도 **별도 보고서에서 다시 검사**하므로 네 보고서 사이에 하나의 전역 해제량 예산을 제공한다는 뜻이 아닙니다. `inspectKnown()`은 보호 분류와 전체 ZIP CRC 검사 뒤 이 보고서를 포함합니다. standalone 메서드는 암호화 정책을 별도로 검사하지 않습니다.

공통 MIME 대조는 [RFC 6838의 타입·서브타입 대소문자 비구분 규칙](https://www.rfc-editor.org/rfc/rfc6838.html#section-4.2)에 따라 ASCII 대소문자를 구분하지 않습니다. `image/svg`와 `image/svg+xml`의 서브타입 차이는 그대로 불일치입니다. 매개변수(`; charset=...`)가 붙은 선언의 처리는 이 파트에서 확장하지 않아 정확한 등록형과 비교하면 불일치로 남습니다.

후보가 아닌 `application/octet-stream`의 `.bin`에도 이미지 바이트가 있을 수 있고, OPF 밖 ZIP 엔트리에도 있을 수 있습니다. 이들은 이 보고서의 형식 검사 범위 밖입니다. 구조 검사에 실패한 후보는 대상별 `inspection_error`, 시그니처가 미지원이면 `unknown`으로 남습니다. 성공 반환을 전체 BinData 의미, 이미지 렌더링, HWPX 전체 문서 적합성으로 해석하지 않습니다.

## 독립 검증

`python3 tools/hwpx-fill-brush-image-oracle.py --manifest-images`는 Python ZIP/ElementTree로 OPF 후보를 독립 선택하고 바이트 시그니처·선언 MIME·길이를 조사합니다. 로컬 두 corpus의 HWPX 484개에서 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 후보 2,253건 중 2,249건이 내장, 4건이 외부였습니다. 내장 346건은 선택된 header·section·마스터페이지의 그림·브러시 노드에서 참조되지 않았습니다. 이는 **다른 용도의 참조도 없다**는 뜻은 아닙니다. 내장 형식은 PNG 693, JPEG 820, BMP 684, GIF 20, WMF 23, TIFF 6, PCX 1, SVG 2, unknown 0건입니다. 선언 MIME 불일치는 219건이고, 인코딩 바이트 합계는 1,550,152,879바이트입니다. SVG 두 건은 XML 루트 검사를 통과했습니다. 이 숫자는 개별 이미지 형식의 **전체** 적합성 판정이 아니라 후보/시그니처/MIME/길이 대조값입니다.

합성 테스트는 그림·브러시 참조가 없는 유효 SVG와 루트 오류 SVG, 확장자만 이미지인 항목, 이미지 MIME만 있는 항목, 비이미지 제외, 외부 미접근, 한도·모든 할당 실패 지점을 구분합니다. `inspectKnown()`에서도 참조가 없는 잘못된 SVG가 대상 진단으로 남는지 확인합니다. 최종 소스의 ReleaseFast Zig 선택 실파일 shard 0~7은 모두 독립 Python 후보·형식·MIME·바이트·그림/브러시 미참조 집계와 일치했습니다. 선택 shard는 기본 audit에 포함되지 않습니다.

최종 소스의 Debug 전체 `zig build test --summary all`은 종료 코드 0·5/5단계·2,496/2,496 테스트로 통과했습니다. 출력에 `failed command` 러너 문구가 섞였지만 프로세스 종료 코드와 최종 빌드 요약은 성공입니다. ReleaseSafe 제품 빌드는 5/5단계, 전체 `zig build audit -Doptimize=ReleaseSafe --summary all`도 종료 코드 0으로 통과했습니다. 이 감사에 실파일 HWPX 선택 shard는 포함되지 않으므로 위 별도 8개 대조와 구분합니다.

## 적대적 검토에서 확인한 경계

- 외부 후보를 `max_targets`의 내장 대상 수로 잘못 차감하던 초기 코드를 제거했습니다. `max_targets=0`에서도 외부만 있는 manifest는 검사 없이 보고합니다.
- 공통 이미지 MIME 대조의 대소문자 구분을 표준에 맞춰 수정하고, `IMAGE/SVG+XML` 선언·`.bin` 경로의 SVG도 후보와 일치 판정이 이어지는지 검사했습니다. 관측 비표준 `IMAGE/SVG`와 XML 선언이 있는 `.bin` 경로도 **검사 후보**로 삼되 MIME은 불일치로 남깁니다. 매개변수는 별도로 해석하지 않습니다.
- 같은 ZIP 엔트리에 OPF 항목 두 개가 연결되어도 항목별 선언 MIME 진단을 합치지 않습니다. 내장 항목을 읽은 뒤 `inspectKnown()`의 후반 XML 한도가 실패할 때도 보고서 할당을 회수합니다.
- 독립 Python 조사는 OPF와 선택된 XML의 그림·브러시 노드를 직접 훑어 346건의 사이트 미참조 이미지 후보를 확인했습니다. 이 수치는 다른 참조의 부재를 뜻하지 않으며 Zig 선택 shard에서 후보·미참조 개수의 집계를 대조합니다. 개별 문서의 전체 참조 그래프 동치까지 주장하지 않습니다.
