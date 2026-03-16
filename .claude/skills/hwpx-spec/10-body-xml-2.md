# 10. 본문 XML 스키마 - 객체 (Part 2)

KS X 6101:2024 HWPX/OWPML 표준 - Section 10.9 ~ 10.12

---

## 10.9 기본 도형 객체

### 10.9.1 도형 객체

기본 도형 객체는 표, 그림, 수식, 컨테이너와 같은 문서 내에서 텍스트 이외의 기본적인 객체들을 뜻한다. 기본 도형 객체들은 `[AbstractShapeObjectType]`을 기본 형식(base-type)으로 가진다.

### 10.9.2 AbstractShapeObjectType

#### 10.9.2.1 AbstractShapeObjectType

`[AbstractShapeObjectType]`은 기본 도형 객체들의 공통된 속성을 정의한 형식이다. 기본 도형 객체들은 `[AbstractShapeObjectType]`을 기본 형식으로 가지고 추가적으로 필요한 속성이나 요소를 확장해서 사용한다. `[AbstractShapeObjectType]`은 추상 형식이므로 `[AbstractShapeObjectType]`만으로는 XML 요소를 생성할 수 없다.

**표 187 -- AbstractShapeObjectType 요소**

| 속성 이름 | 설명 |
|---|---|
| id | 객체를 식별하기 위한 아이디 |
| zOrder | z-order |
| numberingType | 이 객체가 속하는 번호 범위 |
| textWrap | 오브젝트 주위를 텍스트가 어떻게 흘러갈지 정하는 옵션. 하위 요소 pos의 속성 중 "treatAsChar"이 "false"일 때에만 사용 |
| textFlow | 오브젝트의 좌우 어느 쪽에 글을 배치할지 정하는 옵션. textWrap 속성이 "SQUARE" 또는 "TIGHT" 또는 "THROUGH"일 때에만 사용 |
| lock | 객체 선택 가능 여부 |
| dropcapStyle | 첫글자 장식 스타일. None: 없음, DoubleLine: 2줄, TripleLine: 3줄, Margin: 여백 |

**표 188 -- AbstractShapeObjectType 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| sz | 크기 정보 |
| pos | 위치 정보 |
| outMargin | 바깥 여백 |
| caption | 캡션 |
| shapeComment | 요소의 값으로 주석 내용을 가짐 |
| metaTag | 메타태그 관련 정보 |

```xml
<hp:rect id="1790879982" zOrder="0" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None">
```

#### 10.9.2.2 객체 크기 정보 -- `<sz>`

**표 189 -- sz 요소**

| 속성 이름 | 설명 |
|---|---|
| width | 오브젝트 폭 |
| widthRelTo | 오브젝트 폭의 기준 |
| height | 오브젝트 높이 |
| heightRelTo | 오브젝트 높이의 기준 |
| protect | 크기 보호 여부 |

#### 10.9.2.3 객체 위치 정보 -- `<pos>`

**표 190 -- pos 요소**

| 속성 이름 | 설명 |
|---|---|
| treatAsChar | 글자처럼 취급 여부 |
| affectLSpacing | 줄 간격에 영향을 줄지 여부. treatAsChar 속성이 "true"일 때에만 사용 |
| flowWithText | 오브젝트의 세로 위치를 본문 영역으로 제한할지 여부. vertical이 "PARA"일 때에만 사용 |
| allowOverlap | 다른 오브젝트와 겹치는 것을 허용할지 여부. treatAsChar 속성이 "false"일 때에만 사용. flowWithText 속성이 "true"이면 무조건 "false"로 간주 |
| holdAnchorAndSO | 객체와 조판부호를 항상 같은 쪽에 놓을지 여부 |
| vertRelTo | 세로 위치의 기준. treatAsChar 속성이 "false"일 때에만 사용 |
| horzRelTo | 가로 위치의 기준. treatAsChar 속성이 "false"일 때에만 사용 |
| vertAlign | vertRelTo에 대한 상대적인 배열 방식. TOP, CENTER, BOTTOM, INSIDE, OUTSIDE |
| horzAlign | horzRelTo에 대한 상대적인 배열 방식 |
| vertOffset | vertRelTo와 vertAlign을 기준점으로 한 상대적인 오프셋 값. 단위는 HWPUNIT |
| horzOffset | horzRelTo와 horzAlign을 기준점으로 한 상대적인 오프셋 값. 단위는 HWPUNIT |

```xml
<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1"
  holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT"
  vertOffset="10575" horzOffset="9927"/>
```

#### 10.9.2.4 객체 바깥 여백 -- `<outMargin>`

`<outMargin>` 요소는 `[MarginAttributeGroup]`을 속성으로 포함한다. `[MarginAttributeGroup]`은 10.6.6.2를 참조한다.

**표 191 -- outMargin 요소**

| 속성 이름 | 설명 |
|---|---|
| [MarginAttributeGroup] | 10.6.6.2 참조 |

```xml
<hp:outMargin left="10" right="10" top="0" bottom="0"/>
```

#### 10.9.2.5 객체 캡션 -- `<caption>`

`<caption>` 요소는 하위 요소로 `<subList>` 요소를 가진다. `<subList>` 요소는 11.1.2를 참조한다.

**표 192 -- caption 요소**

| 속성 이름 | 설명 |
|---|---|
| side | 캡션 방향 |
| fullSize | 캡션 폭에 마진을 포함할지 여부 |
| width | 캡션 폭 |
| gap | 캡션과 틀 사이의 간격 |
| lastWidth | 텍스트 최대 길이(=객체의 폭) |

**표 193 -- caption 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| subList | 캡션 내용. 11.1.2 참조 |

```xml
<hp:caption side="BOTTOM" fullSz="0" width="8504" gap="850" lastWidth="16800">
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP"
    linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
    hasTextRef="0" hasNumRef="0">
    <hp:p id="0" paraPrIDRef="19" styleIDRef="21" pageBreak="0" columnBreak="0" merged="0">
      <hp:run charPrIDRef="0">
        <hp:t>그림 </hp:t>
        <hp:ctrl>
          <hp:autoNum num="1" numType="PICTURE">
            <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/>
          </hp:autoNum>
        </hp:ctrl>
        <hp:t> </hp:t>
      </hp:run>
    </hp:p>
  </hp:subList>
</hp:caption>
```

### 10.9.3 tbl 요소

#### 10.9.3.1 tbl

`<tbl>` 요소는 표에 관한 정보를 가지고 있는 요소로 `[AbstractShapeObjectType]`을 상속받는다.

**표 194 -- tbl 요소**

| 속성 이름 | 설명 |
|---|---|
| pageBreak | 테이블이 페이지 경계에서 나뉘는 방식. TABLE: 테이블은 나뉘지만 셀은 나뉘지 않음, CELL: 셀 내의 텍스트도 나뉨, NONE: 나뉘지 않음 |
| repeatHeader | 테이블이 나뉘었을 경우, 제목 행을 나뉜 페이지에서도 반복할지 여부 |
| rowCnt | 테이블 행 개수 |
| colCnt | 테이블 열 개수 |
| noAdjust | 셀 너비/높이 값의 최소 단위(1 pt) 보정 여부 |
| cellSpacing | 셀 간격. 단위는 HWPUNIT |
| borderFillIDRef | 테두리/배경 아이디 참조값 |

**표 195 -- tbl 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| inMargin | 안쪽 여백 |
| cellzoneList | 셀존 목록 |
| tr | 행 |
| label | 라벨 |

```xml
<hp:tbl id="1811647054" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1"
  rowCnt="5" colCnt="5" cellSpacing="0" borderFillIDRef="3" noAdjust="0">
  <hp:sz width="41950" widthRelTo="ABSOLUTE" height="6410" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="283" right="283" top="283" bottom="283"/>
  <hp:inMargin left="510" right="510" top="141" bottom="141"/>
  <hp:tr>
    <hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0"
      borderFillIDRef="3">
      <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER"
        linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
        hasTextRef="0" hasNumRef="0">
        <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
          <hp:run charPrIDRef="0"/>
        </hp:p>
      </hp:subList>
      <hp:cellAddr colAddr="0" rowAddr="0"/>
      <hp:cellSpan colSpan="1" rowSpan="2"/>
      <hp:cellSz width="8390" height="564"/>
      <hp:cellMargin left="510" right="510" top="141" bottom="141"/>
    </hp:tc>
    ......
  </hp:tr>
  ......
</hp:tbl>
```

#### 10.9.3.2 inMargin 요소

`<inMargin>` 요소는 안쪽 여백 정보로 `[MarginAttributeGroup]`을 속성으로 포함한다.

**표 196 -- inMargin 요소**

| 속성 이름 | 설명 |
|---|---|
| [MarginAttributeGroup] | 10.6.6.2 참조 |

```xml
<hp:inMargin left="510" right="510" top="141" bottom="141"/>
```

#### 10.9.3.3 cellzoneList 요소

##### 10.9.3.3.1 cellzoneList

표는 표 전체 또는 부분적으로 배경색 및 테두리와 같은 속성을 줄 때, 영역을 지정하기 위해서 `<cellzone>` 요소를 사용한다.

**표 197 -- cellzoneList 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| cellzone | 셀존 |

##### 10.9.3.3.2 cellzone 요소

