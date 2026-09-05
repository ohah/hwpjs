# 5.2 XML 네임스페이스와의 관계

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
