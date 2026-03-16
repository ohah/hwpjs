# 7. 기본 형식 및 단위

## 7.1 기본형식

OWPML 문서는 리딩 시스템에 따라 다양한 단위로 글자크기, 문단 간격 등 콘텐츠의 서식을 표현한다. 그러나 OWPML의 내부 논리적 구조 정보를 정의할 때는 한 가지 기본적으로 정해지는 단위가 필요하다. 기본 단위 이외의 리딩 시스템에서 콘텐츠 표현을 위해 사용되는 단위를 기본 단위로부터 변환된 값으로 이해하면 된다. ODF, OOXML 등 개방형 문서에서 사용하는 단위와 변환 오차로 인하여 호환성 이슈 등이 발생되기도 한다. 이 절에서는 XML 스키마를 통해 정의되는 OWPML 문서에서 기본적으로 사용되는 단위(Unit)에 대해서 설명한다. 단위는 기본적으로 절대단위와 상대단위로 나뉘며, 절대 단위는 전자문서의 출력장치(모니터)의 물리적 속성을 아는 경우 효율적이며, 상대 단위는 이기종 간, 플랫폼 간의 호환성을 유지하는데 편리하게 사용되는 단위이다.

## 7.2 단위

### 7.2.1 상대단위

기준이 되는 길이로부터 상대적인 값을 측정하는 길이를 상대 길이라고 하며, 이를 표현하는 단위를 상대단위라고 한다. OWPML 문서를 표현하는데 절대단위 또는 상대단위를 사용해야 한다. 이러한 단위를 문단간격, 글자크기, 객체의 크기 등 다양한 문서 내 객체를 표현하는데 사용된다. 자주 사용되는 상대단위는 em, ex, ch 등이 있으며, 자세한 사항은 W3C CSS Values and Units Module Level 3 (https://www.w3.org/TR/css-values-3/) 표준을 참고하기 바란다.

### 7.2.2 절대단위

절대 길이 단위는 물리적인 측정 앵커와 연결되어 있으며 상호 고정되어 있는 단위를 말한다. 절대 길이 단위는 주로 잘 알려진 출력 환경에 유용하게 사용된다. 이 단위는 cm, mm, pt 등 물리적인 단위로 구성된다. 절대 단위 간의 관계는 다음 표와 같다. 자세한 사항은 W3C CSS Values and Units Module Level 3 (https://www.w3.org/TR/css-values-3/) 표준을 참고하기 바란다.

### 7.2.3 HWPUNIT

이 표준에서 정의하는 OWPML 텍스트 형식의 문서는 OOXML, ODF 등 텍스트형 문서를 표현하는 개방형 문서 표준들과의 호환성을 높이기 위해 상호 변환 오차를 최소화할 수 있도록 정의된 HWPUNIT이라는 단위를 사용해야 한다. HWPUNIT은 본 표준 및 바이너리 HWP 문서 형식에서 사용되는 공통 단위이며 모든 단위가 표시되지 않는 속성 값들은 암묵적으로 단위를 HWPUNIT으로 해석해야 한다. 이 단위크기에 대한 정의는 다음과 같다.

> **10 pt = 1000 HWPUNIT**

HWPUNIT 이외의 단위가 사용될 경우, 스키마에 직접 명시를 하거나 해당 값이 사용되는 부분에서 주석으로 이를 명시해야 한다.

### 7.2.4 HWPUNIT과 다른 단위와의 관계

HWPUNIT은 CSS의 절대 단위와 아래와 같은 값의 관계를 갖는다.

| 단위 변환 | 값 |
|---|---|
| 1 pt | 100 hwpunit |
| 1 mm | 283.456 hwpunit |
| 1 cm | 2834.56 hwpunit |
| 1 inch | 7,200 hwpunit |
| 1 pixel | 75 hwpunit |
| 1 char | 500 hwpunit |
| 1 twips | 5 hwpunit |

### 7.2.5 기타 단위 표현

이 표준에서 HWPUNIT 단위를 사용하는 경우 대부분의 경우 암시적으로 단위를 사용한다. 즉, XML 스키마상에서 단위를 명시하는 것이 아니라, 주석 또는 설명 부속서에서 사용되는 단위를 기술하는 방법을 취한다.

이 표준에는 위와는 다르게 단위를 XML 스키마상에서 명시하는 방법이 사용되는 경우도 있다. 이 경우 값과 함께 단위를 하나의 묶음으로 해서 XML에 명시한다. 다음은 명시적으로 단위를 기술할 때 사용되는 XML 요소 형식(Complex Type)이다.

#### HWPValue 형식

| 속성 이름 | 설명 |
|---|---|
| `value` | 실제 값 |
| `unit` | 값의 단위 |

값과 함께 단위를 명시한다. 속성 `unit`에 올 수 있는 값은 `HWPUNIT`, `CHAR`으로 기본 값은 `CHAR`이다.

**샘플 1: HWPValue 형식**

```xml
<hh:margin>
  <hh:intent value="0" unit="HWPUNIT"/>
  <hh:left value="0" unit="HWPUNIT"/>
  <hh:right value="0" unit="HWPUNIT"/>
  <hh:prev value="0" unit="HWPUNIT"/>
  <hh:next value="1600" unit="HWPUNIT"/>
</hh:margin>
<hh:lineSpacing type="PERCENT" value="150" unit="HWPUNIT"/>
```

## 7.3 OWPML의 기본 나열 형식

OWPML에서 사용되는 기본 값들의 형태는 다음 표 3 ~ 표 8에 명시되어 있다.

### 표 3 -- 번호유형 1 (NumberType1)

| 항목 | 값 |
|---|---|
| **Base Type** | `xs:string` |
| **Extend Type** | `enumeration` |

| Enum Value | 설명 | 유니코드 |
|---|---|---|
| `DIGIT` | 1, 2, 3, ... | 0031, 0032, 0033, ... |
| `CIRCLED_DIGIT` | (1), (2), (3), ..., (20) | 2460, 2461, 2462, ..., 2473 |
| `ROMAN_CAPITAL` | I, II, III, ... | 2160, 2161, 2162, ... |
| `ROMAN_SMALL` | i, ii, iii, ... | 2170, 2171, 2172, ... |
| `LATIN_CAPITAL` | A, B, C, ..., Z | 0041, 0042, 0043, ..., 005A |
| `LATIN_SMALL` | a, b, c, ..., z | 0061, 0062, 0063, ..., 007A |
| `CIRCLED_LATIN_CAPITAL` | (A), (B), (C), ...(Z) | 24B6, 24B7, 24B8, ..., 24CF |
| `CIRCLED_LATIN_SMALL` | (a), (b), (c), ...(z) | 24D0, 24D1, 24D2, ..., 24E9 |
| `HANGUL_SYLLABLE` | 가, 나, 다, ...하 | AC00, B098, B2E4, ..., D556 |
| `CIRCLED_HANGUL_SYLLABLE` | (가), (나), (다), ...(하) | 326E, 326F, 3270, ..., 327B |
| `HANGUL_JAMO` | ㄱ, ㄴ, ㄷ, ...ㅎ | 1100, 1102, 1103, ..., 1112 |
| `CIRCLED_HANGUL_JAMO` | (ㄱ), (ㄴ), (ㄷ), ...(ㅎ) | 3260, 3261, 3262, ..., 326D |
| `HANGUL_PHONETIC` | 일, 이, 삼, 사, 오, 육, 칠, 팔, 구, 십 | C77C, C774, C0BC, C0AC, C624, C721, CE60, D314, AD6C, C2ED |
| `IDEOGRAPH` | 一, 二, 三, 四, 五, 六, 七, 八, 九, 十 | 4E00, 4E8C, 4E09, 56DB, 4E94, F9D1, 4E03, 516B, 4E5D, 5341 |
| `CIRCLED_IDEOGRAPH` | (一), (二), (三), ...(十) | 3280, 3281, 3282, ..., 3289 |

### 표 4 -- 번호유형 2 (NumberType2)

| 항목 | 값 |
|---|---|
| **Base Type** | `xs:string` |
| **Extend Type** | `enumeration` |

NumberType2는 NumberType1의 모든 값을 포함하며, 추가로 다음 값들을 가진다:

| Enum Value | 설명 | 유니코드 |
|---|---|---|
| `DIGIT` | 1, 2, 3, ... | 0031, 0032, 0033, ... |
| `CIRCLED_DIGIT` | (1), (2), (3), ..., (20) | 2460, 2461, 2462, ..., 2473 |
| `ROMAN_CAPITAL` | I, II, III, ... | 2160, 2161, 2162, ... |
| `ROMAN_SMALL` | i, ii, iii, ... | 2170, 2171, 2172, ... |
| `LATIN_CAPITAL` | A, B, C, ..., Z | 0041, 0042, 0043, ..., 005A |
| `LATIN_SMALL` | a, b, c, ..., z | 0061, 0062, 0063, ..., 007A |
| `CIRCLED_LATIN_CAPITAL` | (A), (B), (C), ...(Z) | 24B6, 24B7, 24B8, ..., 24CF |
| `CIRCLED_LATIN_SMALL` | (a), (b), (c), ...(z) | 24D0, 24D1, 24D2, ..., 24E9 |
| `HANGUL_SYLLABLE` | 가, 나, 다, ...하 | AC00, B098, B2E4, ..., D556 |
| `CIRCLED_HANGUL_SYLLABLE` | (가), (나), (다), ...(하) | 326E, 326F, 3270, ..., 327B |
| `HANGUL_JAMO` | ㄱ, ㄴ, ㄷ, ...ㅎ | 1100, 1102, 1103, ..., 1112 |
| `CIRCLED_HANGUL_JAMO` | (ㄱ), (ㄴ), (ㄷ), ...(ㅎ) | 3260, 3261, 3262, ..., 326D |
| `HANGUL_PHONETIC` | 일, 이, 삼, 사, 오, 육, 칠, 팔, 구, 십 | C77C, C774, C0BC, C0AC, C624, C721, CE60, D314, AD6C, C2ED |
| `IDEOGRAPH` | 一, 二, 三, 四, 五, 六, 七, 八, 九, 十 | 4E00, 4E8C, 4E09, 56DB, 4E94, F9D1, 4E03, 516B, 4E5D, 5341 |
| `CIRCLED_IDEOGRAPH` | (一), (二), (三), ...(十) | 3280, 3281, 3282, ..., 3289 |
| `DECAGON_CIRCLE` | 갑, 을, 병, 정, 무, 기, 경, 신, 임, 계 | AC11, C744, BCD1, C815, BB34, AE30, ACBD, C2E0, C784, ACC4 |
| `DECAGON_CIRCLE_HANJA` | 甲, 乙, 丙, 丁, 戊, 己, 庚, 辛, 壬, 癸 | 2F65, 2F04, 4E19, 4E01, 620A, 5DF1, 5E9A, 8F9B, 58EC, 7678 |
| `SYMBOL` | 네 가지 문자가 차례로 반복 | - |
| `USER_CHAR` | 사용자 지정 문자 반복 | - |

### 표 5 -- 선형식 1 (LineType1)

| 항목 | 값 |
|---|---|
| **Base Type** | `xs:string` |
| **Extend Type** | `enumeration` |

| Enum Value | 설명 |
|---|---|
| `NONE` | 없음 |
| `SOLID` | 중간에 끊어짐이 없이 동일한 굵기로 이어지는 선이다. |
| `DOT` | 동일한 굵기를 가지지만 중간중간에 동일한 간격으로 끊어짐이 있는 선이다. |
| `THICK` | SOLID 형태의 선으로 SOLID 형식의 선보다는 굵은 선이다. |
| `DASH` | 중간중간에 끊어짐이 있는 선으로, 끊어진 선들의 길이가 다른 선이다. 길이가 짧은 선과 길이가 긴 선이 번갈아가면서 나오는 선이다. |
| `DASH_DOT` | DASH 형식의 선에서 짧은 선 대신 점이 들어간 형태의 선이다. |
| `DASH_DOT_DOT` | DASH 형식의 선에서 짧은 선 대신 점이 2개 들어간 형태의 선이다. |

### 표 6 -- 선형식 2 (LineType2)

| 항목 | 값 |
|---|---|
| **Base Type** | `xs:string` |
| **Extend Type** | `enumeration` |

| Enum Value | 설명 |
|---|---|
| `NONE` | 없음 |
| `SOLID` | LineType1의 SOLID 형식을 참조 |
| `DOT` | LineType1의 DOT 형식을 참조 |
| `DASH` | LineType1의 DASH 형식을 참조 |
| `DASH_DOT` | LineType1의 DASH_DOT 형식을 참조 |
| `DASH_DOT_DOT` | LineType1의 DASH_DOT_DOT 형식을 참조 |
| `LONG_DASH` | DASH 형태의 선으로 DASH 형식의 선보다는 선을 구성하는 단위 선의 길이가 긴 선이다. |
| `CIRCLE` | DOT 형태의 선으로 DOT 형식의 선보다는 점의 굵기가 굵다. |
| `DOUBLE_SLIM` | SOLID 형식의 선이 이중으로 나란히 표현되는 선이다. |
| `SLIM_THICK` | 위쪽에는 SOLID 형식의 선이 아래쪽에는 THICK 형식의 선이 나란히 표현되는 선이다. |
| `THICK_SLIM` | 위쪽에는 THICK 형식의 선이, 아래쪽에는 SOLID 형식의 선이 나란히 표현되는 선이다. |
| `SLIM_THICK_SLIM` | SOLID 형식의 선과 THICK 형식의 선이 삼중으로 나란히 표현되는 선이다. 제일 위에는 SOLID 형식의 선이, 중간에는 THICK 형식의 선이, 아래에는 다시 SOLID 형식의 선이 나란히 표현된다. |

### 표 7 -- 선형식 3 (LineType3)

| 항목 | 값 |
|---|---|
| **Base Type** | `xs:string` |
| **Extend Type** | `enumeration` |

LineType3는 LineType2의 모든 값을 포함하며, 추가로 다음 값들을 가진다:

| Enum Value | 설명 |
|---|---|
| `NONE` | 없음 |
| `SOLID` | LineType1의 SOLID 형식을 참조 |
| `DOT` | LineType1의 DOT 형식을 참조 |
| `DASH` | LineType1의 DASH 형식을 참조 |
| `DASH_DOT` | LineType1의 DASH_DOT 형식을 참조 |
| `DASH_DOT_DOT` | LineType1의 DASH_DOT_DOT 형식을 참조 |
| `LONG_DASH` | DASH 형태의 선으로 DASH 형식의 선보다는 선을 구성하는 단위 선의 길이가 긴 선이다. |
| `CIRCLE` | DOT 형태의 선으로 DOT 형식의 선보다는 점의 굵기가 굵다. |
| `DOUBLE_SLIM` | SOLID 형식의 선이 이중으로 나란히 표현되는 선이다. |
| `SLIM_THICK` | 위쪽에는 SOLID 형식의 선이 아래쪽에는 THICK 형식의 선이 나란히 표현되는 선이다. |
| `THICK_SLIM` | 위쪽에는 THICK 형식의 선이, 아래쪽에는 SOLID 형식의 선이 나란히 표현되는 선이다. |
| `SLIM_THICK_SLIM` | SOLID 형식의 선과 THICK 형식의 선이 삼중으로 나란히 표현되는 선이다. 제일 위에는 SOLID 형식의 선이, 중간에는 THICK 형식의 선이, 아래에는 다시 SOLID 형식의 선이 나란히 표현된다. |
| `WAVE` | 물결선 |
| `DOUBLEWAVE` | 이중물결선 |

### 표 8 -- 선넓이형식 (LineWidth)

| 항목 | 값 |
|---|---|
| **Base Type** | `xs:float` |
| **Extend Type** | `enumeration` |

| Enum Value | 설명 |
|---|---|
| `0.1` | 0.1 mm |
| `0.12` | 0.12 mm |
| `0.15` | 0.15 mm |
| `0.2` | 0.2 mm |
| `0.25` | 0.25 mm |
| `0.3` | 0.3 mm |
| `0.4` | 0.4 mm |
| `0.5` | 0.5 mm |
| `0.6` | 0.6 mm |
| `0.7` | 0.7 mm |
| `1.0` | 1.0 mm |
| `1.5` | 1.5 mm |
| `2.0` | 2.0 mm |
| `3.0` | 3.0 mm |
| `4.0` | 4.0 mm |
| `5.0` | 5.0 mm |

## 7.4 OWPML의 색상 표현

OWPML 문서 내의 색상 표현은 아래 표와 같은 패턴의 형식으로 표현될 수 있다. 이 값은 기본적으로 문자열이며 HEX 숫자를 뜻하며 `#` 기호를 앞에 붙여 나타낸다.

### 표 9 -- 색상 형식 (RGBColorType)

| 항목 | 값 |
|---|---|
| **Base Type** | `xs:string` |
| **Extend Type** | HEX value |
| **Pattern** | `#[0-9A-Fa-f]{6}` |
| **Example** | `#01F39B` |

**샘플 2: 색상 형식**

```xml
<hh:numbering id="1" start="0">
  <hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0"
    textOffsetType="PERCENT" textOffset="50" numFormat="CIRCLED_DIGIT" charPrIDRef="4294967295"
    checkable="1">^1.</hh:paraHead>
  <hh:paraHead start="1" level="2" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0"
    textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE" charPrIDRef="4294967295"
    checkable="0">^2.</hh:paraHead>
  <hh:paraHead start="1" level="3" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0"
    textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295"
    checkable="0">^3)</hh:paraHead>
  <hh:paraHead start="1" level="4" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0"
    textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE" charPrIDRef="4294967295"
    checkable="0">^4)</hh:paraHead>
</hh:numbering>
```
