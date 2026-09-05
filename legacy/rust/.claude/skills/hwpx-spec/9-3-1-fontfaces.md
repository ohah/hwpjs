# 9.3.1 문서 설정 / 9.3.2 fontfaces 요소

## 9.3.1 문서 설정

문서 설정 정보는 문서 내에서 사용되는 각종 글꼴 정보, 글자 모양 정보, 테두리/배경 정보와 같이 문서의 레이아웃 설정 및 모양 설정 등을 가지고 있다.

---

## 9.3.2 fontfaces 요소

#### 9.3.2.1 fontfaces

문서 내에서 글꼴 정보는 반드시 1개 이상 정의되어 있어야 한다. 내용이 없는 문서라도 기본 글꼴 정보는 정의되어 있어야 한다. 헤더 스키마 상에서는 속성 `itemCnt`의 값으로 올 수 있는 범위가 1 이상으로(`positiveInteger`) 제한되어 있으며, 자식 요소인 `<fontface>` 요소의 개수 한정자 역시 1 이상으로 정의되어 있다.

#### 표 24 -- fontfaces 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 글꼴 정보의 개수 |

| 하위 요소 이름 | 설명 |
|---------------|------|
| fontface | 글꼴 정보 |

#### 샘플 11 -- fontfaces 예

```xml
<hh:fontfaces itemCnt="7">
  <hh:fontface lang="HANGUL" fontCnt="2">
    <hh:font id="0" face="함초롬돋움" type="TTF" isEmbedded="0">
      <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0"
        strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
    </hh:font>
    <hh:font id="1" face="함초롬바탕" type="TTF" isEmbedded="0">
      <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0"
        strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
    </hh:font>
  </hh:fontface>
</hh:fontfaces>
```

#### 9.3.2.2 fontface 요소

##### 9.3.2.2.1 fontface

글꼴 정보는 언어별로 정의된다. 현재 이 문서에서 지원되고 있는 언어 형식으로는 [한글, 라틴, 한자, 일어, 기타, 심볼, 사용자]가 있다. [한글, 라틴, 한자, 일어, 심볼] 언어 형식의 구분은 Unicode 4.0을 참고한다. [기타] 언어 형식의 구분은 RTL(Right to Left) 표기방식의 언어이며, [사용자] 언어형식의 구분은 PUA(Private Unicode Area) 영역을 말한다.

#### 표 25 -- fontface 요소

| 속성 이름 | 설명 |
|-----------|------|
| lang | 글꼴이 적용될 언어 유형 |

| 하위 요소 이름 | 설명 |
|---------------|------|
| font | 글꼴 |

##### 9.3.2.2.2 font 요소

HWP 문서 스키마는 내장 글꼴을 지원한다. 글꼴이 내장될 경우, 글꼴 데이터 파일은 다른 바이너리 파일과 마찬가지로 컨테이너 내에 바이너리 형태로 포함이 되고 manifest에 해당 정보를 기록한다. `<font>` 엘리먼트에서는 manifest에 정의된 정보를 참조해서 내장된 글꼴에 접근하게 된다.

속성 `@isEmbedded`의 값이 참(true)인 경우, 반드시 컨테이너 내에 글꼴을 내장하고 속성 `@binaryItemIDRef`의 값이 유효한 값이어야 한다. 만약 속성 `@isEmbedded` 값이 참(true)인데 속성 `@binaryItemIDRef`의 값이 유효하지 않다면 애플리케이션에서는 이를 오류 상황으로 인식해야 한다.

속성 `@isEmbedded`의 값이 거짓(false)인 경우, 애플리케이션은 사용자 시스템에 내장된 글꼴을 사용해야 한다. 이 경우 속성 `@binaryItemIDRef`은 사용되지 않는다. 속성 `@isEmbedded`의 값이 거짓(false)인데 사용자 시스템 내에 정의된 글꼴이 없는 경우 애플리케이션은 이를 오류 상황으로 인식해야 한다.

정의된 글꼴이 없는 오류 상황에서 애플리케이션은 대체 글꼴을 먼저 사용해야 한다. 대체 글꼴마저 없는 경우에 대한 처리 방법은 이 표준에서는 정의하지 않지만, 시스템 기본 글꼴을 사용하는 것을 권고한다.

#### 표 26 -- font 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 글꼴을 식별하기 위한 아이디 |
| face | 글꼴의 이름 |
| type | 글꼴의 유형 |
| isEmbedded | 글꼴 파일이 문서 컨테이너 내에 포함되었는지 여부 |
| binaryItemIDRef | 글꼴 파일이 문서 컨테이너 내에 포함된 경우 해당 글꼴 파일을 지정하기 위한 ID 참조 값 |

#### 표 27 -- font 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| substFont | 대체 글꼴 |
| typeInfo | 글꼴 유형 정보 |

##### substFont 요소

애플리케이션에서는 `<font>` 요소에서 정의된 글꼴이 없는 경우 가장 먼저 `<substFont>` 요소에 정의된 글꼴을 사용해야 한다. 대체 글꼴마저 없는 경우 시스템 기본 글꼴을 사용하는 것을 권고한다.

#### 표 28 -- substFont 요소

| 속성 이름 | 설명 |
|-----------|------|
| face | 글꼴의 이름 |
| type | 글꼴의 유형 |
| isEmbedded | 글꼴 파일이 문서 컨테이너 내에 포함되었는지 여부 |
| binaryItemIDRef | 글꼴 파일이 문서 컨테이너 내에 포함된 경우 해당 글꼴 파일을 지정하기 위한 ID 참조값 |

##### typeInfo 요소

글꼴의 유형 설정을 표현하기 위한 요소이다.

#### 표 29 -- typeInfo 속성

| 속성 이름 | 설명 |
|-----------|------|
| familyType | 글꼴 계열 |
| serifStyle | 세리프 유형 |
| weight | 굵기 |
| proportion | 비례 |
| contrast | 대조 |
| strokeVariation | 스트로크 편차 |
| armStyle | 자획 유형 |
| letterform | 글자형 |
| midline | 중간선 |
| xHeight | X-높이 |