Cell zone은 표에서 스타일 및 모양이 적용되는 단위이다. 5x5 테이블 중 가운데 2x3 영역만 다른 테두리를 적용된 경우, cell zone은 아래와 같은 값을 가지게 된다.

**표 198 -- cellzone 요소**

| 속성 이름 | 설명 |
|---|---|
| startRowAddr | 셀존 row의 시작 주소 (0부터 시작) |
| startColAddr | 셀존 column의 시작 주소 (0부터 시작) |
| endRowAddr | 셀존 row의 끝 주소 (0부터 시작) |
| endColAddr | 셀존 column의 끝 주소 (0부터 시작) |
| borderFillIDRef | 테두리/배경 아이디 참조값 |

```xml
<cellzone startRowAddr="1" startColAddr="1"
  endRowAddr="2" endColAddr="3" borderFillIDRef="borderXXX"/>
```

#### 10.9.3.4 tr 요소

##### 10.9.3.4.1 tr

표에서 하나의 행을 표현하기 위한 요소이다. 하나의 행 안에는 여러 개의 열을 가지게 된다.

**표 199 -- tr 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| tc | 테이블 열 |

##### 10.9.3.4.2 tc 요소

`<tc>` 요소는 하위 요소로 표 안의 글 내용을 담고 있는 `<subList>` 요소를 가진다.

**표 200 -- tc 요소**

| 속성 이름 | 설명 |
|---|---|
| name | 셀 필드 이름 |
| header | 제목 셀인지 여부 |
| hasMargin | 테이블의 기본 셀 여백이 아닌 독자적인 여백을 사용하는지 여부 |
| protect | 사용자 편집을 막을지 여부 |
| editable | 읽기 전용 상태에서도 수정 가능한지 여부 |
| dirty | 마지막 업데이트된 이후 사용자가 내용을 변경했는지 여부 |
| borderFillIDRef | 테두리/배경 아이디 참조값 |

**표 201 -- tc 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| subList | 셀 내용 (11.1.2 참조) |
| cellAddr | 셀 주소 |
| cellSpan | 셀 병합 정보 |
| cellSz | 셀 크기 |
| cellMargin | 셀 여백 |

```xml
<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="4">
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER"
    linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
    hasTextRef="0" hasNumRef="0">
    <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
      <hp:run charPrIDRef="0"/>
    </hp:p>
  </hp:subList>
  <hp:cellAddr colAddr="4" rowAddr="0"/>
  <hp:cellSpan colSpan="1" rowSpan="1"/>
  <hp:cellSz width="8390" height="282"/>
  <hp:cellMargin left="510" right="510" top="141" bottom="141"/>
</hp:tc>
```

**셀 주소 -- `<cellAddr>`**

**표 202 -- cellAddr 요소**

| 속성 이름 | 설명 |
|---|---|
| colAddr | 셀의 열 주소 (0부터 시작, 제일 왼쪽 셀이 0) |
| rowAddr | 셀의 행 주소 (0부터 시작, 제일 위쪽 셀이 0) |

```xml
<hp:cellAddr colAddr="3" rowAddr="0"/>
```

**셀 병합 정보 -- `<cellSpan>`**

**표 203 -- cellSpan 요소**

| 속성 이름 | 설명 |
|---|---|
| colSpan | 열 병합 개수 |
| rowSpan | 행 병합 개수 |

```xml
<hp:cellSpan colSpan="1" rowSpan="1"/>
```

**셀 크기 -- `<cellSz>`**

**표 204 -- cellSz 요소**

| 속성 이름 | 설명 |
|---|---|
| width | 셀의 폭. 단위는 HWPUNIT |
| height | 셀의 높이. 단위는 HWPUNIT |

```xml
<hp:cellSz width="8390" height="282"/>
```

**셀 여백 -- `<cellMargin>`**

`<cellMargin>` 요소는 `[MarginAttributeGroup]`을 속성으로 포함한다.

**표 205 -- cellMargin 요소**

| 속성 이름 | 설명 |
|---|---|
| [MarginAttributeGroup] | 10.6.6.2 참조 |

```xml
<hp:cellMargin left="510" right="510" top="141" bottom="141"/>
```

#### 10.9.3.5 label 요소

**표 206 -- label 요소**

| 속성 이름 | 설명 |
|---|---|
| topmargin | 용지 위쪽 여백 |
| leftmargin | 용지 왼쪽 여백 |
| boxwidth | 이름표 폭 |
| boxlength | 이름표 길이 |
| boxmarginhor | 이름표 좌우 여백 |
| boxmarginver | 이름표 상하 여백 |
| labelcols | 이름표 행의 개수 |
| labelrows | 이름표 열의 개수 |
| landscape | 용지 방향 |
| pagewidth | 문서의 폭 |
| pageheight | 문서의 길이 |

```xml
<hp:label topmargin="1332" leftmargin="1532" boxwidth="56692" boxlength="81936"
  boxmarginhor="0" boxmarginver="0" labelcols="1" labelrows="1" landscape="WIDELY"
  pagewidth="59528" pageheight="84188"/>
```

### 10.9.4 equation 요소

`<equation>` 요소는 `[AbstractShapeObjectType]`을 상속받는다.

**표 207 -- equation 요소**

| 속성 이름 | 설명 |
|---|---|
| version | 수식 버전 |
| baseLine | 수식이 그려질 기본 선 |
| textColor | 수식 글자 색 |
| baseUnit | 수식의 글자 크기. 단위는 HWPUNIT |
| lineMode | 수식이 차지하는 범위 |
| font | 수식 폰트. Default font: "HYhwpEQ" |

**표 208 -- equation 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| script | 수식 내용. 부속서 I의 수식 스크립트 참조 |

```xml
<hp:equation id="1606912079" zOrder="2" numberingType="EQUATION"
  textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"
  version="Equation Version 60" baseLine="66" textColor="#000000" baseUnit="1000"
  lineMode="CHAR" font="HancomEQN">
  <hp:sz width="9125" widthRelTo="ABSOLUTE" height="2250" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="56" right="56" top="0" bottom="0"/>
  <hp:shapeComment>수식입니다.</hp:shapeComment>
  <hp:script>pi = C over d = 3.14159CDOTS</hp:script>
</hp:equation>
```

### 10.9.5 AbstractShapeComponentType

#### 10.9.5.1 AbstractShapeComponentType

`[AbstractShapeComponentType]`은 `[AbstractShapeObjectType]`을 기본 형식으로 가지고 추가적으로 필요한 속성이나 요소를 확장한다. 추상 형식이므로 `[AbstractShapeComponentType]`만으로는 XML 요소를 생성할 수 없다.

**표 209 -- AbstractShapeComponentType 요소**

| 속성 이름 | 설명 |
|---|---|
| href | 하이퍼링크 속성 |
| groupLevel | 그룹핑 횟수 |
| instid | 객체 아이디 |

**표 210 -- AbstractShapeComponentType 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| offset | 객체가 속한 그룹 내에서의 오프셋 정보 |
| orgSz | 객체 생성 시 최초 크기 |
| curSz | 객체의 현재 크기 |
| flip | 객체가 뒤집어진 상태인지 여부 |
| rotationInfo | 객체 회전 정보 |
| renderingInfo | 객체 렌더링 정보 |

```xml
<hp:rect id="1833429566" zOrder="8" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="759687743" ratio="0">
  ......
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="16800" height="12825"/>
  <hp:curSz width="0" height="0"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="8400" centerY="6412" rotateimage="1"/>
  <hp:renderingInfo>
    <hp:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hp:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hp:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  ......
```

#### 10.9.5.2 객체가 속한 그룹 내에서의 오프셋 정보 -- `<offset>`

**표 211 -- offset 요소**

| 속성 이름 | 설명 |
|---|---|
| x | 객체가 속한 그룹 내에서의 x offset |
| y | 객체가 속한 그룹 내에서의 y offset |

```xml
<hp:offset x="0" y="0"/>
```

#### 10.9.5.3 객체 생성 시 최초 크기 -- `<orgSz>`

**표 212 -- orgSz 요소**

| 속성 이름 | 설명 |
|---|---|
| width | 개체 생성 시 최초 폭. 단위는 HWPUNIT |
| height | 개체 생성 시 최초 높이. 단위는 HWPUNIT |

```xml
<hp:orgSz width="16800" height="12825"/>
```

#### 10.9.5.4 객체의 현재 크기 -- `<curSz>`

**표 213 -- curSz 요소**

| 속성 이름 | 설명 |
|---|---|
| width | 개체의 현재 폭. 단위는 HWPUNIT |
| height | 개체의 현재 높이. 단위는 HWPUNIT |

```xml
<hp:curSz width="12500" height="5000"/>
```

#### 10.9.5.5 객체가 뒤집어진 상태인지 여부 -- `<flip>`

**표 214 -- flip 요소**

| 속성 이름 | 설명 |
|---|---|
| horizontal | 좌우로 뒤집어진 상태인지 여부 |
| vertical | 상하로 뒤집어진 상태인지 여부 |

```xml
<hp:flip horizontal="1" vertical="0"/>
```

#### 10.9.5.6 객체 회전 정보 -- `<rotationInfo>`

**표 215 -- rotationInfo 요소**

| 속성 이름 | 설명 |
|---|---|
| angle | 회전각 |
| centerX | 회전 중심의 x 좌표 |
| centerY | 회전 중심의 y 좌표 |
| rotateimage | 이미지 회전 여부 |

