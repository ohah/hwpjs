# 17 하위 호환성 요소

## 17.1 하위 호환성

하위 호환성 요소는 상위 버전에서 만든 문서를 하위 버전 문서에서 처리하기 위한 구조를 말한다.

## 17.2 switch 요소

### 17.2.1 switch

`<switch>`는 호환이 필요한 구조의 요소 아래 위치할 수 있다. `<switch>` 아래의 구조는 호환이 되는 구조를 포함한다. `<case>`의 호환 조건을 만족한다면 하위 구조를 선택하고 그렇지 않을 경우 `<default>` 하위 구조를 따른다.

#### 표 327 -- switch 요소

| 하위 요소 이름 | 설명 |
|---|---|
| case | 호환 구조 |
| default | 대체 구조 |

### 17.2.2 case 요소

`<case>` 요소는 호환이 필요한 구조의 대체 표현을 포함하고 있다. `<case>` 요소는 여러 개 올 수 있으며 향상된 호환을 위하여 최적 렌더링포맷 순으로 정렬하는 것이 좋다. `<case>`의 하위 속성의 조건인 `<required-namespace>`를 확인하여 하위 구조를 선택한다.

#### 표 328 -- case 요소

| 속성 이름 | 설명 |
|---|---|
| required-namespace | 호환 조건 |

### 17.2.3 default 요소

`<default>` 요소는 어떤 `<case>`도 렌더링할 수 없을 때의 기본 호환 구조를 제공한다.

## 17.3 XML 예

#### 샘플 181 -- switch 예

```xml
<hp:run charPrIDRef="0">
  <hp:switch>
    <hp:case required-namespace="http://www.hancom.co.kr/hwpml/2016/ooxmlchart">
      <hp:chart id="1430597883" zOrder="0" numberingType="PICTURE" textWrap="TIGHT"
        textFlow="BOTH_SIDES" lock="0" ctrlch="11" ctrlid="610494580" dropcapstyle="None"
        chartIDRef="Chart/chart1.xml">
        <hp:sz width="32250" widthRelTo="ABSOLUTE" height="18750"
          heightRelTo="ABSOLUTE" protect="0"/>
        <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0"
          holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP"
          horzAlign="LEFT" vertOffset="0" horzOffset="0"/>
        <hp:outMargin left="0" right="0" top="0" bottom="0"/>
      </hp:chart>
    </hp:case>
    <hp:default>
      <hp:ole id="1430597883" zOrder="0" numberingType="PICTURE" textWrap="TIGHT"
        textFlow="BOTH_SIDES" lock="0" ctrlch="11" ctrlid="611282021" dropcapstyle="None"
        href="" groupLevel="0" instid="0" objectType="UNKNOWN" binaryItemIDRef="ole1"
        hasMoniker="0" drawAspect="CONTENT" eqBaseLine="0">
        <hp:offset x="0" y="0"/>
        <hp:orgSz width="7200" height="7200"/>
        <hp:curSz width="0" height="0"/>
        <hp:flip horizontal="0" vertical="0"/>
        <hp:rotationInfo angle="0" centerX="3452816845" centerY="3452816845"
          rotateimage="1"/>
        <hp:renderingInfo>
          <hp:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
          <hp:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
          <hp:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
        </hp:renderingInfo>
        <hp:extent x="7200" y="7200"/>
        <hp:lineShape color="#000000" width="0" style="NONE" endCap="ROUND"
          headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0"
          headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
        <hp:sz width="32250" widthRelTo="ABSOLUTE" height="18750"
          heightRelTo="ABSOLUTE" protect="0"/>
        <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0"
          holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP"
          horzAlign="LEFT" vertOffset="0" horzOffset="0"/>
        <hp:outMargin left="0" right="0" top="0" bottom="0"/>
      </hp:ole>
    </hp:default>
  </hp:switch>
</hp:run>
```

이 예시는 `<hp:switch>` 요소를 사용하여 OOXML 차트를 지원하는 경우 `<hp:chart>` 요소를 사용하고, 그렇지 않은 경우 `<hp:default>` 내의 `<hp:ole>` 요소로 대체하는 하위 호환성 구조를 보여준다.
