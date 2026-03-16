# 5 다른 기술표준과의 관계

이 표준과 관련되거나 포함되는 기술표준들과의 관계를 설명한다.

## 5.1 XML과의 관계

이 표준은 XML을 기반으로 한다. 이는 XML의 일반성과 단순성 때문이며 XML 문서는 앞으로 등장할 새로운 기술들에 잘 적응할 것으로 기대되기 때문이다. 또한 XML 기반 문서의 논리적 구조를 설명하는 문법 정의를 위한 정형화된 규칙을 제공하며, 이는 기술구현자들의 업무 시간과 비용을 절감시키고 시스템간 호환성을 높이는 역할을 한다. 또한, XML은 확장이 가능하다. 즉, XML은 특정 문서 유형이나 특정 유형의 요소 집합과 독립적으로 확장될 수 있어 문서의 일부분을 보다 직접적으로 추가할 수 있도록 한다. 문서는 마크업을 활성화하여 자동 포맷팅 등의 컴퓨터 처리작업을 통해 수정할 수 있다.

- XML 1.1에 정의된 대로 리딩 시스템은 반드시 XML 프로세서이어야 한다. 모든 OWPML 콘텐츠문서들은 반드시 해당 스키마에 따라 유효한 XML 문서이어야 한다.

## 5.2 XML 네임스페이스와의 관계

리딩 시스템은 반드시 http://www.w3.org/TR/xml-names11/ 의 XML 네임스페이스 권고사항에 따라 XML 네임스페이스를 처리해야 한다.

네임스페이스 접두어는 각기 다른 XML 어휘에서 따온 동일한 명칭을 구분해야 한다. XML문서의 XML 네임스페이스 선언은 고유한 네임스페이스 접두어를 고유한 URI와 연계시킨다. 이 접두어는 문서의 요소 이름이나 속성 이름에 사용될 수 있다. 반면, XML 문서내의 네임스페이스 선언은 URI를 기본 네임스페이스로 식별하여 네임스페이스 접두어를 가지지 못한 요소들에 적용된다. XML 네임스페이스 접두어는 콜론을 사용해 접미어 요소나 속성과 구별할 수 있다. OWPML 문서는 아래와 같은 형식으로 네임스페이스를 선언하여 활용하며, 본 표준의 개정 수준에 따라 네임스페이스는 변경하여 문서의 버전을 확인하는 데 활용될 수 있다.

### OWPML 네임스페이스 목록

```
xmlns:hh="http://www.owpml.org/owpml/2024/head"
xmlns:hb="http://www.owpml.org/owpml/2024/body"
xmlns:hp="http://www.owpml.org/owpml/2024/paragraph"
xmlns:hc="http://www.owpml.org/owpml/2024/core"
xmlns:hv="http://www.owpml.org/owpml/2024/version"
xmlns:hm="http://www.owpml.org/owpml/2024/master-page"
xmlns:hs="http://www.owpml.org/owpml/2024/history"
```

| 접두어 | 네임스페이스 URI | 용도 |
|--------|-----------------|------|
| `hh` | `http://www.owpml.org/owpml/2024/head` | Header 스키마 |
| `hb` | `http://www.owpml.org/owpml/2024/body` | Body 스키마 |
| `hp` | `http://www.owpml.org/owpml/2024/paragraph` | Paragraph 스키마 |
| `hc` | `http://www.owpml.org/owpml/2024/core` | Core 스키마 |
| `hv` | `http://www.owpml.org/owpml/2024/version` | Version 스키마 |
| `hm` | `http://www.owpml.org/owpml/2024/master-page` | MasterPage 스키마 |
| `hs` | `http://www.owpml.org/owpml/2024/history` | History 스키마 |

모든 OWPML 문서의 최상위 요소는 반드시 문서의 네임스페이스를 명확하게 명시해야 한다. OWPML 네임스페이스가 문서에서 사용되는 경우, 반드시 `http://www.owpml.org/owpml/2024/head` 또는 `http://www.owpml.org/owpml/2024/body` 등으로 명확히 선언되어야 한다. 네임스페이스 접두어가 사용된 경우, 저자들에게 `hh` 또는 `hb` 접두어를 사용하여 이 네임스페이스로 바인딩하고, `hh`, `hb`를 다른 네임스페이스의 접두어로 사용하지 말 것을 권고한다.

**보기:**

```xml
<head xmlns="http://www.owpml.org/owpml/2024/head">
```

이 표준은 우선 문서유형과 XML 섬 외에도 추가적인 기능과 검증요건을 가지고 있으므로, 이 표준과 연계되고 특정 맥락에서 사용되는 다른 네임스페이스들도 존재할 수 있다.

## 5.3 유니코드와의 관계

HWP 문서들은 유니코드에 정의된 것과 같이 UTF-8 인코딩을 사용하여 전체 유니코드 문자 집합을 사용할 수 있다 (http://www.unicode.org/unicode/standard/versions 참조). 유니코드의 사용으로 국제화, 그리고 여러 가지 언어로 문서를 작성하는 일이 쉬워진다. 하지만, 리딩 시스템은 모든 유니코드 문자에 대해 그림 문자(glyph)를 제공하지 않을 수 있다.

리딩 시스템은 반드시 UTF-8 문자들을 제대로 파싱(parse)해야 한다. 리딩 시스템은 일부 문자의 표시를 거부할 수 있지만, 표시할 수 없는 문자가 있다는 사실을 반드시 표시해야 한다. 리딩 시스템은 유니코드 문자를 단순히 8비트 문자인 것 같이 표시해서는 안 된다. 예를 들어, 생물학적 위험(biohazard) 표시 ☣(0x2623)에 정확한 그림문자를 추가할 필요는 없지만, 구성요소인 바이트가 "&#"(0x0026 0x0023)인 것처럼 해석되거나 표시되지 말아야 한다.

리딩 시스템의 지속적 검색 및 분류작업을 지원하기 위해서, 유니코드 정규화 양식 C(Unicode Normalization Form C, NFC)를 반드시 사용해야 한다. (http://www.w3.org/TR/charmod-norm/ 참조).

## 5.4 MIME 미디어 유형

이 표준은 모든 리딩 시스템이 반드시 지원하고 HWP 문서들이 포함할 수 있는 OWPML 핵심 미디어 유형의 목록을 정의한다. 핵심 미디어 유형 이외의 형식을 추가하는 경우에는 IANA(Internet Assigned Numbers Authority)의 공식 미디어 형식 목록에 따라 표기해야 한다.

> 참고: https://www.iana.org/assignments/media-types/media-types.xhtml

OWPML 핵심 미디어 유형은 다음과 같다.

### 표 1 — MIME 미디어 유형

| MIME 미디어 유형 | 참조 | 기술 |
|-----------------|------|------|
| `image/gif` | http://www.w3.org/Graphics/GIF/spec-gif89a.txt | 래스터(Raster) 이미지에 사용 |
| `image/jpeg` | http://www.w3.org/Graphics/JPEG/ | 래스터(Raster) 이미지에 사용 |
| `image/png` | RFC 2083 | 래스터(Raster) 이미지에 사용 |
| `application/xml` | http://www.w3.org/TR/xml11/ | 외부 XML 섬에 사용 |
| `application/javascript` | http://www.ecma-international.org/publications/standards/Ecma-262.htm | 양식 객체의 스크립트에 사용 |