```xml
<hp:rotationInfo angle="0" centerX="6250" centerY="2500" rotateimage="1"/>
```

#### 10.9.5.7 객체 렌더링 정보

##### 10.9.5.7.1 객체 렌더링 -- `<renderingInfo>`

객체 렌더링 시 필요한 변환 행렬, 확대/축소 행렬, 회전 행렬을 가지고 있는 요소이다.

**표 216 -- renderingInfo 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| transMatrix | Translation Matrix (10.9.5.7.2 참조) |
| scaMatrix | Scaling Matrix (10.9.5.7.2 참조) |
| rotMatrix | Rotation Matrix (10.9.5.7.2 참조) |

##### 10.9.5.7.2 행렬 요소 형식 -- `[MatrixType]`

`[MatrixType]`은 행렬을 표현하기 위한 요소 형식이다. 9x9 행렬에서 2행의 요소까지만 표현을 하고 3행의 요소는 (0, 0, 1)로 일정하기 때문에 표현하지 않는다.

**표 217 -- MatrixType 요소**

| 속성 이름 | 설명 |
|---|---|
| e1 | 9x9 행렬의 첫 번째 요소 (0,0) |
| e2 | 9x9 행렬의 두 번째 요소 (0,1) |
| e3 | 9x9 행렬의 세 번째 요소 (0,2) |
| e4 | 9x9 행렬의 네 번째 요소 (1,0) |
| e5 | 9x9 행렬의 다섯 번째 요소 (1,1) |
| e6 | 9x9 행렬의 여섯 번째 요소 (1,2) |

```xml
<hp:renderingInfo>
  <hp:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  <hp:scaMatrix e1="0.881959" e2="0" e3="0" e4="0" e5="0.352783" e6="0"/>
  <hp:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
</hp:renderingInfo>
```

### 10.9.6 pic 요소

#### 10.9.6.1 pic

`<pic>` 요소는 `[AbstractShapeComponentType]`을 상속받는다.

**표 218 -- pic 요소**

| 속성 이름 | 설명 |
|---|---|
| reverse | 그림 색상 반전 |

**표 219 -- pic 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| lineShape | 테두리선 모양 |
| imgRect | 이미지 좌표 정보 |
| imgClip | 이미지 자르기 정보 |
| effects | 이미지 효과 정보 |
| inMargin | 안쪽 여백 정보 (10.6.6.2 참조) |
| imgDim | 이미지 원본 정보 |
| img | 그림 정보 |

```xml
<hp:pic id="1790881809" zOrder="2" numberingType="PICTURE" textWrap="SQUARE"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="717139986" reverse="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="13800" height="15438"/>
  <hp:curSz width="0" height="0"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="6900" centerY="7719" rotateimage="1"/>
  <hp:renderingInfo>
    <hp:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hp:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hp:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:img binaryItemIDRef="image1" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
  <hp:lineShape color="#FF0000" width="33" style="DOT" endCap="FLAT" headStyle="NORMAL"
    tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL"
    outlineStyle="OUTER" alpha="0"/>
  <hp:imgRect>
    <hp:pt0 x="0" y="0"/>
    <hp:pt1 x="13800" y="0"/>
    <hp:pt2 x="13800" y="15438"/>
    <hp:pt3 x="0" y="15438"/>
  </hp:imgRect>
  <hp:imgClip left="0" right="45060" top="0" bottom="50400"/>
  <hp:inMargin left="0" right="0" top="0" bottom="0"/>
  <hp:imgDim dimwidth="45060" dimheight="50400"/>
  <hp:effects/>
  <hp:sz width="13800" widthRelTo="ABSOLUTE" height="15438" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="33960" horzOffset="11910"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:shapeComment>그림입니다.</hp:shapeComment>
</hp:pic>
```

#### 10.9.6.2 테두리선 모양 -- `<lineShape>`

**표 220 -- lineShape 요소**

| 속성 이름 | 설명 |
|---|---|
| color | 선 색상 |
| width | 선 굵기. 단위는 HWPUNIT |
| style | 선 종류 |
| endCap | 선끝 모양 |
| headStyle | 화살표 시작 모양 |
| tailStyle | 화살표 끝 모양 |
| headfill | 화살표 시작점 선색상으로 채우기 여부 |
| tailfill | 화살표 끝점 선색상으로 채우기 여부 |
| headSz | 화살표 시작 크기 |
| tailSz | 화살표 끝 크기 |
| outlineStyle | 테두리선의 형태 |
| alpha | 투명도 |

```xml
<hp:lineShape color="#141313" width="6" style="SOLID" endCap="FLAT" headStyle="NORMAL"
  tailStyle="NORMAL" headfill="1" tailfill="1" headSz="SMALL_SMALL" tailSz="SMALL_SMALL"
  outlineStyle="INNER" alpha="127"/>
```

#### 10.9.6.3 이미지 좌표 정보

##### 10.9.6.3.1 이미지 좌표 -- `<imgRect>`

그림의 좌표 정보를 가지고 있는 요소이다.

**표 221 -- imgRect 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| pt0 | 첫 번째 좌표 (10.9.6.3.2 참조) |
| pt1 | 두 번째 좌표 (10.9.6.3.2 참조) |
| pt2 | 세 번째 좌표 (10.9.6.3.2 참조) |
| pt3 | 네 번째 좌표 (10.9.6.3.2 참조) |

##### 10.9.6.3.2 점 요소 형식 -- `[PointType]`

좌표 정보를 표현할 때 사용하는 요소로, 2축 좌표계를 사용한다.

**표 222 -- PointType 요소**

| 속성 이름 | 설명 |
|---|---|
| x | x 좌표 |
| y | y 좌표 |

```xml
<hp:imgRect>
  <hp:pt0 x="0" y="0"/>
  <hp:pt1 x="14112" y="0"/>
  <hp:pt2 x="14112" y="7938"/>
  <hp:pt3 x="0" y="7938"/>
</hp:imgRect>
```

#### 10.9.6.4 이미지 자르기 정보 -- `<imgClip>`

원본 그림을 기준으로 자를 영역 정보를 가지고 있는 요소이다. 자르기 정보가 설정되면, 그림은 논리적으로 원본 그림에서 해당 영역만큼 잘리게 되고, 화면에서는 남은 영역만 표시된다.

**표 223 -- imgClip 요소**

| 속성 이름 | 설명 |
|---|---|
| left | 왼쪽에서 이미지를 자른 크기 |
| right | 오른쪽에서 이미지를 자른 크기 |
| top | 위쪽에서 이미지를 자른 크기 |
| bottom | 아래쪽에서 이미지를 자른 크기 |

```xml
<hp:imgClip left="0" right="96000" top="0" bottom="54000"/>
```

#### 10.9.6.5 이미지 효과 정보

##### 10.9.6.5.1 이미지 효과 -- `<effects>`

**표 224 -- effects 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| shadow | 그림자 효과 |
| glow | 네온 효과 |
| softEdge | 부드러운 가장자리 효과 |
| reflection | 반사 효과 |

##### 10.9.6.5.2 그림자 효과 -- `<shadow>`

**표 225 -- shadow 요소**

| 속성 이름 | 설명 |
|---|---|
| style | 그림자 스타일 |
| alpha | 시작 투명도 |
| radius | 흐릿함 정도 |
| direction | 방향 각도 |
| distance | 대상과 그림자 사이의 거리 |
| alignStyle | 그림자 정렬 |
| rotationStyle | 도형과 함께 그림자 회전 여부 |

**표 226 -- shadow 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| skew | 기울기 |
| scale | 확대 비율 |
| effectsColor | 그림자 색상 |

```xml
<hp:shadow style="OUTSIDE" alpha="0.5" radius="600" direction="30" distance="600"
  alignStyle="CENTER" rotationStyle="0">
  <hp:skew x="15" y="0"/>
  <hp:scale x="1" y="1"/>
  <hp:effectsColor type="RGB" schemeIdx="-1" systemIdx="-1" presetIdx="-1">
    <hp:rgb r="0" g="0" b="0"/>
  </hp:effectsColor>
</hp:shadow>
```

**기울기 각도 -- `<skew>`**

**표 227 -- skew 요소**

| 속성 이름 | 설명 |
|---|---|
| x | x축 기울기 각도 |
| y | y축 기울기 각도 |

```xml
<hp:skew x="30" y="0"/>
```

**확대 비율 -- `<scale>`**

**표 228 -- scale 요소**

| 속성 이름 | 설명 |
|---|---|
| x | x축 확대 비율 |
| y | y축 확대 비율 |

```xml
<hp:scale x="1" y="1.2"/>
```

**색상 정보 -- `<effectsColor>`**

**표 229 -- effectsColor 요소**

| 속성 이름 | 설명 |
|---|---|
| type | 색상 표현 방법 |
| schemaIndex | Scheme Index |
| systemIndex | System Index |
| presetIndex | Preset Index |

**표 230 -- effectsColor 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| rgb | RGB 색상 표현. 속성으로 r, g, b 가짐. 모두 0 이상 정수 |
| cmyk | CMYK 색상 표현. 속성으로 c, m, y, k 가짐. 모두 0 이상 정수 |
| scheme | Scheme 색상 표현. 속성으로 r, g, b 가짐. 모두 0 이상 정수 |
| system | System 색상 표현. 속성으로 h, s, l 가짐. 모두 0 이상 정수 |
| effect | 색상 효과 |

