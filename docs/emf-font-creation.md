# EMF 글꼴 생성 객체

## 범위와 명세

`font_creation.zig`는 Microsoft [EMR_EXTCREATEFONTINDIRECTW](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/7e266b6d-32e5-4201-b687-8ec40c24cd73)의 record 경계와 handle을 소유한다. 고정 12바이트 뒤 `elw`가 정확히 320바이트이면 [LogFontPanose](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c68ffff8-1c32-4398-ac81-2cb6f0cd7a7c), 더 크면 [LogFontExDv](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/595fcaae-bc37-4148-9afe-859e81ca7f76)로만 해석한다. 따라서 전체 record는 332바이트 또는 DesignVector 축 개수에 따라 368..432바이트이며, 그 사이 333..367바이트를 관대하게 채우거나 자르지 않는다.

`log_font.zig`는 [LogFont](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1cd7cb7a-1a7c-48d2-b4a4-c218f9d12100)의 정확한 92바이트를 읽는다. signed 크기·각도, 0..1000 weight, 세 BOOLEAN, CharacterSet·OutPrecision·ClipPrecision·Quality·PitchAndFamily의 공식 값 영역을 구분한다. `font_values.zig`가 이 값 영역의 SSOT다. 글꼴 선택이나 장치별 대체는 재생 계층의 책임이다.

`font_string.zig`는 FaceName·FullName·Style·Script의 고정 UTF-16LE 필드를 공유한다. 첫 NUL 전까지만 문자열로 검증하고 전체 고정 storage는 빌려 보존한다. 필드를 모두 채우면 NUL이 없어도 허용하며, 첫 NUL 뒤 padding은 MUST-ignore이므로 잘못된 surrogate처럼 보여도 해석하지 않는다. 첫 NUL 전의 잘못된 UTF-16은 `InvalidEmfFontStringEncoding`으로 통일한다.

`extended_font.zig`는 Panose의 FullName/Style, Version/StyleSize/Match, 반드시 0인 Reserved/Culture, VendorId, PANOSE와 무시 padding을 소유한다. `panose.zig`는 [Panose Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/4f1d2462-2133-4247-ae1b-2192cd91adb6)의 10개 연속 enum 상한을 각 필드에 적용하고 전부 0이면 ignored로 표시한다. `LogFontExDv` 분기는 348바이트 LogFontEx 뒤 [DesignVector](https://learn.microsoft.com/en-au/openspecs/windows_protocols/ms-emf/cdf6681f-bf45-4eec-923e-08c8be16aaf2)의 signature `0x08007664`, 축 0..16, `8 + count * 4` 정확한 길이와 signed 값을 보존한다.

## SSOT와 통합 경계

| 책임 | 유일한 소유자 |
|---|---|
| sparse/packed 글꼴 값 영역 | `font_values.zig` |
| 고정 UTF-16LE 문자열·NUL 경계 | `font_string.zig` |
| 92바이트 LogFont | `log_font.zig` |
| 10바이트 PANOSE | `panose.zig` |
| 가변 축 벡터 | `design_vector.zig` |
| 320바이트 Panose·가변 ExDv 조립 | `extended_font.zig` |
| record 크기·handle·두 형식 선택 | `font_creation.zig` |
| handle 수명과 font object 종류 | `object_table.zig` |

제품 모듈에는 fixture 초기화 함수를 공개하지 않는다. Object Table은 전체 글꼴 payload가 성공한 뒤에만 slot을 생성하거나 교체하므로 잘못된 BOOLEAN·CharacterSet 등은 기존 상태와 집계를 바꾸지 않는다. `framing.validate`가 전체 EMF stream 순회에 이 검사를 연결한다. 반환 문자열·원시 배열은 입력을 빌리며 별도 할당하지 않는다.

## 검증과 미지원 범위

- 정확한 고정 크기와 333..367바이트의 전 gap, 0..16 모든 DesignVector 축 개수, signed 축 극값과 index 경계를 검사한다.
- weight·BOOLEAN·sparse enum·bit mask·PANOSE 열 필드를 독립적으로 깨고 각 전용 오류를 확인한다. 고정 문자열은 정상 surrogate pair, NUL 뒤 무시 데이터, NUL 없는 잘못된 끝 surrogate를 구분한다.
- 합성 전체 EMF에 글꼴 생성 record를 넣어 framing과 object 집계 연결을 확인하고, 잘못된 payload가 빈 slot이나 기존 font를 점유·교체하지 않는지 검사한다.
- 실제 HWP corpus 584개에는 EMF가 0개이므로 한글 생성기의 실제 `EMR_EXTCREATEFONTINDIRECTW` 바이트 호환성을 입증하지 않는다. 현재 근거는 공식 명세와 합성 record다.

적대적 검증은 (1) weight 상한 제거, (2) BOOLEAN의 2 허용, (3) 320바이트 이상을 모두 Panose로 선택, (4) DesignVector의 count-derived 길이 검사를 제거, (5) Object Table의 글꼴 parser 연결 제거의 다섯 변이를 임시 복사본에 각각 주입했다. Debug·ReleaseSafe·ReleaseFast의 15회 실행이 모두 전용 값 경계·형식 분기·가변 배열 extent·통합 테스트로 변이를 탐지했다. 변이는 제품 작업 트리에 적용하지 않았다.

최종 원복 상태의 Debug·ReleaseSafe·ReleaseFast audit는 각 40/40 단계와 전체 1,319/1,319 테스트(네이티브 1,280개), HWP 검사 8,905,827건을 통과했다. 구현 중 첫 단위 실행은 NUL 직전의 고립 high surrogate를 공통 UTF-16 오류로 반환해 EMF 문자열 계약과 달랐으므로 `InvalidEmfFontStringEncoding`으로 안정화했다. 제품 모듈에 공개되어 있던 fixture 초기화 helper도 제거하고 테스트 내부로 한정했다.

글꼴 파일 로딩, FaceName과 설치 글꼴의 CharacterSet 일치, font mapper, DesignVector의 실제 축 의미, 텍스트 shaping·재생·편집은 이 구조 parser의 완료 범위가 아니다. 원문 필드를 보존하지만 EMF writer나 무손실 재저장을 제공한다는 뜻도 아니다.