```xml
<hp:effectsColor type="RGB" schemeIdx="-1" systemIdx="-1" presetIdx="-1">
  <hp:rgb r="255" g="215" b="0"/>
</hp:effectsColor>
```

**색상 효과 -- `<effect>`**

**표 231 -- effect 요소**

| 속성 이름 | 설명 |
|---|---|
| type | 색상 효과 종류 |
| value | 효과 적용에 필요한 수치 |

**표 232 -- 색상 효과 종류 1**

| 이름 | 값의 범위 | 기본 값 | 설명 |
|---|---|---|---|
| ALPHA | 0.0 ~ 1.0 | 1.0 | 투명도. 1.0이면 불투명 |
| ALPHA_MOD | 0.0 ~ 1.0 | 1.0 | 투명도 조절 값. "색상 정보 투명도 * ALPHA_MOD"로 계산 |
| ALPHA_OFF | 정수형 | 0 | 투명도 오프셋. "색상 정보 투명도 + ALPHA_OFF"로 계산 |
| RED | 0.0 ~ 1.0 | 1.0 | RGB 값 중 red 값 |
| RED_MOD | 0.0 ~ 1.0 | 1.0 | red 조절 값. "R채널 * RED_MOD"로 계산 |
| RED_OFF | 정수형 | 0 | red 오프셋. "R채널 + RED_OFF"로 계산 |
| GREEN | 0.0 ~ 1.0 | 1.0 | RGB 값 중 green 값 |
| GREEN_MOD | 0.0 ~ 1.0 | 1.0 | green 조절 값. "G채널 * GREEN_MOD"로 계산 |
| GREEN_OFF | 정수형 | 0 | green 오프셋. "G채널 + GREEN_OFF"로 계산 |
| BLUE | 0.0 ~ 1.0 | 1.0 | RGB 값 중 blue 값 |
| BLUE_MOD | 0.0 ~ 1.0 | 1.0 | blue 조절 값. "B채널 * BLUE_MOD"로 계산 |

**표 233 -- 색상 효과 종류 2**

| 이름 | 값의 범위 | 기본 값 | 설명 |
|---|---|---|---|
| BLUE_OFF | 정수형 | 0 | blue 오프셋. "B채널 + BLUE_OFF"로 계산 |
| HUE | 0 ~ 359 | - | HSI 컬러 모델에서 색조값을 HUE로 설정 |
| HUE_MOD | 0.0 ~ 1.0 | 1.0 | HSI 컬러 모델에서 색조값을 HUE_MOD만큼 조정 |
| HUE_OFF | -16000 ~ 16000 | 0 | HSI 컬러 모델에서 색조값을 HUE_OFF만큼 조정 |
| SAT | 0.0 ~ 1.0 | - | HSI 컬러 모델에서 채도값을 SAT로 설정 |
| SAT_MOD | 0.0 ~ 1.0 | 1.0 | HSI 컬러 모델에서 채도값을 SAT_MOD만큼 조정 |
| SAT_OFF | - | - | HSI 컬러 모델에서 채도값을 SAT_OFF만큼 조정 |
| LUM | 0.0 ~ 1.0 | - | HSI 컬러 모델에서 명도값을 LUM로 설정 |
| LUM_MOD | 0.0 ~ 1.0 | 1.0 | HSI 컬러 모델에서 명도값을 LUM_MOD만큼 조정 |
| LUM_OFF | 0.0 ~ 1.0 | 0 | HSI 컬러 모델에서 명도값을 LUM_OFF만큼 조정 |
| SHADE | - | 1 | Color의 색상에 SHADE만큼 어둡게 함. 1이면 변화 없음 |
| TINT | - | 1 | Color의 색상에 TINT만큼 밝게 함. 1이면 변화 없음 |
| GRAY | 0 또는 1 | - | 색상을 Gray scale로 바꿈 |
| COMP | 0 또는 1 | - | 색상을 보색으로 바꿈 |
| GAMMA | - | - | Gamma shift transform을 적용. 감마값 = 1/2.2 |
| INV_GAMMA | - | - | Inverse Gamma shift transform을 적용. 감마값 = 2.2 |
| INV | - | - | 색상을 반전시킴 |

##### 10.9.6.5.3 네온 효과 -- `<glow>`

**표 234 -- glow 요소**

| 속성 이름 | 설명 |
|---|---|
| alpha | 투명도 |
| radius | 네온 크기. 단위는 HWPUNIT |

**표 235 -- glow 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| effectsColor | 네온 색상 (10.9.6.5.2 참조) |

```xml
<hp:glow alpha="0.5" radius="1000">
  <hp:effectsColor type="RGB" schemeIdx="-1" systemIdx="-1" presetIdx="-1">
    <hp:rgb r="178" g="178" b="178"/>
    <hp:effect type="SAT_MOD" value="1.75"/>
  </hp:effectsColor>
</hp:glow>
```

##### 10.9.6.5.4 부드러운 가장자리 효과 -- `<softEdge>`

**표 236 -- softEdge 요소**

| 속성 이름 | 설명 |
|---|---|
| radius | 부드러운 가장자리 크기. 단위는 HWPUNIT |

```xml
<hp:softEdge radius="500"/>
```

##### 10.9.6.5.5 반사 효과 -- `<reflection>`

**표 237 -- reflection 요소**

| 속성 이름 | 설명 |
|---|---|
| alignStyle | 반사된 그림 위치 |
| radius | 흐릿한 정도. 단위는 HWPUNIT |
| direction | 반사된 그림 방향 각도 |
| distance | 대상과 반사된 그림 사이의 거리. 단위는 HWPUNIT |
| rotationStyle | 도형과 함께 회전할 것인지 여부 |
| fadeDirection | 오프셋 방향 |

**표 238 -- reflection 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| skew | 기울기 (10.9.6.5.2 참조) |
| scale | 확대 비율 (10.9.6.5.2 참조) |
| alpha | 투명도 |
| pos | 위치 |

```xml
<hp:reflection alignStyle="BOTTOM_LEFT" radius="50" direction="90" distance="400"
  rotationStyle="0" fadeDirection="90">
  <hp:skew x="0" y="0"/>
  <hp:scale x="1" y="0"/>
  <hp:alpha start="0.5" end="0.997"/>
  <hp:pos start="0" end="0.75"/>
</hp:reflection>
```

**투명도 설정 -- `<alpha>`**

**표 239 -- alpha 요소**

| 속성 이름 | 설명 |
|---|---|
| start | 시작 위치 투명도 |
| end | 끝 위치 투명도 |

```xml
<hp:alpha start="0.5" end="0.997"/>
```

**반사 효과 위치 설정 -- `<pos>`**

**표 240 -- pos 요소**

| 속성 이름 | 설명 |
|---|---|
| start | 시작 위치 |
| end | 끝 위치 |

```xml
<hp:pos start="0" end="0.75"/>
```

#### 10.9.6.6 이미지 원본 정보 -- `<imgDim>`

**표 241 -- imgDim 요소**

| 속성 이름 | 설명 |
|---|---|
| dimwidth | 원본 너비 |
| dimheight | 원본 높이 |

```xml
<hp:imgDim dimwidth="96000" dimheight="54000"/>
```

### 10.9.7 ole 요소

#### 10.9.7.1 ole

`<ole>` 요소는 `[AbstractShapeComponentType]`을 상속받는다.

**표 242 -- ole 요소**

| 속성 이름 | 설명 |
|---|---|
| objectType | OLE 객체 종류 |
| binaryItemIDRef | OLE 객체 바이너리 데이터에 대한 아이디 참조값 |
| hasMoniker | moniker가 설정되어 있는지 여부 |
| drawAspect | 화면에 어떤 형태로 표시될지에 대한 설정 |
| eqBaseLine | 베이스 라인 |

**표 243 -- ole 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| extent | 오브젝트 자체의 extent 크기 |
| lineShape | 테두리선 모양 |

```xml
<hp:ole id="1790881811" zOrder="3" numberingType="PICTURE" textWrap="SQUARE"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="717139988" objectType="EMBEDDED" binaryItemIDRef="ole2" hasMoniker="0"
  drawAspect="CONTENT" eqBaseLine="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="14176" height="14176"/>
  <hp:curSz width="0" height="0"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="7088" centerY="7088" rotateimage="1"/>
  <hp:renderingInfo>
    <hp:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hp:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hp:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:extent x="14176" y="14176"/>
  <hp:lineShape color="#0000FF" width="1133" style="DASH_DOT" endCap="ROUND"
    headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0"
    headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="OUTER" alpha="0"/>
  <hp:sz width="14176" widthRelTo="ABSOLUTE" height="14176" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:shapeComment>OLE 개체입니다. 개체 형식은 Bitmap Image입니다.</hp:shapeComment>
</hp:ole>
```

#### 10.9.7.2 extent 요소

OLE 객체의 확장 크기 정보를 가지고 있는 요소이다.

**표 244 -- extent 요소**

| 속성 이름 | 설명 |
|---|---|
| x | 오브젝트 자체의 extent x 크기 |
| y | 오브젝트 자체의 extent y 크기 |

```xml
<hp:extent x="14176" y="14176"/>
```

### 10.9.8 container 요소

`<container>` 요소는 `[AbstractShapeComponentType]`을 상속받는다.

`<container>` 요소는 다른 도형 객체를 묶기 위해서 사용되는 객체이다. `<container>` 요소로 묶을 수 있는 객체에는 컨테이너 객체 자신과, 선, 사각형, 타원, 호, 다각형, 곡선, 연결선과 같은 그리기 객체, 그림, OLE 객체가 있다.

**표 245 -- container 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| container | 컨테이너 객체 |
| line | 그리기 객체 -- 선 |
| rect | 그리기 객체 -- 사각형 |
| ellipse | 그리기 객체 -- 타원 |
| arc | 그리기 객체 -- 호 |
| polygon | 그리기 객체 -- 다각형 |
| curve | 그리기 객체 -- 곡선 |
| connectLine | 그리기 객체 -- 연결선 |
| pic | 그림 |
| ole | OLE 객체 |

```xml
<hp:container id="1615476006" zOrder="1" numberingType="PICTURE"
  textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"
  href="" groupLevel="0" instid="541734183">
  <hp:sz width="31160" widthRelTo="ABSOLUTE" height="12660" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="10540" horzOffset="11734"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:caption side="BOTTOM" fullSz="0" width="8504" gap="850" lastWidth="31160">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP"
      linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
      hasTextRef="0" hasNumRef="0">
      <hp:p id="0" paraPrIDRef="19" styleIDRef="21" pageBreak="0" columnBreak="0" merged="0">
        <hp:run charPrIDRef="7">
          <hp:t>ShapeCompContainer</hp:t>
        </hp:run>
      </hp:p>
    </hp:subList>
  </hp:caption>
  <hp:shapeComment>묶음 개체입니다.</hp:shapeComment>
  ......
  <hp:rect id="2" zOrder="0" numberingType="NONE" textWrap="TOP_AND_BOTTOM"
    textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="1"
    instid="541734179" ratio="20">
    ......
  </hp:rect>
  <hp:ellipse id="7602208" zOrder="0" numberingType="NONE" textWrap="TOP_AND_BOTTOM"
    textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="1"
    instid="541734181" intervalDirty="0" hasArcPr="0" arcType="NORMAL">
    ......
  </hp:ellipse>
</hp:container>
```

### 10.9.9 chart 요소

`<chart>` 요소는 10.9.2를 상속받는다. `<chartIDRef>`는 차트 데이터에 대한 아이디 참조값으로 차트에 대한 xml 데이터는 OOXML의 형식을 사용하며 Chart/chart.xml (8.2 참조)에 기입된다.

**표 246 -- chart 요소**

| 속성 이름 | 설명 |
|---|---|
| chartIDRef | 차트 데이터에 대한 아이디 참조값 |
| version | 차트 버전 |

```xml
<hp:chart id="1811647071" zOrder="6" numberingType="PICTURE" textWrap="SQUARE"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" chartIDRef="Chart/chart1.xml">
  <hp:sz width="32250" widthRelTo="ABSOLUTE" height="18750" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:chart>
```

---

## 10.10 그리기 객체

### 10.10.1 그리기 객체

그리기 객체는 연결선, 사각형, 원 등과 같은 기본 도형 객체보다 더 구체화된 도형 객체이다. 그리기 객체는 기본 도형 객체의 공통 속성을 모두 상속받으며 그리기 객체만을 위한 속성을 추가적으로 더 정의해서 사용한다.

### 10.10.2 AbstractDrawingObjectType

#### 10.10.2.1 AbstractDrawingObjectType

`[AbstractDrawingObjectType]`은 그리기 객체의 기본 속성을 정의하고 있는 요소 형식이다. `[AbstractDrawingObjectType]`은 `[AbstractShapeComponentType]`을 기본 형식으로 가지고 추가적으로 필요한 속성이나 요소를 확장한다. 추상 형식이므로 `[AbstractDrawingObjectType]`만으로는 XML 요소를 생성할 수 없다.

**표 247 -- AbstractDrawingObjectType 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| lineShape | 그리기 객체의 테두리선 정보 (10.9.6.2 참조) |
| fillBrush | 그리기 객체의 채우기 정보 |
| drawText | 그리기 객체 글상자용 텍스트 |
| shadow | 그리기 객체의 그림자 정보 |

```xml
<hp:lineShape color="#000000" width="33" style="SOLID" endCap="FLAT" headStyle="NORMAL"
  tailStyle="NORMAL" headfill="1" tailfill="1" headSz="MEDIUM_MEDIUM" tailSz="MEDIUM_MEDIUM"
  outlineStyle="NORMAL" alpha="0"/>
<hp:fillBrush>
  <hc:winBrush faceColor="#FFFFFF" hatchColor="#000000" alpha="0"/>
</hp:fillBrush>
<hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
<hp:drawText lastWidth="34260" name="" editable="0">
```

#### 10.10.2.2 채우기 정보

##### 10.10.2.2.1 채우기 -- `<fillBrush>`

그리기 객체에서 객체의 면 영역에서 사용될 채우기 효과 정보를 가지고 있는 요소이다.

**표 248 -- fillBrush 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| winBrush | 면 채우기 |
| gradation | 그러데이션 효과 |
| imgBrush | 그림으로 채우기 |

##### 10.10.2.2.2 면 채우기 정보 -- `<winBrush>`

채우기 효과 중 단색 또는 무늬가 입혀진 단색으로 채우는 효과 정보를 가지고 있는 요소이다.

**표 249 -- winBrush 요소**

| 속성 이름 | 설명 |
|---|---|
| faceColor | 면 색 |
| hatchColor | 무늬 색 |
| hatchStyle | 무늬 종류 |
| alpha | 투명도 |

##### 10.10.2.2.3 그러데이션 효과 정보 -- `<gradation>`

한 색상에서 다른 색상으로 점진적 또는 단계적으로 변화하는 기법을 표현하기 위한 요소이다.

**표 250 -- gradation 요소**

| 속성 이름 | 설명 |
|---|---|
| type | 그러데이션 유형 |
| angle | 그러데이션 기울기(시작각) |
| centerX | 그러데이션 가로 중심(중심 X 좌표) |
| centerY | 그러데이션 세로 중심(중심 Y 좌표) |
| step | 그러데이션 번짐 정도 (0 ~ 255) |
| colorNum | 그러데이션 색상 수 |
| stepCenter | 그러데이션 번짐 정도의 중심 (0 ~ 100) |
| alpha | 투명도 |

**표 251 -- gradation 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| color | 그러데이션 색상 |

**그러데이션 색상 -- `<color>`**

**표 252 -- color 요소**

| 속성 이름 | 설명 |
|---|---|
| value | 색상값 |

##### 10.10.2.2.4 그림으로 채우기 정보 -- `<imgBrush>`

그림으로 특정 부분을 채울 때 사용되는 요소로, 지정된 그림을 지정된 효과를 사용해서 채운다. 사용할 수 있는 효과에는 '크기에 맞추어', '위로/가운데로/아래로', '바둑판식으로' 등이 있다.

**표 253 -- imgBrush 요소**

| 속성 이름 | 설명 |
|---|---|
| mode | 채우기 유형 |

**표 254 -- imgBrush 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| img | 그림 정보 (9.3.3.2.4의 img 요소 참조) |

#### 10.10.2.3 그리기 객체 글상자용 텍스트

##### 10.10.2.3.1 글상자용 텍스트 -- `<drawText>`

그리기 객체 안쪽 또는 특정 영역에 표시되는 글상자 내용을 가지고 있는 요소이다.

**표 255 -- drawText 요소**

| 속성 이름 | 설명 |
|---|---|
| lastWidth | 텍스트 문자열의 최대 폭. 단위는 HWPUNIT |
| name | 글상자 이름 |
| editable | 편집 가능 여부 |

**표 256 -- drawText 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| textMargin | 글상자 텍스트 여백 |
| subList | 글상자 텍스트 (11.1.2 참조) |

```xml
<hp:drawText lastWidth="12540" name="" editable="0">
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER"
    linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
    hasTextRef="0" hasNumRef="0">
    <hp:p id="0" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
      <hp:run charPrIDRef="8">
        <hp:t>Rectangle</hp:t>
      </hp:run>
    </hp:p>
  </hp:subList>
  <hp:textMargin left="283" right="283" top="283" bottom="283"/>
</hp:drawText>
```

##### 10.10.2.3.2 글상자 텍스트 여백 -- `<textMargin>`

`<textMargin>` 요소는 `[MarginAttributeGroup]`을 속성으로 포함한다.

**표 257 -- textMargin 요소**

| 속성 이름 | 설명 |
|---|---|
| [MarginAttributeGroup] | 10.6.6.2 참조 |

```xml
<hp:textMargin left="283" right="283" top="283" bottom="283"/>
```

#### 10.10.2.4 그리기 객체의 그림자 정보 -- `<shadow>`

**표 258 -- shadow 요소**

| 속성 이름 | 설명 |
|---|---|
| type | 그림자 종류 |
| color | 그림자 색 |
| offsetX | 그림자 간격 x. 단위는 % |
| offsetY | 그림자 간격 y. 단위는 % |
| alpha | 투명도 |

```xml
<hp:shadow type="PARELLEL_RIGHTBOTTOM" color="#B2B2B2" offsetX="1000" offsetY="500" alpha="0"/>
```

### 10.10.3 그리기 객체 -- 선 (`<line>`)

`<line>` 요소는 `[AbstractDrawingObjectType]`을 상속받는다.

**표 259 -- line 요소**

| 속성 이름 | 설명 |
|---|---|
| isReverseHV | 처음 생성 시 수직선 또는 수평선일 때, 선의 방향이 언제나 오른쪽(위쪽)으로 잡힘으로 인한 현상 때문에 방향을 바로 잡아주기 위한 속성 |

**표 260 -- line 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| startPt | 시작점 (10.9.6.3.2 참조) |
| endPt | 끝점 (10.9.6.3.2 참조) |

```xml
<hp:line id="1480891240" zOrder="1" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="407149417" isReverseHV="0">
  ......
  <hp:startPt x="0" y="0"/>
  <hp:endPt x="4686" y="9102"/>
</hp:line>
```

### 10.10.4 그리기 객체 -- 사각형 (`<rect>`)

`<rect>` 요소는 `[AbstractDrawingObjectType]`을 상속받는다.

**표 261 -- rect 요소**

| 속성 이름 | 설명 |
|---|---|
| ratio | 사각형 모서리 곡률. 단위는 %. 직각은 0, 둥근 모양은 20, 반원은 50 등 |

**표 262 -- rect 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| pt0 | 첫 번째 좌표 (10.9.6.3.2 참조) |
| pt1 | 두 번째 좌표 (10.9.6.3.2 참조) |
| pt2 | 세 번째 좌표 (10.9.6.3.2 참조) |
| pt3 | 네 번째 좌표 (10.9.6.3.2 참조) |

```xml
<hp:rect id="1480891242" zOrder="2" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="407149419" ratio="0">
  ......
  <hp:pt0 x="0" y="0"/>
  <hp:pt1 x="12838" y="0"/>
  <hp:pt2 x="12838" y="9306"/>
  <hp:pt3 x="0" y="9306"/>
</hp:rect>
```

### 10.10.5 그리기 객체 -- 타원 (`<ellipse>`)

`<ellipse>` 요소는 `[AbstractDrawingObjectType]`을 상속받는다.

**표 263 -- ellipse 요소**

| 속성 이름 | 설명 |
|---|---|
| intervalDirty | 호(arc)로 바뀌었을 때, interval을 다시 계산해야 할 필요가 있는지 여부. interval: 원 위에 존재하는 두 점 사이의 거리 |
| hasArcProperty | 호로 바뀌었는지 여부 |
| arcType | 호의 종류. NORMAL: 호, PIE: 부채꼴, CHORD: 활 |

**표 264 -- ellipse 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| center | 중심 좌표 (10.9.6.3.2 참조) |
| ax1 | 제1축 좌표 (10.9.6.3.2 참조) |
| ax2 | 제2축 좌표 (10.9.6.3.2 참조) |
| start1 | 시작 지점 1 좌표 (10.9.6.3.2 참조) |
| end1 | 시작 지점 2 좌표 (10.9.6.3.2 참조) |
| start2 | 끝 지점 1 좌표 (10.9.6.3.2 참조) |
| end2 | 끝 지점 2 좌표 (10.9.6.3.2 참조) |

```xml
<hp:ellipse id="1480891244" zOrder="3" numberingType="PICTURE"
  textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"
  href="" groupLevel="0" instid="407149421" intervalDirty="0" hasArcPr="0"
  arcType="NORMAL">
  ......
  <hp:center x="4925" y="3973"/>
  <hp:ax1 x="9850" y="3973"/>
  <hp:ax2 x="4925" y="0"/>
  <hp:start1 x="0" y="1337540795"/>
  <hp:end1 x="1144072527" y="-1432413552"/>
  <hp:start2 x="-1105998402" y="100663296"/>
  <hp:end2 x="393344" y="2"/>
</hp:ellipse>
```

### 10.10.6 그리기 객체 -- 호 (`<arc>`)

`<arc>` 요소는 `[AbstractDrawingObjectType]`을 상속받는다.

**표 265 -- arc 요소**

| 속성 이름 | 설명 |
|---|---|
| type | 호의 종류. NORMAL: 호, PIE: 부채꼴, CHORD: 활 |

**표 266 -- arc 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| center | 중심 좌표 (10.9.6.3.2 참조) |
| ax1 | 제1축 좌표 (10.9.6.3.2 참조) |
| ax2 | 제2축 좌표 (10.9.6.3.2 참조) |

```xml
<hp:arc id="1480891246" zOrder="4" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="407149423" type="NORMAL">
  ......
  <hp:center x="0" y="0"/>
  <hp:ax1 x="0" y="9645"/>
  <hp:ax2 x="11411" y="0"/>
</hp:arc>
```

### 10.10.7 그리기 객체 -- 다각형 (`<polygon>`)

`<polygon>` 요소는 `[AbstractDrawingObjectType]`을 상속받는다.

**표 267 -- polygon 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| pt | 다각형 좌표 (10.9.6.3.2 참조) |

```xml
<hp:polygon id="1480891248" zOrder="5" numberingType="PICTURE"
  textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"
  href="" groupLevel="0" instid="407149425">
  ......
  <hp:pt x="3261" y="0"/>
  <hp:pt x="0" y="3872"/>
  <hp:pt x="3329" y="7744"/>
  <hp:pt x="11547" y="7540"/>
  <hp:pt x="11427" y="204"/>
  <hp:pt x="3261" y="0"/>
</hp:polygon>
```

### 10.10.8 그리기 객체 -- 곡선 (`<curve>`)

#### 10.10.8.1 곡선

`<curve>` 요소는 `[AbstractDrawingObjectType]`을 상속받는다.

**표 268 -- curve 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| seg | 곡선 세그먼트 |

```xml
<hp:curve id="1480891254" zOrder="6" numberingType="PICTURE"
  textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"
  href="" groupLevel="0" instid="407149431">
  ......
  <hp:seg type="CURVE" x1="274" y1="1485" x2="1429" y2="10859"/>
  <hp:seg type="CURVE" x1="1429" y1="10859" x2="3263" y2="8821"/>
  <hp:seg type="CURVE" x1="3263" y1="8821" x2="5233" y2="11199"/>
  <hp:seg type="CURVE" x1="5233" y1="11199" x2="5980" y2="1010"/>
  <hp:seg type="CURVE" x1="5980" y1="1010" x2="274" y2="1485"/>
</hp:curve>
```

#### 10.10.8.2 곡선 세그먼트 -- `<seg>`

그리기 객체 중 곡선을 표현할 때 곡선의 단위 곡선의 시작점 및 끝점을 표현하기 위한 요소이다.

**표 269 -- seg 요소**

| 속성 이름 | 설명 |
|---|---|
| type | 곡선 세그먼트 형식. CURVE: 곡선, LINE: 직선 |
| x1 | 곡선 세그먼트 시작점 x 좌표 |
| y1 | 곡선 세그먼트 시작점 y 좌표 |
| x2 | 곡선 세그먼트 끝점 x 좌표 |
| y2 | 곡선 세그먼트 끝점 y 좌표 |

```xml
<hp:seg type="CURVE" x1="274" y1="1485" x2="1429" y2="10859"/>
```

### 10.10.9 그리기 객체 -- 연결선 (`<connectLine>`)

#### 10.10.9.1 연결선

`<connectLine>` 요소는 `[AbstractDrawingObjectType]`을 상속받는다.

**표 270 -- connectLine 요소**

| 속성 이름 | 설명 |
|---|---|
| type | 연결선 형식 |

**표 271 -- connectLine 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| startPt | 연결선 시작점 정보 |
| endPt | 연결선 끝점 정보 |
| controlPoints | 연결선 조절점 정보 |

```xml
<hp:connectLine id="1480891256" zOrder="7" numberingType="PICTURE"
  textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"
  href="" groupLevel="0" instid="407149433" type="STRAIGHT_NOARROW">
  ......
  <hp:startPt x="10" y="4154" subjectIDRef="407149431" subjectIdx="0"/>
  <hp:endPt x="0" y="0" subjectIDRef="407149421" subjectIdx="2"/>
  <hp:controlPoints>
    <hp:point x="0" y="4144" type="3"/>
    <hp:point x="0" y="0" type="26"/>
  </hp:controlPoints>
</hp:connectLine>
```

#### 10.10.9.2 연결선 연결점 정보 -- `[ConnectPointType]`

`[ConnectPointType]`은 `[PointType]`을 기본 형식으로 가지고 추가적으로 필요한 속성이나 요소를 확장한다.

**표 272 -- ConnectPointType 요소**

| 속성 이름 | 설명 |
|---|---|
| subjectIDRef | 시작/끝부분과 연결되는 대상의 아이디 참조값 |
| subjectIdx | 시작/끝부분과 연결되는 대상의 연결점 index |

```xml
<hp:startPt x="0" y="0" subjectIDRef="0" subjectIdx="0"/>
<hp:endPt x="15402" y="10581" subjectIDRef="0" subjectIdx="0"/>
```

#### 10.10.9.3 연결선 조절점 정보 -- `[ConnectControlPointType]`

`[ConnectControlPointType]`은 `[PointType]`을 기본 형식으로 가지고 추가적으로 필요한 속성이나 요소를 확장한다.

**표 273 -- ConnectControlPointType 속성**

| 속성 이름 | 설명 |
|---|---|
| type | 조절점 종류 |

**표 274 -- type 값**

| type 값 | 설명 |
|---|---|
| 0x00000001 | 시작점 |
| 0x00000002 | 직선 |
| 0x00000018 | 끝점 |

```xml
<hp:controlPoints>
  <hp:point x="2446" y="0" type="3"/>
  <hp:point x="2446" y="2207" type="2"/>
  <hp:point x="0" y="2207" type="2"/>
  <hp:point x="0" y="7035" type="26"/>
</hp:controlPoints>
```

---

## 10.11 양식 객체

### 10.11.1 AbstractFormObjectType

#### 10.11.1.1 AbstractFormObjectType

`[AbstractFormObjectType]`은 양식 객체의 공통 속성을 정의한다. `[AbstractFormObjectType]`은 `[AbstractShapeObjectType]`을 기본 형식으로 가지고 추가적으로 필요한 속성이나 요소를 확장한다. 추상 형식이므로 `[AbstractFormObjectType]`만으로는 XML 요소를 생성할 수 없다.

**표 275 -- AbstractFormObjectType 요소**

| 속성 이름 | 설명 |
|---|---|
| name | 이름 |
| foreColor | 전경색 |
| backColor | 배경색 |
| groupName | 그룹 이름 |
| tabStop | 탭키로 객체들을 이동할 때 해당 객체에 머물 수 있는지를 결정하는 속성 |
| editable | 편집 가능 여부 |
| tapOrder | 탭키 이동 순서 |
| enabled | 활성화 여부 |
| borderTypeIDRef | 테두리 아이디 참조값 |
| drawFrame | 프레임 표시 가능 여부 |
| printable | 출력 가능 여부 |

**표 276 -- AbstractFormObjectType 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| formCharPr | 양식 객체의 글자 속성 |

```xml
<hp:btn caption="명령 단추1" radioGroupName="" triState="0" name="PushButton1"
  foreColor="#000000" backColor="#F0F0F0" groupName="" tabStop="1" editable="1"
  tabOrder="1" enabled="1" borderTypeIDRef="4" drawFrame="1" printable="1" command="">
  <hp:formCharPr charPrIDRef="7" followContext="0" autoSz="0" wordWrap="0"/>
  <hp:sz width="7087" widthRelTo="ABSOLUTE" height="1984" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="1133" right="1133" top="1133" bottom="1133"/>
</hp:btn>
```

#### 10.11.1.2 양식 객체의 글자 속성 -- `<formCharPr>`

양식 객체의 글자 속성 설정 정보를 가지고 있는 요소이다.

**표 277 -- formCharPr 요소**

| 속성 이름 | 설명 |
|---|---|
| charPrIDRef | 글자 모양 아이디 참조값 |
| followContext | 양식 개체가 주위의 글자 속성을 따를지 여부 |
| autoSize | 자동 크기 조절 여부 |
| wordWrap | 줄 내림 여부 |

```xml
<hp:formCharPr charPrIDRef="7" followContext="0" autoSz="0" wordWrap="0"/>
```

### 10.11.2 AbstractButtonObjectType

`[AbstractButtonObjectType]`은 버튼 양식 객체의 공통 속성을 정의한다. `[AbstractButtonObjectType]`은 `[AbstractFormObjectType]`을 기본 형식으로 가지고 추가적으로 필요한 속성이나 요소를 확장한다. 추상 형식이므로 `[AbstractButtonObjectType]`만으로는 XML 요소를 생성할 수 없다.

**표 278 -- AbstractButtonObjectType 요소**

| 속성 이름 | 설명 |
|---|---|
| caption | 캡션 |
| value | 체크 상태 값 |
| radioGroupName | 라디오 버튼 그룹 이름 |
| triState | 3단 체크 상태 여부 |
| backStyle | 버튼 배경색 스타일 |

### 10.11.3 양식 객체 -- 버튼 (`<btn>`)

`<btn>` 요소는 `[AbstractButtonObjectType]`을 상속받는다.

```xml
<hp:btn caption="명령 단추1" value="UNCHECKED" radioGroupName="" triState="0"
  backStyle="TRANSPARENT" name="PushButton1" foreColor="#000000" backColor="#F0F0F0"
  groupName="" tabStop="1" tabOrder="1" enabled="1" borderTypeIDRef="4"
  drawFrame="1" printable="1">
  <hp:sz width="7087" widthRelTo="ABSOLUTE" height="1984" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:formCharPr charPrIDRef="7" followContext="0" autoSz="0" wordWrap="0"/>
</hp:btn>
```

### 10.11.4 양식 객체 -- 라디오 버튼 (`<radioBtn>`)

`<radioBtn>` 요소는 `[AbstractButtonObjectType]`을 상속받는다.

```xml
<hp:radioBtn caption="라디오 단추1" value="UNCHECKED" radioGroupName="" triState="0"
  backStyle="OPAQUE" name="RadioButton1" foreColor="#000000" backColor="#FFFFFF"
  groupName="" tabStop="1" tabOrder="4" enabled="1" borderTypeIDRef="0"
  drawFrame="1" printable="1">
  <hp:sz width="8504" widthRelTo="ABSOLUTE" height="1984" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:formCharPr charPrIDRef="7" followContext="0" autoSz="0" wordWrap="0"/>
</hp:radioBtn>
```

### 10.11.5 양식 객체 -- 체크 버튼 (`<checkBtn>`)

`<checkBtn>` 요소는 `[AbstractButtonObjectType]`을 상속받는다.

```xml
<hp:checkBtn caption="선택 상자1" value="UNCHECKED" radioGroupName="" triState="0"
  backStyle="OPAQUE" name="CheckBox1" foreColor="#000000" backColor="#FFFFFF"
  groupName="" tabStop="1" tabOrder="2" enabled="1" borderTypeIDRef="0"
  drawFrame="1" printable="1">
  <hp:sz width="9921" widthRelTo="ABSOLUTE" height="1984" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:formCharPr charPrIDRef="7" followContext="0" autoSz="0" wordWrap="0"/>
</hp:checkBtn>
```

### 10.11.6 양식 객체 -- 콤보 박스 (`<comboBox>`)

#### 10.11.6.1 콤보 박스

`<comboBox>` 요소는 `[AbstractFormObjectType]`을 상속받는다.

**표 279 -- comboBox 요소**

| 속성 이름 | 설명 |
|---|---|
| listBoxRows | 콤보 박스가 펼쳐졌을 때 최대로 보이는 줄 수 |
| listBoxWidth | 콤보 박스가 펼쳐졌을 때 최대로 보이는 넓이 |
| editEnable | 텍스트 수정 가능 여부 |
| selectedValue | 콤보 박스 아이템 중에서 선택된 값 |

**표 280 -- comboBox 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| listItem | 콤보 박스의 아이템 목록 |

```xml
<hp:comboBox listBoxRows="10" listBoxWidth="0" editEnable="1" selectedValue=""
  name="ComboBox1" foreColor="#000000" backColor="#F0F0F0" groupName="" tabStop="1"
  tabOrder="3" enabled="1" borderTypeIDRef="5" drawFrame="1" printable="1">
  <hp:sz width="9921" widthRelTo="ABSOLUTE" height="1984" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:formCharPr charPrIDRef="7" followContext="0" autoSz="0" wordWrap="0"/>
  <hp:listItem displayText="" value=""/>
</hp:comboBox>
```

#### 10.11.6.2 콤보/리스트 박스의 아이템 -- `<listItem>`

양식 객체 중 콤보 박스 및 리스트 박스에서 항목(아이템)을 표현하기 위한 객체이다.

**표 281 -- listItem 요소**

| 속성 이름 | 설명 |
|---|---|
| displayText | 화면에 표시될 아이템 내용 |
| value | 아이템이 선택되었을 때 콤보/리스트 박스가 가지는 값 |

### 10.11.7 양식 객체 -- 리스트 박스 (`<listBox>`)

`<listBox>` 요소는 `[AbstractFormObjectType]`을 상속받는다.

**표 282 -- listBox 요소**

| 속성 이름 | 설명 |
|---|---|
| selectedValue | 현재 선택된 아이템의 값 |
| itemHeight | 리스트 박스 아이템 높이 |
| topIdx | 리스트 박스에서 첫 번째로 보이는 아이템의 인덱스 |

**표 283 -- listBox 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| listItem | 리스트 박스의 아이템 목록 (10.11.6.2 참조) |

### 10.11.8 양식 객체 -- 에디트 (`<edit>`)

#### 10.11.8.1 에디트

`<edit>` 요소는 `[AbstractFormObjectType]`을 상속받는다.

**표 284 -- edit 요소**

| 속성 이름 | 설명 |
|---|---|
| multiLine | 다중 줄 허용 여부 |
| passwordChar | 에디트를 패스워드 입력으로 사용할 때, 입력한 글자 대신에 보이게 할 글자 |
| maxLength | 입력 가능한 최대 글자수 |
| scrollBars | 스크롤바 표시 여부 |
| tabKeyBehavior | 탭키를 눌렀을 때의 동작 방식. NEXT_OBJECT: 다음 객체로 이동, INSERT_TAB: 에디트 내용에 특수 글자 tab 추가 |
| numOnly | 숫자만 입력 가능하게 할 것인지 여부 |
| readOnly | 읽기 전용 여부 |
| alignText | 텍스트 좌우 정렬 방식 |

**표 285 -- edit 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| text | 에디트의 내용. 요소 값으로 텍스트 문자열을 가짐 |

```xml
<hp:edit multiLine="0" passwordChar="" maxLength="2147483647" scrollBars="NONE"
  tabKeyBehavior="NEXT_OBJECT" numOnly="0" readOnly="0" alignText="LEFT"
  name="Edit1" foreColor="#000000" backColor="#F0F0F0" groupName="" tabStop="1"
  tabOrder="5" enabled="1" borderTypeIDRef="5" drawFrame="1" printable="1">
  <hp:sz width="7087" widthRelTo="ABSOLUTE" height="1984" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:formCharPr charPrIDRef="7" followContext="0" autoSz="0" wordWrap="0"/>
  <hp:text>입력상자</hp:text>
</hp:edit>
```

#### 10.11.8.2 양식 객체 -- 스크롤바 (`<scrollBar>`)

`<scrollBar>` 요소는 `[AbstractFormObjectType]`을 상속받는다.

**표 286 -- scrollBar 요소**

| 속성 이름 | 설명 |
|---|---|
| delay | 마우스 버튼 다운 후 스크롤이 연속적으로 일어날 때까지 걸리는 시간 |
| largeChange | Page Up/Down시 변화 값 |
| smallChange | Line Up/Down시 변화 값 |
| min | 최소값 |
| max | 최대값 |
| page | 스크롤하는 1페이지의 크기 |
| value | 현재 위치 |
| type | 스크롤바 형태 (수평/수직) |

---

## 10.12 그 외의 객체들

### 10.12.1 글맵시

#### 10.12.1.1 글맵시 -- `<textart>`

글맵시는 글자를 구부리거나 글자에 외곽선, 면 채우기, 그림자, 회전 등의 효과를 주어 문자를 꾸미는 기능이다.

**표 287 -- textart 요소**

| 속성 이름 | 설명 |
|---|---|
| text | 글맵시 내용 |

**표 288 -- textart 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| pt0 | 첫 번째 좌표 (10.9.6.3.2 참조) |
| pt1 | 두 번째 좌표 (10.9.6.3.2 참조) |
| pt2 | 세 번째 좌표 (10.9.6.3.2 참조) |
| pt3 | 네 번째 좌표 (10.9.6.3.2 참조) |
| textartPr | 글맵시 모양 정보 |
| outline | 외곽선 정보 |

```xml
<hp:textart id="1790879993" zOrder="1" numberingType="PICTURE" textWrap="SQUARE"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="717138170" text="내용을 입력하세요.">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="14173" height="14173"/>
  <hp:curSz width="20500" height="5000"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="10250" centerY="2500" rotateimage="1"/>
  <hp:renderingInfo>
    <hp:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hp:scaMatrix e1="1.446412" e2="0" e3="0" e4="0" e5="0.352783" e6="0"/>
    <hp:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#000000" width="0" style="NONE" endCap="ROUND" headStyle="NORMAL"
    tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL"
    outlineStyle="INNER" alpha="0"/>
  <hp:fillBrush>
    <hc:winBrush faceColor="#0000FF" hatchColor="#000000" alpha="0"/>
  </hp:fillBrush>
  <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
  <hc:pt0 x="0" y="0"/>
  <hc:pt1 x="14173" y="0"/>
  <hc:pt2 x="14173" y="14173"/>
  <hc:pt3 x="0" y="14173"/>
  <hp:textartPr fontName="함초롬바탕" fontStyle="보통" fontType="TTF" textShape="WAVE2"
    lineSpacing="120" charSpacing="100" align="LEFT">
    <hp:shadow type="NONE" color="#000000" offsetX="0" offsetY="0" alpha="0"/>
  </hp:textartPr>
  <hp:sz width="20500" widthRelTo="ABSOLUTE" height="5000" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="56" right="56" top="0" bottom="0"/>
  <hp:shapeComment>글맵시입니다.</hp:shapeComment>
</hp:textart>
```

#### 10.12.1.2 글맵시 모양 정보 -- `<textartPr>`

글맵시 내의 글자에 적용될 효과 정보들을 가지고 있는 요소이다.

**표 289 -- textartPr 요소**

| 속성 이름 | 설명 |
|---|---|
| fontName | 글꼴 이름 |
| fontStyle | 글꼴 스타일 |
| fontType | 글꼴 형식 |
| textShape | 글맵시 모양 |
| lineSpacing | 줄 간격 |
| spacing | 글자 간격 |
| align | 정렬 방식 |

**표 290 -- textartPr 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| shadow | 그림자 설정 정보 (10.10.2.4 참조, 단 offsetX, offsetY 단위는 %) |

```xml
<hp:textartPr fontName="한컴 소망 B" fontStyle="보통" fontType="TTF"
  textShape="DEFLATE_BOTTOM" lineSpacing="120" charSpacing="100" align="LEFT">
  <hp:shadow type="NONE" color="#000000" offsetX="0" offsetY="0" alpha="0"/>
</hp:textartPr>
```

#### 10.12.1.3 글맵시 외곽선 정보 -- `<outline>`

글맵시의 외곽선에 대한 정보를 가지고 있는 요소이다.

**표 291 -- outline 요소**

| 속성 이름 | 설명 |
|---|---|
| cnt | 외곽선 포인트 개수 |

**표 292 -- outline 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| pt | 외곽선 좌표 (10.9.6.3.2 참조) |

```xml
<hp:outline cnt="1">
  <hp:pt x="500" y="421"/>
</hp:outline>
```

### 10.12.2 글자 겹침

#### 10.12.2.1 글자 겹침 -- `<compose>`

글자 겹침은 일반 글자판으로 입력할 수 없는 원 문자나 사각형 문자를 입력할 수 있게 하는 기능이다.

**표 293 -- compose 요소**

| 속성 이름 | 설명 |
|---|---|
| circleType | 테두리 형식 |
| charSz | 테두리 내부 글자의 크기 비율. 단위는 10% |
| composeType | 겹치기 종류 |
| charPrCnt | 글자 모양 개수 |

**표 -- compose 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| charPr | 겹치기 글자 모양 |

```xml
<hp:compose circleType="SHAPE_REVERSAL_CIRCLE" charSz="-3" composeType="SPREAD"
  charPrCnt="10" composeText="111122">
  <hp:charPr prIDRef="8"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
  <hp:charPr prIDRef="4294967295"/>
</hp:compose>
```

#### 10.12.2.2 겹치기 글자 모양 -- `<charPr>`

겹쳐진 글자에 적용될 글자 모양에 대한 아이디 참조값을 가지고 있는 요소이다.

**표 294 -- charPr 요소**

| 속성 이름 | 설명 |
|---|---|
| prIDRef | 글자 모양 아이디 참조값 |

```xml
<hp:charPr prIDRef="9"/>
```

### 10.12.3 덧말 -- `<dutmal>`

덧말은 글의 전개로 보아서 본문의 내용 중에 넣기는 어려우나, 본문에서 인용한 자료의 출처를 밝히거나 본문에서 언급한 내용에 대한 간단한 내용의 보충 자료를 제시할 때 본문의 아래나 또는 위에 넣는 말이다. 덧말을 사용하면 일본어의 토씨나 중국어의 발음기호 등을 손쉽게 넣을 수 있다.

**표 295 -- dutmal 요소**

| 속성 이름 | 설명 |
|---|---|
| posType | 덧말의 위치 |
| szRatio | 덧말의 크기. 단위는 % |
| option | 덧말 글자의 글자 스타일을 지정하기 위한 속성. 스타일 지정 시에 4로 고정됨. 해당 속성은 속성이 존재하지 않거나, 속성이 존재하면 4로 고정되어야 함 |
| styleIDRef | 글자 스타일 아이디 참조값 |
| align | 정렬 방법 |

**표 296 -- dutmal 하위 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| mainText | 덧말 기능의 본 내용. 요소 값으로 내용 문자열을 가짐 |
| subText | 덧말 기능의 덧말 내용. 요소 값으로 내용 문자열을 가짐 |

```xml
<hp:dutmal posType="TOP" szRatio="0" option="0" styleIDRef="0" align="CENTER">
  <hp:mainText>테스트 문서</hp:mainText>
  <hp:subText>테스트</hp:subText>
</hp:dutmal>
```

### 10.12.4 비디오 -- `<video>`

**표 297 -- video 요소**

| 속성 이름 | 설명 |
|---|---|
| videotype | 비디오 종류. Local: 컴퓨터의 동영상, Web: 인터넷 동영상 |
| fileIDRef | 로컬 비디오 바이너리 데이터에 대한 아이디 참조값 |
| imageIDRef | 비디오 폴백의 이미지에 대한 아이디 참조값 |
| tag | 웹동영상 주소. 예: `<iframe src="동영상 주소"></iframe>` |

```xml
<hp:video id="1476326878" zOrder="0" numberingType="PICTURE" textWrap="SQUARE"
  textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0"
  instid="402585055" videotype="Local" fileIDRef="video1" imageIDRef="image2" tag="">
  <hp:sz width="22500" widthRelTo="ABSOLUTE" height="15000" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0"
    holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"
    vertOffset="0" horzOffset="0"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:shapeComment>동영상입니다.</hp:shapeComment>
  ......
</hp:video>
```
