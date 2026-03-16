# 10. 본문 XML 스키마 (Part 1: 10.1 ~ 10.8)

KS X 6101:2024 HWPX/OWPML 표준 - 섹션 10 본문 XML 스키마

---

## 10.1 네임스페이스

Body XML은 기본적으로 `http://www.owpml.org/owpml/2024/body`을 기본 네임스페이스로 사용한다.
기본 네임스페이스의 접두어(prefix)는 기본적으로 `hb`를 사용한다. 잘못된 사용을 줄이기 위해서 `hb`를 기본 네임스페이스(`http://www.owpml.org/owpml/2024/body`) 이외의 네임스페이스에 사용하지 않는 것을 권고한다.

---

## 10.2 본문 개요

본문의 논리적인 구조는 **'본문-구역-문단'** 이다.

- 본문은 구역들의 목록으로 구성된다.
- 이 규격에서는 본문(Body)은 따로 존재하지 않고, 각 구역(Section)은 개별 파일로 저장된다.
- 구역은 반드시 **한 개 이상** 존재해야 하며, 한 구역은 반드시 **한 개 이상의 문단**을 가지고 있어야 한다.
- 표/글상자와 같은 특수한 경우, 문단은 다시 문단 목록을 가지고 있을 수 있다. 이 경우 문단은 여러 개의 문단 목록을 자식 요소로서 가지고 있을 수 있다.
- 문단은 실제 문서 내용이 가지고 있는 단위로, 단순 텍스트뿐만 아니라 표, 그림, 그리기 객체 등 다양한 형태의 콘텐츠를 가지고 있을 수 있다.

---

## 10.3 sec 요소

`<sec>` 요소는 내부적으로 구역에 대한 설정 정보를 가지게 되는데, 이에 대한 자세한 내용은 10.6을 참조한다.

### sec 하위 요소 (표 95)

| 하위 요소 이름 | 설명 |
|---|---|
| `p` | 문단 |

---

## 10.4 p 요소

`<p>` 요소는 HWP 문서에서 내용 표현을 위한 기본 단위이며 문단을 나타낸다.

### p 속성 (표 96)

| 속성 이름 | 설명 |
|---|---|
| `id` | 문단을 식별하기 위한 아이디 |
| `paraPrIDRef` | 문단 모양 아이디 참조값 |
| `styleIDRef` | 문단 스타일 아이디 참조값 |
| `pageBreak` | 쪽 나눔 여부 |
| `columnBreak` | 단 나눔 여부 |
| `merged` | 문단 병합 여부 |
| `paraTcId` | 문단 번호 변경 추적 아이디 |

### p 하위 요소 (표 97)

| 하위 요소 이름 | 설명 |
|---|---|
| `run` | 구역 속성 정보 |
| `metaTag` | 메타태그 관련 정보 |

### XML 예

```xml
<hp:p id="3121190098" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0"
  merged="0">
  <hp:run charPrIDRef="0">
    <hp:t>샘플 문서</hp:t>
  </hp:run>
</hp:p>
```

---

## 10.5 run 요소

`run`은 글자 속성 컨테이너를 의미한다. 하나 혹은 여러 개의 글자가 가지고 있는 동일한 속성을 나타낸다. 문서의 모든 콘텐츠와 제어 관련 요소들은 `<run>` 요소로 묶여서 구성된다.

`<run>` 요소는 크게 두 가지 형태의 자식 요소를 가진다:
1. 구역, 단, 문단의 제어에 관련된 요소들을 가지는 `<ctrl>` 요소
2. 문자열, 표, 그림 등의 실제 내용을 가지는 `<t>` 요소

### run 속성 (표 98)

| 속성 이름 | 설명 |
|---|---|
| `charPrIDRef` | 글자 모양 설정 아이디 참조값 |
| `charTcId` | 글자 모양 변경 추적 아이디 |

### run 하위 요소 (표 99)

| 하위 요소 이름 | 설명 |
|---|---|
| `secPr` | 구역 설정 정보 |
| `ctrl` | 문단 제어 정보 |
| `t` | 텍스트 문자열 |
| `tbl` | 표 |
| `pic` | 그림 |
| `container` | 묶음 객체 |
| `ole` | OLE |
| `equation` | 수식 |
| `line` | 선 |
| `rect` | 사각형 |
| `ellipse` | 호 |
| `arc` | 타원 |
| `polygon` | 다각형 |
| `curve` | 곡선 |
| `connectLine` | 연결선 |
| `textart` | 글맵시 |
| `compose` | 글자 겹침 |
| `dutmal` | 덧말 |
| `btn` | 버튼 |
| `radioBtn` | 라디오 버튼 |
| `checkBtn` | 체크 버튼 |
| `comboBox` | 콤보 박스 |
| `edit` | 에디트 |
| `listBox` | 리스트 박스 |
| `scrollBar` | 스크롤바 |
| `video` | 비디오 |
| `chart` | 차트 |

---

## 10.6 secPr 요소

### 10.6.1 구역(Section)

구역(Section)은 콘텐츠의 영역을 구분 짓는 가장 큰 단위이다. `<secPr>` 요소는 구역 내에서의 각종 설정 정보를 가지고 있는 요소이다.

### secPr 속성 (표 100)

| 속성 이름 | 설명 |
|---|---|
| `id` | 구역 정의를 식별하기 위한 아이디 |
| `textDirection` | 구역 내 텍스트 방향 |
| `spaceColumns` | 동일한 페이지에서 서로 다른 단 사이의 간격 |
| `tabStop` | 기본 탭 간격 |
| `tabStopVal` | 기본 탭 간격 (1.31 이후 버전) |
| `tabStopUnit` | 기본 탭 간격 단위 (1.31 이후 버전) |
| `outlineShapeIDRef` | 개요 번호 모양 아이디 참조값 |
| `memoShapeIDRef` | 메모 모양 아이디 참조값 |
| `textVerticalWidthHead` | 머리말/꼬리말 세로 쓰기 여부 |
| `masterPageCnt` | 구역 내에서 정의된 바탕쪽 설정의 개수 |

### secPr 하위 요소 (표 101)

| 하위 요소 이름 | 설명 |
|---|---|
| `startNum` | 구역 내 각 객체들의 시작 번호 정보 |
| `grid` | 줄맞춤 정보 |
| `visibility` | 감추기/보여주기 정보 |
| `lineNumberShape` | 줄 번호 정보 |
| `pagePr` | 용지 설정 정보 |
| `footNotePr` | 각주 모양 정보 |
| `endNotePr` | 미주 모양 정보 |
| `pageBorderFill` | 쪽 테두리/배경 정보 |
| `masterPage` | 바탕쪽 설정 정보 |
| `presentation` | 프레젠테이션 정보 |

### XML 예

```xml
<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000"
  tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0"
  textVerticalWidthHead="0" masterPageCnt="0">
  <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
  <hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
  <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0"
    border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0"
    showLineNumber="0"/>
  <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
  ......
</hp:secPr>
```

---

### 10.6.2 startNum 요소

구역 내에서 각종 시작 번호들에 대한 설정을 가지고 있는 요소이다.

#### startNum 속성 (표 102)

| 속성 이름 | 설명 |
|---|---|
| `pageStartsOn` | 구역 나눔으로 새 페이지가 생길 때 페이지 번호 적용 옵션 |
| `page` | 쪽 시작 번호. 값이 0이면 앞 구역에 이어서 번호를 매기고, 1 이상이면 임의의 번호로 시작 |
| `pic` | 그림 시작 번호. 값이 0이면 앞 구역에 이어서 번호를 매기고, 1 이상이면 임의의 번호로 시작 |
| `tbl` | 표 시작 번호. 값이 0이면 앞 구역에 이어서 번호를 매기고, 1 이상이면 임의의 번호로 시작 |
| `equation` | 수식 시작 번호. 값이 0이면 앞 구역에 이어서 번호를 매기고, 1 이상이면 임의의 번호로 시작 |

#### XML 예

```xml
<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
```

---

### 10.6.3 grid 요소

구역 내의 줄맞춤 설정 정보를 표현하기 위한 요소이다.

#### grid 속성 (표 103)

| 속성 이름 | 설명 |
|---|---|
| `lineGrid` | 세로로 줄맞춤을 할지 여부 |
| `charGrid` | 가로로 줄맞춤을 할지 여부 |

#### XML 예

```xml
<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
```

---

### 10.6.4 visibility 요소

구역 내의 각 요소들에 대한 보여주기/감추기 설정 정보를 표현하기 위한 요소이다.

#### visibility 속성 (표 104)

| 속성 이름 | 설명 |
|---|---|
| `hideFirstHeader` | 첫 쪽에만 머리말 감추기 여부 |
| `hideFirstFooter` | 첫 쪽에만 꼬리말 감추기 여부 |
| `hideFirstMasterPage` | 첫 쪽에만 바탕쪽 감추기 여부 |
| `border` | 테두리 감추기/보여주기 여부 (첫 쪽에만 감추기, 첫 쪽에만 보여주기, 모두 보여주기) |
| `fill` | 배경 감추기/보여주기 여부 (첫 쪽에만 감추기, 첫 쪽에만 보여주기, 모두 보여주기) |
| `hideFirstPageNum` | 첫 쪽에만 쪽번호 감추기 여부 |
| `hideFirstEmptyLine` | 첫 쪽에만 빈 줄 감추기 여부 |
| `showLineNumber` | 줄 번호 표시 여부 |

#### XML 예

```xml
<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0"
  border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0"
  showLineNumber="0"/>
```

---

### 10.6.5 lineNumberShape 요소

구역 내의 줄 번호 정보를 표현하기 위한 요소이다.

#### lineNumberShape 속성 (표 105)

| 속성 이름 | 설명 |
|---|---|
| `restartType` | 줄 번호 방식 |
| `countBy` | 줄 번호 표시 간격 |
| `distance` | 본문과의 줄 번호 위치 |
| `startNumber` | 줄 번호 시작 번호 |

#### XML 예

```xml
<hp:lineNumberShape restartType="3" countBy="1" distance="2834" startNumber="1"/>
```

---

### 10.6.6 pagePr 요소

#### 10.6.6.1 pagePr

구역 내의 용지 설정 정보를 표현하기 위한 요소이다.

##### pagePr 속성 (표 106)

| 속성 이름 | 설명 |
|---|---|
| `landscape` | 용지 방향 |
| `width` | 용지 가로 크기. 단위는 HWPUNIT |
| `height` | 용지 세로 크기. 단위는 HWPUNIT |
| `gutterType` | 제책 방법. `LEFT_ONLY`: 왼쪽, `LEFT_RIGHT`: 맞쪽, `TOP_BOTTOM`: 위쪽 |

##### pagePr 하위 요소 (표 107)

| 하위 요소 이름 | 설명 |
|---|---|
| `margin` | 용지 여백 정보 |

##### XML 예

```xml
<hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY">
  <hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504"
    top="5668" bottom="4252"/>
</hp:pagePr>
```

#### 10.6.6.2 MarginAttributeGroup

`[MarginAttributeGroup]`은 여백 정보를 표현할 때 공통적으로 사용되는 속성들을 묶은 형식이다. `<margin>` 요소, `<outMargin>` 요소 등에서 사용된다.

##### MarginAttributeGroup 속성 (표 108)

| 속성 이름 | 설명 |
|---|---|
| `left` | 왼쪽 여백. 단위는 HWPUNIT |
| `right` | 오른쪽 여백. 단위는 HWPUNIT |
| `top` | 위쪽 여백. 단위는 HWPUNIT |
| `bottom` | 아래쪽 여백. 단위는 HWPUNIT |

#### 10.6.6.3 margin 요소

`<margin>` 요소는 속성에 `[MarginAttributeGroup]`을 포함한다.

##### margin 속성 (표 109)

| 속성 이름 | 설명 |
|---|---|
| `[MarginAttributeGroup]` | 10.6.6.2 참조 |
| `header` | 머리말 여백. 단위는 HWPUNIT |
| `footer` | 꼬리말 여백. 단위는 HWPUNIT |
| `gutter` | 제본 여백. 단위는 HWPUNIT |

##### XML 예

```xml
<hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504"
  top="5668" bottom="4252"/>
```

---

### 10.6.7 footNotePr 요소

#### 10.6.7.1 footNotePr

각주 모양 정보를 가지고 있는 요소이다.

##### footNotePr 하위 요소 (표 110)

| 하위 요소 이름 | 설명 |
|---|---|
| `autoNumFormat` | 자동 번호 매김 모양 정보 |
| `noteLine` | 구분선 모양 정보 |
| `noteSpacing` | 여백 정보 |
| `numbering` | 번호 매김 형식 |
| `placement` | 위치 정보 |

##### XML 예

```xml
<hp:footNotePr>
  <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
  <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
  <hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
  <hp:numbering type="CONTINUOUS" newNum="1"/>
  <hp:placement place="EACH_COLUMN" beneathText="0"/>
</hp:footNotePr>
```

#### 10.6.7.2 autoNumFormat 요소

각주/미주 내에서 사용되는 자동 번호 매김 모양 정보를 가지고 있는 요소이다.

##### autoNumFormat 속성 (표 111)

| 속성 이름 | 설명 |
|---|---|
| `type` | 번호 모양 종류 |
| `userChar` | 사용자 정의 기호. type이 `USER_CHAR`로 설정된 경우, 번호 모양으로 사용될 사용자 정의 글자 |
| `prefixChar` | 앞 장식 문자 |
| `suffixChar` | 뒤 장식 문자 |
| `supscript` | 각주/미주 내용 중 번호 코드의 모양을 위첨자 형식으로 할지 여부 |

##### XML 예

```xml
<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
```

#### 10.6.7.3 noteLine 요소

각주/미주 내에서 사용되는 구분선 모양 정보를 가지고 있는 요소이다.

##### noteLine 속성 (표 112)

| 속성 이름 | 설명 |
|---|---|
| `length` | 구분선 길이. 0(구분선 없음), 5 cm, 2 cm, Column/3(단 크기의 1/3), Column(단 크기), 그 외 (HWPUNIT 단위의 사용자 지정 길이) |
| `type` | 구분선 종류 |
| `width` | 구분선 굵기. 단위는 mm |
| `color` | 구분선 색 |

#### 10.6.7.4 noteSpacing 요소

각주/미주 내에서 사용되는 여백 정보를 가지고 있는 요소이다.

##### noteSpacing 속성 (표 113)

| 속성 이름 | 설명 |
|---|---|
| `betweenNotes` | 주석 사이 여백 |
| `belowLine` | 구분선 아래 여백 |
| `aboveLine` | 구분선 위 여백 |

##### XML 예

```xml
<hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
```

#### 10.6.7.5 footNotePr의 numbering 요소

`<footNotePr>` 요소의 `<numbering>` 요소와 `<endNotePr>` 요소의 `<numbering>` 요소는 구조상 동일하다. 하지만 속성에서 허용되는 값의 범위가 다르다.

- `<footNotePr>`의 `<numbering>`: `@type` 값의 범위는 `CONTINUOUS`, `ON_SECTION`, `ON_PAGE`
- `<endNotePr>`의 `<numbering>`: `@type` 값의 범위는 `CONTINUOUS`, `ON_SECTION`

##### numbering 속성 (표 114)

| 속성 이름 | 설명 |
|---|---|
| `type` | 번호 매기기 형식 |
| `newNum` | 시작 번호. type이 `ON_SECTION`일 때에만 사용됨 |

##### XML 예

```xml
<hp:numbering type="CONTINUOUS" newNum="1"/>
```

#### 10.6.7.6 footNotePr의 placement 요소

`<footNotePr>` 요소의 `<placement>` 요소와 `<endNotePr>` 요소의 `<placement>` 요소는 구조상 동일하다. 하지만 속성에서 허용되는 값의 범위가 다르다.

- `<footNotePr>`의 `<placement>`: `@place` 값의 범위는 `EACH_COLUMN`, `MERGED_COLUMN`, `RIGHT_MOST_COLUMN`
- `<endNotePr>`의 `<placement>`: `@place` 값의 범위는 `END_OF_DOCUMENT`, `END_OF_SECTION`

##### placement 속성 (표 115)

| 속성 이름 | 설명 |
|---|---|
| `place` | 한 페이지 내에서 각주를 다단에 어떻게 위치시킬지에 대한 설정 |
| `beneathText` | 텍스트에 이어 바로 출력할지 여부 |

##### XML 예

```xml
<hp:placement place="EACH_COLUMN" beneathText="0"/>
```

---

### 10.6.8 endNotePr 요소

#### 10.6.8.1 endNotePr

미주 모양 정보를 가지고 있는 요소이다.

##### endNotePr 하위 요소 (표 116)

| 하위 요소 이름 | 설명 |
|---|---|
| `autoNumFormat` | 자동 번호 매김 모양 정보 |
| `noteLine` | 구분선 모양 정보 |
| `noteSpacing` | 여백 정보 |
| `numbering` | 번호 매김 형식 |
| `placement` | 위치 정보 |

##### XML 예

```xml
<hp:endNotePr>
  <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
  <hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>
  <hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>
  <hp:numbering type="CONTINUOUS" newNum="1"/>
  <hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
</hp:endNotePr>
```

#### 10.6.8.2 endNotePr의 numbering 요소

`<footNotePr>` 요소의 `<numbering>` 요소와 `<endNotePr>` 요소의 `<numbering>` 요소는 구조상 동일하다. 하지만 속성에서 허용되는 값의 범위가 다르다.

- `<footNotePr>`의 `<numbering>`: `@type` 값의 범위는 `CONTINUOUS`, `ON_SECTION`, `ON_PAGE`
- `<endNotePr>`의 `<numbering>`: `@type` 값의 범위는 `CONTINUOUS`, `ON_SECTION`

##### numbering 속성 (표 117)

| 속성 이름 | 설명 |
|---|---|
| `type` | 번호 매기기 형식 |
| `newNum` | 시작 번호. type이 `ON_SECTION`일 때에만 사용됨 |

##### XML 예

```xml
<hp:numbering type="CONTINUOUS" newNum="1"/>
```

#### 10.6.8.3 endNotePr의 placement 요소

`<footNotePr>` 요소의 `<placement>` 요소와 `<endNotePr>` 요소의 `<placement>` 요소는 구조상 동일하다. 하지만 속성에서 허용되는 값의 범위가 다르다.

- `<footNotePr>`의 `<placement>`: `@place` 값의 범위는 `EACH_COLUMN`, `MERGED_COLUMN`, `RIGHT_MOST_COLUMN`
- `<endNotePr>`의 `<placement>`: `@place` 값의 범위는 `END_OF_DOCUMENT`, `END_OF_SECTION`

##### placement 속성 (표 118)

| 속성 이름 | 설명 |
|---|---|
| `place` | 한 페이지 내에서 미주를 다단에 어떻게 위치시킬지에 대한 설정 |
| `beneathText` | 텍스트에 이어 바로 출력할지 여부 |

##### XML 예

```xml
<hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
```

---

### 10.6.9 pageBorderFill 요소

#### 10.6.9.1 pageBorderFill

`<pageBorderFill>`은 구역 내에서 사용되는 테두리/배경 설정 정보를 가지고 있는 요소이다.

##### pageBorderFill 속성 (표 119)

| 속성 이름 | 설명 |
|---|---|
| `type` | 종류 |
| `borderFillIDRef` | 테두리/배경 정보 아이디 참조값 |
| `textBorder` | 쪽 테두리 위치 기준 |
| `headerInside` | 머리말 포함 여부 |
| `footerInside` | 꼬리말 포함 여부 |
| `fillArea` | 채움 영역 |

##### pageBorderFill 하위 요소 (표 120)

| 하위 요소 이름 | 설명 |
|---|---|
| `offset` | 테두리/배경 위치 정보 |

##### XML 예

```xml
<hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER"
  headerInside="0" footerInside="0" fillArea="PAPER">
  <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
</hp:pageBorderFill>
```

#### 10.6.9.2 offset 요소

구역 내에서 사용되는 테두리/배경에 대한 위치 정보를 가지고 있는 요소이다.

##### offset 속성 (표 121)

| 속성 이름 | 설명 |
|---|---|
| `left` | 왼쪽 간격. 단위는 HWPUNIT |
| `right` | 오른쪽 간격. 단위는 HWPUNIT |
| `top` | 위쪽 간격. 단위는 HWPUNIT |
| `bottom` | 아래쪽 간격. 단위는 HWPUNIT |

##### XML 예

```xml
<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
```

---

### 10.6.10 masterPage 요소

`<masterPage>` 요소는 바탕쪽 스키마에서 설정된 정보를 참조한다. 한 섹션 내에서 바탕쪽은 여러 개가 올 수 있다.

##### masterPage 속성 (표 122)

| 속성 이름 | 설명 |
|---|---|
| `idRef` | 바탕쪽 설정 정보 아이디 참조값 |

##### XML 예

```xml
<hp:masterPage idRef="masterpage0"/>
```

---

### 10.6.11 presentation 요소

#### 10.6.11.1 presentation

문서의 프레젠테이션 설정 정보를 갖고 있는 요소이다.

##### presentation 속성 (표 123)

| 속성 이름 | 설명 |
|---|---|
| `effect` | 화면 전환 효과 |
| `soundIDRef` | 효과음 바이너리 데이터에 대한 아이디 참조값 |
| `invertText` | 글자색 반전 효과 여부 |
| `autoshow` | 자동 시연 여부 |
| `showtime` | 화면 전환 시간 (초 단위) |
| `applyto` | 적용범위. `PRAT_WHOLE_DOCUMENT`: 문서 전체, `PRAT_NEWSECTION`: 현재 위치부터 새 구역 |

##### presentation 하위 요소 (표 124)

| 하위 요소 이름 | 설명 |
|---|---|
| `fillBrush` | 채우기 정보 |

##### XML 예

```xml
<hp:presentation effect="overLeft" soundIDRef="" invertText="0" autoshow="0"
  showtime="0" applyto="WholeDoc">
  <hp:fillBrush>
    <hc:winBrush faceColor="#FF6600" hatchColor="#FF6600" alpha="0"/>
  </hp:fillBrush>
</hp:presentation>
```

#### 10.6.11.2 화면 전환 효과 (표 125)

| 화면 전환 효과 | 설명 |
|---|---|
| `PRE_NONE` | 없음 |
| `PRE_OVER_LEFT` | 왼쪽으로 펼치기 |
| `PRE_OVER_RIGHT` | 오른쪽으로 펼치기 |
| `PRE_OVER_UP` | 위로 펼치기 |
| `PRE_OVER_DOWN` | 아래로 펼치기 |
| `PRE_RECT_OUT` | 상자형으로 펼치기 |
| `PRE_RECT_IN` | 상자형으로 오므리기 |
| `PRE_BLIND_LEFT` | 왼쪽 블라인드 |
| `PRE_BLIND_RIGHT` | 오른쪽 블라인드 |
| `PRE_BLIND_UP` | 위쪽 블라인드 |
| `PRE_BLIND_DOWN` | 아래쪽 블라인드 |
| `PRE_CUTTON_HORZ_OUT` | 수평 커튼 열기 |
| `PRE_CUTTON_HORZ_IN` | 수평 커튼 닫기 |
| `PRE_CUTTON_VERT_OUT` | 수직 커튼 열기 |
| `PRE_CUTTON_VERT_IN` | 수직 커튼 닫기 |
| `PRE_MOVE_LEFT` | 왼쪽으로 가리기 |
| `PRE_MOVE_RIGHT` | 오른쪽으로 가리기 |
| `PRE_MOVE_UP` | 위로 가리기 |
| `PRE_MOVE_DOWN` | 아래로 가리기 |
| `PRE_RANDOM` | 임의 선택 |

---

## 10.7 ctrl 요소

`<ctrl>` 요소는 콘텐츠에서 본문 내 제어 관련 요소들을 모은 요소이다.

### ctrl 하위 요소 (표 126)

| 하위 요소 이름 | 설명 |
|---|---|
| `colPr` | 단 설정 정보 |
| `fieldBegin` | 필드 시작 |
| `fieldEnd` | 필드 끝 |
| `bookmark` | 책갈피 |
| `header` | 머리말 (10.7.5 머리말/꼬리말 요소 형식 참조) |
| `footer` | 꼬리말 (10.7.5 머리말/꼬리말 요소 형식 참조) |
| `footNote` | 각주 (10.7.6 각주/미주 요소 형식 참조) |
| `endNote` | 미주 (10.7.6 각주/미주 요소 형식 참조) |
| `autoNum` | 자동 번호 |
| `newNum` | 새 번호 |
| `pageNumCtrl` | 홀/짝수 조정 |
| `pageHiding` | 감추기 |
| `pageNum` | 쪽번호 위치 |
| `indexmark` | 찾아보기 표식 |
| `hiddenComment` | 숨은 설명 |

### XML 예

```xml
<hp:ctrl>
  <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
</hp:ctrl>
```

---

### 10.7.1 colPr 요소

#### 10.7.1.1 colPr

단 설정 정보를 가지고 있는 요소이다.

##### colPr 속성 (표 127)

| 속성 이름 | 설명 |
|---|---|
| `id` | 단 설정 정보를 구별하기 위한 아이디 |
| `type` | 단 종류 |
| `layout` | 단 방향 지정 |
| `colCount` | 단 개수 |
| `sameSz` | 단 너비를 동일하게 지정할지 여부. true이면 동일한 너비, false이면 각기 다른 너비 |
| `sameGap` | 단 사이 간격. 단 너비를 동일하게 지정했을 경우에만 사용됨 |

##### colPr 하위 요소 (표 128)

| 하위 요소 이름 | 설명 |
|---|---|
| `colLine` | 단 구분선 |
| `colSz` | 단 사이 간격. 단 너비를 각기 다르게 지정했을 경우에만 사용됨 |

##### XML 예

```xml
<hp:ctrl>
  <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
</hp:ctrl>
```

#### 10.7.1.2 colLine 요소

단 사이의 구분선 설정 정보를 가지고 있는 요소이다.

##### colLine 속성 (표 129)

| 속성 이름 | 설명 |
|---|---|
| `type` | 구분선 종류 |
| `width` | 구분선 굵기 |
| `color` | 구분선 색 |

##### XML 예

```xml
<hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="14174">
  <hp:colLine type="DOUBLE_SLIM" width="0.7 mm" color="#3A3C84"/>
</hp:colPr>
```

#### 10.7.1.3 colSz 요소

`<colPr>`의 속성 중 `@sameSz` 속성이 false(각기 다른 단 사이 간격을 가짐)로 설정되었을 때에만 사용되는 요소이다.

##### colSz 속성 (표 130)

| 속성 이름 | 설명 |
|---|---|
| `width` | 단의 크기 |
| `gap` | 단 사이 간격 |

##### XML 예

```xml
<hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="0" sameGap="2268">
  <hp:colLine type="DOUBLE_SLIM" width="0.7 mm" color="#3A3C84"/>
  <hp:colSz width="20097" gap="1747"/>
  <hp:colSz width="10924" gap="0"/>
</hp:colPr>
```

---

### 10.7.2 fieldBegin 요소

#### 10.7.2.1 fieldBegin

메모, 외부 연결, 북마크 등 문서 내에서 부가적인 부분들을 표현하기 위한 요소이다.

##### fieldBegin 속성 (표 131)

| 속성 이름 | 설명 |
|---|---|
| `id` | 필드 시작을 구별하기 위한 아이디 |
| `type` | 필드 종류 |
| `name` | 필드 이름 |
| `editable` | 읽기 전용 상태에서도 수정 가능한지 여부 |
| `dirty` | 필드 내용이 수정되었는지 여부 |
| `zorder` | Z-Order |
| `fieldid` | 필드 개체 ID |

##### fieldBegin 하위 요소 (표 132)

| 하위 요소 이름 | 설명 |
|---|---|
| `parameters` | 필드 동작에 필요한 인자들 |
| `subList` | 내용. 특정 필드에서 사용됨 |
| `metaTag` | 메타태그 관련 정보 |

##### XML 예

```xml
<hp:fieldBegin id="1795169102" type="CLICK_HERE" name="" editable="1" dirty="0"
  zorder="-1" fieldid="627272811">
  <hp:parameters cnt="3" name="">
    <hp:integerParam name="Prop">9</hp:integerParam>
    <hp:stringParam name="Command" xml:space="preserve">Clickhere:set:66:Direction:wstring:23:이곳을
      마우스로 누르고 내용을 입력하세요. HelpState:wstring:0:  </hp:stringParam>
    <hp:stringParam name="Direction">이곳을 마우스로 누르고 내용을 입력하세요.</hp:stringParam>
  </hp:parameters>
  <hp:metaTag>{"name":"#누름틀"}</hp:metaTag>
</hp:fieldBegin>
```

---

#### 10.7.2.2 CLICK_HERE

누름틀은 문서마당을 불러왔을 때 화면에 불린 문서마당의 빈 곳을 채워 넣을 안내문과 안내문에 대한 간단한 메모 내용을 입력하는 기능이다.

##### CLICK_HERE 필요한 인자들 (표 133)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `Direction` | stringParam | 안내문 문자열 |
| `HelpState` | stringParam | 안내문 도움말 |

##### XML 예

```xml
<fieldBegin id="fb01" type="CLICK_HERE" name="title" editable="true" dirty="false">
  <parameters count="2">
    <stringParam name="Direction">이 곳에 내용 입력</stringParam>
    <stringParam name="HelpState">제목</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.3 HYPERLINK

하이퍼링크는 문서의 특정한 위치에 현재 문서나 다른 문서, 웹 페이지, 전자우편 주소 등을 연결하여 쉽게 참조하거나 이동할 수 있게 해 주는 기능이다.

문서 내에서 그룹 객체를 사용할 경우 하이퍼링크 종류를 결정할 수 없는 경우가 발생할 수 있다. 이런 경우 그룹 객체의 하이퍼링크 설정은 `HWPHYPERLINK_TYPE_DONTCARE`, `HWPHYPERLINK_TARGET_DOCUMENT_DONTCARE`, `HWPHYPERLINK_JUMP_DONTCARE`의 값을 가져야 한다.

##### HYPERLINK 필요한 인자들 (표 134)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `Path` | stringParam | 링크 경로 |
| `Category` | stringParam | 하이퍼링크의 종류 |
| `TargetType` | stringParam | 하이퍼링크의 종류가 한글 문서인 경우, 한글 문서에서 대상의 종류 |
| `DocOpenType` | stringParam | 이동 시 문서창 옵션 |

##### 하이퍼링크 종류 (표 135)

| 하이퍼링크 종류 | 설명 |
|---|---|
| `HWPHYPERLINK_TYPE_DONTCARE` | 동일 그룹 객체 내의 개별 객체들의 하이퍼링크 설정에서 하이퍼링크 종류가 다른 경우 |
| `HWPHYPERLINK_TYPE_HWP` | HWP 문서 내부의 객체 |
| `HWPHYPERLINK_TYPE_URL` | 웹 주소 |
| `HWPHYPERLINK_TYPE_EMAIL` | 메일 주소 |
| `HWPHYPERLINK_TYPE_EX` | 외부 애플리케이션 문서 |

##### HWP 문서에서 대상의 종류 (표 136)

| 대상의 종류 | 설명 |
|---|---|
| `HWPHYPERLINK_TARGET_DOCUMENT_DONTCARE` | 동일 그룹 객체 내의 개별 객체들의 하이퍼링크 설정에서 연결 문서가 다른 경우 |
| `HWPHYPERLINK_TARGET_OBJECT_DONTCARE` | 동일 그룹 객체 내의 개별 객체들의 하이퍼링크 설정에서 책갈피 내용이 다른 경우 |
| `HWPHYPERLINK_TARGET_BOOKMARK` | 책갈피 |
| `HWPHYPERLINK_TARGET_OUTLINE` | 개요 |
| `HWPHYPERLINK_TARGET_TABLE` | 표 |
| `HWPHYPERLINK_TARGET_FIGURE` | 그림, 그리기 객체 |
| `HWPHYPERLINK_TARGET_EQUATION` | 수식 |
| `HWPHYPERLINK_TARGET_HYPERLINK` | 하이퍼링크 |

##### 이동 시 문서창 옵션 (표 137)

| 문서창 옵션 종류 | 설명 |
|---|---|
| `HWPHYPERLINK_JUMP_DONTCARE` | 동일 그룹 객체 내의 개별 객체들의 하이퍼링크 설정에서 문서창 옵션 종류가 다른 경우 |
| `HWPHYPERLINK_JUMP_CURRENTTAB` | 현재 문서탭에서 열기 |
| `HWPHYPERLINK_JUMP_NEWTAB` | 새로운 문서탭에서 열기 |
| `HWPHYPERLINK_JUMP_NEWWINDOW` | 새로운 문서창에서 열기 |

##### XML 예

```xml
<fieldBegin id="fb02" type="HYPERLINK" editable="false" dirty="false">
  <parameters count="2">
    <stringParam name="Path">http://www.hancom.co.kr</stringParam>
    <stringParam name="Category">HWPHYPERLINK_TYPE_URL</stringParam>
    <stringParam name="TargetType">HWPHYPERLINK_TARGET_DOCUMENT_DONTCARE</stringParam>
    <stringParam name="DocOpenType">HWPHYPERLINK_JUMP_NEWTAB</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.4 BOOKMARK

두꺼운 책을 읽을 때 책의 중간에 책갈피를 꽂아 두고 필요할 때마다 들춰 보면 편리하듯이, [책갈피] 기능은 문서를 편집하는 도중에 본문의 여러 곳에 표시를 해 두었다가 현재 커서의 위치에 상관없이 표시해 둔 곳으로 커서를 곧바로 이동시키는 기능이다.

##### XML 예

```xml
<fieldBegin id="fb03" type="BOOKMARK" name="bm01" editable="false" dirty="false"/>
```

---

#### 10.7.2.5 FORMULA

표 계산식은 표에서 덧셈, 뺄셈, 곱셈, 나눗셈의 간단한 사칙연산은 물론이고, sum과 avg의 시트 함수와 sum(left) 등과 같은 left, right, below, above의 범위 지정자로 구성된 수식을 사용할 수 있게 하는 기능이다.

##### FORMULA 필요한 인자들 (표 138)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `FunctionName` | stringParam | 계산식 함수 이름 |
| `FunctionArguments` | listParam | 계산식에 필요한 인자들 |
| `ResultFormat` | stringParam | 결과 출력 형식 |
| `LastResult` | stringParam | 마지막으로 계산된 결과 |

##### FORMULA 함수 목록 (표 139)

| 함수 종류 | 설명 |
|---|---|
| `SUM` | 지정한 범위의 셀들에 대한 합을 계산 |
| `AVG` | 지정한 범위의 셀들에 대한 평균을 계산 |
| `PRODUCT` | 지정한 범위의 셀들에 대한 곱을 계산 |
| `MIN` | 지정한 범위의 셀들 중 최소값을 찾음 |
| `MAX` | 지정한 범위의 셀들 중 최대값을 찾음 |
| `COUNT` | 지정한 범위의 셀들에 대해 공백이 아닌 셀의 수를 계산 |
| `ROUND` | 하나의 셀에 대하여 지정한 자릿수에서 반올림 |
| `MOD` | 두 개의 셀에 대한 나눗셈의 나머지 계산 |
| `SQRT` | 하나의 셀에 대한 양의 제곱근을 계산 |
| `DEGTORAD` | 하나의 셀에 대한 도(일반각)를 라디안(호도법)으로 변환 |
| `RADTODEG` | 하나의 셀에 대한 라디안(호도법)을 도(일반각)로 변환 |
| `COS` | 하나의 셀에 대한 코사인 값 계산 |
| `SIN` | 하나의 셀에 대한 사인 값 계산 |
| `TAN` | 하나의 셀에 대한 탄젠트 값 계산 |
| `ACOS` | 하나의 셀에 대한 아크 코사인 값 계산 |
| `ASIN` | 하나의 셀에 대한 아크 사인 값 계산 |
| `ATAN` | 하나의 셀에 대한 아크 탄젠트 값 계산 |
| `ABS` | 하나의 셀에 대한 절대값을 계산 |
| `INT` | 하나의 셀에 대하여 소수점을 무시하고 정수 값만을 계산 |
| `SIGN` | 하나의 셀에 대하여 양수 값이면 1, 0이면 0, 음수 값이면 -1로 계산 |
| `CEILING` | 하나의 셀에 대하여 크거나 같은 최소 정수를 계산 |
| `FLOOR` | 하나의 셀에 대하여 작거나 같은 최대 정수를 계산 |
| `EXP` | 하나의 셀에 대한 자연 지수 e의 거듭 제곱 값을 계산 |
| `LN` | 하나의 셀에 대한 자연 로그 값 (밑이 자연 지수 e인 로그 값)을 계산 |
| `LOG` | 하나의 셀에 대한 상용 로그 값 (밑이 10인 로그 값)을 계산 |

##### FORMULA 함수 인자 (표 140)

| 인자 형태 | 설명 |
|---|---|
| `LEFT` | 현재 셀 왼쪽의 모든 셀 |
| `RIGHT` | 현재 셀 오른쪽의 모든 셀 |
| `ABOVE` | 현재 셀 위쪽의 모든 셀 |
| `BELOW` | 현재 셀 아래쪽의 모든 셀 |
| 셀 주소 | A1, A2, B4 등과 같은 개별 셀 주소. 개별 셀 주소와 LEFT, RIGHT, ABOVE, BELOW는 혼합해서 사용할 수 없음 |

##### 셀 번호 (표 141)

커서를 움직여서 셀과 셀 사이를 이동하면 상황 선에 A1, A2, A3...과 같이 현재 커서가 놓여있는 셀의 이름이 표시된다. 가로로는 A, B, C, D, E...의 순서로, 세로로는 1, 2, 3, 4, 5...와 같은 순서로 이름이 정해진다.

| A1 | B1 | C1 | D1 | E1 |
|---|---|---|---|---|
| A2 | B2 | C2 | D2 | E2 |
| A3 | B3 | C3 | D3 | E3 |
| A4 | B4 | C4 | D4 | E4 |
| A5 | B5 | C5 | D5 | E5 |

##### 결과 출력 형식 (표 142)

| 결과 출력 형식 | 설명 |
|---|---|
| `%g` | 기본 형식 |
| `%.0f` | 정수형 |
| `%.1f` | 소수점 이하 1자리까지만 표시 |
| `%.2f` | 소수점 이하 2자리까지만 표시 |
| `%.3f` | 소수점 이하 3자리까지만 표시 |
| `%.4f` | 소수점 이하 4자리까지만 표시 |

##### XML 예

```xml
<fieldBegin id="fb04" type="FORMULA" editable="false" dirty="false">
  <parameters count="4">
    <stringParam name="FunctionName">SUM</stringParam>
    <listParam name="FunctionArguments" cnt="1">
      <stringParam>LEFT</stringParam>
    </listParam>
    <stringParam name="ResultFormat">%g</stringParam>
    <stringParam name="LastResult">77</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.6 DATE 및 DOC_DATE

날짜/시간 표시. `DATE` 형식은 하위 호환성을 위해 남겨둔 형식이다. `DATE` 형식은 되도록 사용하지 않는 것을 권고한다.

##### DATE 필요한 인자들 (표 143)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `DateNation` | stringParam | 국가 코드 |
| `DateFormat` | stringParam | 날짜/시간 표시 형식 |

##### 국가 코드 (표 144)

| 국가 코드 | 설명 |
|---|---|
| `KOR` | 대한민국 |
| `USA` | 미국 |
| `JPN` | 일본 |
| `CHN` | 중국 |
| `TWN` | 대만 |

##### 날짜/시간 표시 기호 (표 145)

| 기호 | 설명 |
|---|---|
| `Y` | 년(year) 요소를 표현 |
| `M` | 월(month) 요소를 표현. M: 한 자리 수, MM: 2자리 수, MMM: 축약 영어(Jan), MMMM...: 전체 영어(January) |
| `D` | 일(day) 요소를 표현 |
| `w` | 주(week) 요소를 표현. 해당 연도에서 몇 번째 주인지 숫자로 표현 |
| `h` | 시(hour) 요소를 표현. 24시간제 (0 ~ 23) |
| `m` | 분(minute) 요소를 표현 |
| `s` | 초(second) 요소를 표현 |
| `n` | 0 또는 양의 정수를 표현 |
| `E` | (확장) 요일(day of the week) 요소를 표현. 국가 코드에 따라 표현이 다름. 대한민국: 월/화/수/목/금/토/일, 미국: Monday~Sunday, 일본/중국/대만: 月~日 |
| `b` | (확장) 요일의 서수 요소를 표현. 월요일 1 기준 토요일은 6, 일요일은 7 |
| `B` | (확장) 요일의 서수 요소를 표현. 대한민국/미국: 숫자(1~7), 일본/중국/대만: 한자(一~七) |
| `a` | (확장) 오전/오후 요소를 표현. 대한민국: 오전/오후, 미국: AM/PM, 일본: 午前/午後, 중국/대만: 上午/下午 |
| `A` | (확장) A.M./P.M. 요소를 표현. 국가 코드에 상관없이 A.M./P.M. 둘 중 하나로 표현 |
| `l` | (확장) 연호/국력 요소를 표현. 일본: 平成, 대만: 民國, 그 외 무시 |
| `L` | (확장) 연호/국력의 연도 요소를 표현. 일본/대만: 각 국가의 연호/국력에 맞는 연도, 그 외: y와 동일 |
| `k` | (확장) 시(hour) 요소를 표현. 12시간제 (1 ~ 12) |

##### 날짜/시간 표시 예 (표 146)

| 형식 | 표시 예 |
|---|---|
| `YYYY-MM-DD hh:mm:ss` | 2011-01-01 01:00:00 |
| `YYYY년 M월 D일 E요일` | 2011년 1월 1일 토요일 |
| `a k:mm` | 오전 1:00 |
| `YYYY年 M月 D日 (B)` | 2011年 1月 1日 (六) |
| `MMMMMMMMM D, YYYY` | January 1, 2011 |
| `l L年 1月 1日` | 平成 23年 1月 1日 |

##### XML 예

```xml
<fieldBegin id="fb05" type="DOC_DATE" editable="false" dirty="false">
  <parameters count="2">
    <stringParam name="DateNation">KOR</stringParam>
    <stringParam name="DateFormat">YYYY-MM-DD hh:mm:ss</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.7 SUMMARY

문서 요약 정보는 현재 문서에 대한 제목, 주제, 지은이, 중심 낱말(키워드), 저자, 입력자, 교정자, 내용 요약, 주의사항 등을 간단히 기록할 수 있는 기능이다.

##### SUMMARY 필요한 인자들 (표 147)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `Property` | stringParam | 문서 요약 정보 속성 |

##### 문서 요약 정보 속성 (표 148)

| 속성 값 | 설명 |
|---|---|
| `$title` | 문서 제목 |
| `$subject` | 문서 주제 |
| `$author` | 문서 저자 |
| `$keywords` | 문서 키워드 |
| `$comments` | 문서 주석 |
| `$lastAuthor` | 문서 마지막 수정한 사람 |
| `$revNumber` | 문서 이력 번호 |
| `$lastPrinted` | 문서가 마지막으로 출력된 시각 |
| `$createDate` | 문서가 생성된 시각 |
| `$lastSaveDate` | 문서가 마지막으로 저장된 시각 |
| `$pageCount` | 문서 페이지 수 |
| `$wordCount` | 문서 단어 수 |
| `$charCount` | 문서 글자 수 |

##### XML 예

```xml
<fieldBegin id="fb06" type="SUMMARY" editable="false" dirty="false">
  <parameters count="1">
    <stringParam name="Property">$title</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.8 USE_INFO

사용자 정보는 현재 문서의 작성자에 대한 이름, 회사명, 전화번호 등을 간단히 기록할 수 있는 기능이다.

##### USE_INFO 필요한 인자들 (표 149)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `Category` | stringParam | 사용자 정보 항목 |

##### 사용자 정보 항목 (표 150)

| 속성 값 | 설명 |
|---|---|
| `$UserName` | 사용자 이름 |
| `$Company` | 회사 이름 |
| `$Department` | 부서 이름 |
| `$Position` | 직책 이름 |
| `$OfficeTelephone` | 회사 전화번호 |
| `$Fax` | 팩스 번호 |
| `$HomeTelephone` | 집 전화번호 |
| `$Mobilephone` | 핸드폰 번호 |
| `$UMS1` | UMS 번호 1 |
| `$UMS2` | UMS 번호 2 |
| `$Homepage` | 홈페이지 주소 |
| `$Email1` | 전자우편 주소 1 |
| `$Email2` | 전자우편 주소 2 |
| `$Email3` | 전자우편 주소 3 |
| `$OfficeZipcode` | 회사 우편번호 |
| `$OfficeAddress` | 회사 주소 |
| `$HomeZipcode` | 집 우편번호 |
| `$HomeAddress` | 집 주소 |
| `$Etc` | 기타 |
| `$UserDefineName` | 사용자 정의 아이템 이름 |
| `$UserDefineValue` | 사용자 정의 아이템 값 |

##### XML 예

```xml
<fieldBegin id="fb07" type="USER_INFO" editable="false" dirty="false">
  <parameters count="1">
    <stringParam name="Category">$UserName</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.9 PATH

현재 문서의 물리적인 파일 경로를 문서에 표시해 주는 기능이다.

##### PATH 필요한 인자들 (표 151)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `Format` | stringParam | 파일 경로 형식 |

##### 파일 경로 형식 (표 152)

| 값 | 설명 |
|---|---|
| `$P` | 파일 경로 |
| `$F` | 파일 이름 |

##### XML 예

```xml
<fieldBegin id="fb08" type="PATH" editable="false" dirty="false">
  <parameters count="1">
    <stringParam name="Format">$P$F</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.10 CROSSREF

상호 참조는 다른 쪽의 그림, 표 등을 현재의 본문에서 항상 참조할 수 있도록 그 위치를 표시해 주는 기능이다.

##### CROSSREF 필요한 인자들 (표 153)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `RefPath` | stringParam | 참조 경로 |
| `RefType` | stringParam | 참조 대상 종류 |
| `RefContentType` | stringParam | 참조 내용 |
| `RefHyperLink` | booleanParam | 하이퍼링크 여부 |
| `RefOpenType` | stringParam | 하이퍼링크 이동 시 문서창 열기 옵션. 참조 경로가 현재 문서가 아닌 외부 문서일 경우에만 사용됨. HYPERLINK의 "이동 시 문서창 옵션" 참조 |

##### 참조 경로 형식 (표 154)

참조 경로는 기본적으로 다음과 같은 형식을 가진다. 책갈피 상호 참조의 경우, 예외로 `{참조 대상의 ID}` 대신에 `{책갈피 이름}`을 사용한다. 참조 대상이 있는 문서가 현재 문서인 경우 `{문서의 파일 경로}`는 생략된다.

| 분류 | 형식 |
|---|---|
| 외부 문서 참조인 경우 | `{문서의 파일 경로}?#{참조 대상의 ID 또는 책갈피 이름}` |
| 현재 문서 참조인 경우 | `?#{참조 대상의 ID 또는 책갈피 이름}` |

##### 참조 대상 종류 (표 155)

| 참조 대상 종류 | 설명 |
|---|---|
| `TARGET_TABLE` | 표 |
| `TARGET_PICTURE` | 그림 |
| `TARGET_EQUATION` | 수식 |
| `TARGET_FOOTNOTE` | 각주 |
| `TARGET_ENDNOTE` | 미주 |
| `TARGET_OUTLINE` | 개요 |
| `TARGET_BOOKMARK` | 책갈피 |

##### 참조 내용 (표 156)

| 참조 내용 | 설명 |
|---|---|
| `OBJECT_TYPE_PAGE` | 참조 대상이 있는 쪽 번호 |
| `OBJECT_TYPE_NUMBER` | 참조 대상의 번호 |
| `OBJECT_TYPE_CONTENTS` | 참조 대상의 캡션 내용 또는 책갈피의 경우 책갈피 내용. 미주/각주의 경우 해당 형식은 사용할 수 없음 |
| `OBJECT_TYPE_UPDOWNPOS` | 현재 위치 기준으로 참조 대상이 있는 위치 (위/아래) |

##### XML 예

```xml
<fieldBegin id="fb09" type="CROSSREF" editable="false" dirty="false">
  <parameters count="5">
    <stringParam name="RefPath">?#table23</stringParam>
    <stringParam name="RefType">TARGET_TABLE</stringParam>
    <stringParam name="RefContentType">OBJECT_TYPE_NUMBER</stringParam>
    <booleanParam name="RefHyperLink">true</booleanParam>
    <stringParam name="RefOpenType">HWPHYPERLINK_JUMP_DONTCARE</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.11 MAILMERGE

메일 머지는 여러 사람의 이름, 주소 등이 들어 있는 '데이터 파일(data file)'과 '서식 파일(form letter file)'을 결합함(merging)으로써, 이름이나 직책, 주소 부분 등만 다르고 나머지 내용이 같은 수십, 수백 통의 편지지를 한꺼번에 만드는 기능이다.

##### MAILMERGE 필요한 인자들 (표 157)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `FieldType` | stringParam | 필드 형식. `WAB`, `USER_DEFINE` 중 하나의 값을 가질 수 있음 |
| `FieldValue` | stringParam | 필드 엔트리 이름 |

##### 필드 엔트리 이름 (표 158)

필드 형식이 `USER_DEFINE`인 경우 별도의 정해진 이름 규칙은 없다. 필드 형식이 `WAB`인 경우에는 다음의 이름만을 사용해야 한다.

| 엔트리 이름 | 설명 |
|---|---|
| `ENTRYID` | Windows Address Book에서 각 엔트리의 고유아이디 |
| `OBJECT_TYPE` | 엔트리 객체 형식 |
| `DISPLAY_NAME` | 사용자 표시 이름 |
| `SURNAME` | 사용자 성 |
| `GIVEN_NAME` | 사용자 이름 |
| `NICKNAME` | 사용자 애칭 |
| `TITLE` | 직함 |
| `COMPANY_NAME` | 회사 이름 |
| `DEPARTMENT_NAME` | 부서 이름 |
| `SPOUSE_NAME` | 배우자 이름 |
| `MOBILE_TELEPHONE_NUMBER` | 휴대폰 번호 |
| `PAGER_TELEPHONE_NUMBER` | 호출기 번호 |
| `EMAIL_ADDRESS` | 전자우편 주소 |
| `HOME_ADDRESS_COUNTRY` | 집 주소 국가/지역 |
| `HOME_ADDRESS_STATE_OR_PROVINCE` | 집 주소 시/도 |
| `HOME_ADDRESS_CITY` | 집 주소 구/군/시 |
| `HOME_ADDRESS_STREET` | 집 주소 나머지 |
| `HOME_TELEPHONE_NUMBER` | 집 전화번호 |
| `HOME_FAX_NUMBER` | 집 팩스 번호 |
| `HOME_ADDRESS_POSTAL_CODE` | 집 주소 우편 번호 |
| `BUSINESS_ADDRESS_COUNTRY` | 직장 주소 국가/지역 |
| `BUSINESS_ADDRESS_STATE_OR_PROVINCE` | 직장 주소 시/도 |
| `BUSINESS_ADDRESS_CITY` | 직장 주소 구/군/시 |
| `BUSINESS_ADDRESS_STREET` | 직장 주소 나머지 |
| `BUSINESS_TELEPHONE_NUMBER` | 직장 전화 번호 |
| `BUSINESS_FAX_NUMBER` | 직장 팩스 번호 |
| `BUSINESS_ADDRESS_POSTAL_CODE` | 직장 주소 우편 번호 |

##### XML 예

```xml
<fieldBegin id="fb10" type="MAILMERGE" editable="false" dirty="false">
  <parameters count="2">
    <stringParam name="FieldType">WAB</stringParam>
    <stringParam name="FieldValue">SURNAME</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.12 MEMO

메모는 현재 입력 중인 문서에서 특정 단어나 블록으로 설정한 문자열에 대한 간단한 추가 내용을 기록하는 기능이다.

##### MEMO 필요한 인자들 (표 159)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `ID` | stringParam | 메모를 식별하기 위한 아이디 |
| `Number` | integerParam | 메모 번호 |
| `CreateDateTime` | stringParam | 메모 작성 시각. KS X ISO 8601에 따라 "YYYY-MM-DD hh:mm:ss" 형식 사용 |
| `Author` | stringParam | 메모 작성자 |
| `MemoShapeIDRef` | stringParam | 메모 모양 설정 정보 아이디 참조값 |

##### XML 예

```xml
<fieldBegin id="fb11" type="MEMO" editable="true" dirty="true">
  <parameters count="5">
    <stringParam name="ID">memo1</stringParam>
    <integerParam name="Number">1</integerParam>
    <stringParam name="CreateDateTime">2011-01-01 10:00:00</stringParam>
    <stringParam name="Author">hancom</stringParam>
    <stringParam name="MemoShapeID">memoShape3</stringParam>
  </parameters>
  <subList id="subList2" textDirection="HORIZONTAL" lineWrap="BREAK"
    vertAlign="TOP" linkListIDRef="subList1" linkListNextIDRef="subList1">
    <p id="para21" paraPrIDRef="pshape2" styleIDRef="style6"
      pageBreak="false" columnBreak="false">
      <t charPrIDRef="cshape5">
        <char>메모 내용</char>
      </t>
    </p>
  </subList>
</fieldBegin>
```

---

#### 10.7.2.13 PROOFREADING_MARKS

교정 부호는 맞춤법, 띄어쓰기, 활자 크기, 문장 부호, 줄바꿈, 오자, 탈자, 어색한 표현 등을 바로잡기 위하여 특정 부호를 문서 내에 삽입하는 기능이다.

교정 부호 종류가 "메모 고침표"인 경우 MEMO 형식에서 사용되는 인자들을 사용한다 (Type, Number, CreateDateTime, Author, MemoShapeIDRef).

교정 부호 종류가 "자료 연결"인 경우 HYPERLINK 형식에서 사용되는 인자들을 사용한다 (Type, Path, Category, TargetType, DocOpenType).

##### PROOFREADING_MARKS 필요한 인자들 (표 160)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `Type` | stringParam | 교정 부호 종류 |
| `ProofreadingContents` | stringParam | 교정 내용. 넣음표, 부호 넣음표, 고침표에서 사용됨 |
| `MovingMargin` | integerParam | 자리 옮김 여백. 오른/왼자리 옮김표에서 사용됨 |
| `MovingStart` | integerParam | 자리 옮김 시작위치. 오른/왼자리 옮김표에서 사용됨 |
| `SplitType` | stringParam | "자리 바꿈 나눔표"인지 "줄 서로 바꿈 나눔표"인지 여부. 자리/줄 서로 바꿈 나눔표에서 사용됨 |

##### 교정 부호 종류 (표 161)

| 교정 부호 | 설명 |
|---|---|
| `WORD_SPACING` | 띄움표 |
| `CONTENT_INSERT` | 넣음표 |
| `SIGN_INSERT` | 부호 넣음표 |
| `LINE_SPLIT` | 줄바꿈표 |
| `LINE_SPACE` | 줄비움표 |
| `MEMO_CHANGE` | 메모 고침표 |
| `SIMPLE_CHANGE` | 고침표 |
| `CLIPPING` | 뺌표 |
| `DELETE` | 지움표 |
| `ATTACH` | 붙임표 |
| `LINE_ATTACH` | 줄붙임표 |
| `LINE_LINK` | 줄이음표 |
| `SAWTOOTH` | 톱니표 |
| `THINKING` | 생각표 |
| `PRAISE` | 칭찬표 |
| `LINE` | 줄표 |
| `POSITON_TRANSFER` | 자리 바꿈표 |
| `LINE_TRANSFER` | 줄 서로 바꿈표 |
| `TRANSFER_SPLIT` | 바꿈 나눔표 |
| `RIGHT_MOVE` | 오른자리 옮김표 |
| `LEFT_MOVE` | 왼자리 옮김표 |
| `LINK_DATA` | 자료 연결 |

##### SplitType (표 162)

| 값 | 설명 |
|---|---|
| `POSITION` | 자리 바꿈 나눔표를 지칭 |
| `LINE` | 줄 서로 바꿈 나눔표를 지칭 |

##### XML 예

```xml
<fieldBegin id="fb12" type="PROOFREADING_MARKS" editable="false" dirty="true">
  <parameters count="2">
    <stringParam name="Type">SIMPLE_CHANGE</stringParam>
    <integerParam name="ProofreadingContents">고침표 내용</integerParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.14 PRIVATE_INFO

선택 글자 보호는 현재 화면에서 편집하고 있는 문서 내용 중 사용자가 블록으로 지정한 영역을 암호를 걸어 사용자가 선택한 문자로 변경하는 기능이다.

##### PRIVATE_INFO 필요한 인자들 (표 163)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `EncryptMode` | stringParam | 암호화 방식 |
| `EncryptLength` | integerParam | 암호화된 결과의 길이 |
| `DecryptLength` | integerParam | 복호화한 후의 길이 |
| `EncryptString` | stringParam | 암호화된 결과를 BASE64로 인코딩한 문자열 |
| `MarkChar` | stringParam | 암호화된 문자열 대신에 화면에 표시될 문자 |
| `Pattern` | stringParam | Pattern |
| `Type` | stringParam | Type |

##### 암호화 방식 (표 164)

| 값 | 설명 |
|---|---|
| `AES` | AES (Advanced Encryption Standard) 알고리즘 |

##### XML 예

```xml
<fieldBegin id="fb13" type="PRIVATE_INFO" editable="false" dirty="true">
  <parameters count="5">
    <stringParam name="EncryptMode">AES</stringParam>
    <integerParam name="EncryptLength">80</integerParam>
    <integerParam name="DecryptLength">35</integerParam>
    <stringParam name="EncryptString">fgtM4BN7AzseLJHkYEfC7hjjH/OZ3fJXm30S8vmPfMWTl2odMR4YGk2zImov4NUj8w99wczISLtzi8BZDPdIHfEbSkJZKAwhYNCot2jjvQk=</stringParam>
    <stringParam name="MarkChar">*</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.15 METADATA

특정 단어나 블록으로 설정한 문자열에 대한 추가적인 의미 정보를 기록하는 기능이다. 사용하는 인자의 값인 Property, Resource, Content, Datatype의 자세한 내용은 RDFa의 `xhtml:property`, `xhtml:resource`, `xhtml:content`, `xhtml:datatype`을 참고한다.

세부적인 규격은 RDFa를 참고한다 (`http://www.w3.org/TR/2008/REC-rdfa-syntax-20081014/`).

##### METADATA 필요한 인자들 (표 165)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `ID` | stringParam | 고유식별 아이디 |
| `Property` | stringParam | 주제(subject)와 관계 |
| `Resource` | stringParam | 참조되는 URI |
| `Content` | stringParam | 문자열 |
| `Datatype` | stringParam | Content의 데이터형 |

##### XML 예

```xml
<fieldBegin id="fb13" type="METADATA" editable="false" dirty="true">
  <parameters count="4">
    <stringParam name="ID">103e9eab2c70</stringParam>
    <stringParam name="Property">http://www.w3.org/2002/12/cal/ical/dtstart</stringParam>
    <stringParam name="Content">2007-09-16T16:00:00-05:00</stringParam>
    <stringParam name="Datatype">xsd:dateTime</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.16 CITATION

인용은 연구논문이나 다른 여타의 원본을 인용해야 하는 문서를 작성할 때 사용하는 기능이다. 인용은 다양한 형식의 인용 스타일을 선택하여 적용할 수 있다.

##### CITATION 필요한 인자들 (표 166)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `GUID` | stringParam | 인용 고유번호 |
| `Result` | stringParam | 스타일이 적용된 인용 문자열 |

##### XML 예

```xml
<fieldBegin id="fb13" type="CITATION" editable="false" dirty="true">
  <parameters count="2">
    <stringParam name="GUID">A25C5BE1-391D-4088-9B2C-3E0C521730F1</stringParam>
    <stringParam name="Result">인용 내용</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.17 BIBLIOGRAPHY

참고문헌은 참조한 원본에 대한 출처 정보를 적용하는 기능이다. 참고문헌 스타일을 선택하거나 다른 참고문헌 스타일을 적용할 수 있다. 참고문헌에 대한 XML 데이터는 OOXML의 형식을 사용하며 `Custom/Bibliography.xml` (8.2 참조)에 기입된다.

##### BIBLIOGRAPHY 필요한 인자들 (표 167)

| 인자 이름 | 인자 형식 | 설명 |
|---|---|---|
| `StyleName` | stringParam | 참고문헌 스타일 |
| `StyleVersion` | stringParam | 참고문헌 스타일 버전 |

##### XML 예

```xml
<fieldBegin id="fb13" type="BIBLIOGRAPHY" editable="false" dirty="true">
  <parameters count="2">
    <stringParam name="StyleName">APA</stringParam>
    <stringParam name="StyleVersion">6</stringParam>
  </parameters>
</fieldBegin>
```

---

#### 10.7.2.18 METATAG

메타태그는 본문의 메타 정보를 기록하는 기능이다.

##### XML 예

```xml
<fieldBegin id="fb13" type="METATAG" editable="false" dirty="true" zorder="1">
  <hp:metaTag>{"name":"#전화번호"}</hp:metaTag>
</fieldBegin>
```

---

### 10.7.3 fieldEnd 요소

`<fieldBegin>` 요소와 쌍을 이루는 요소이다.

##### fieldEnd 속성 (표 168)

| 속성 이름 | 설명 |
|---|---|
| `beginIDRef` | 필드 시작 아이디 참조값 |
| `fieldid` | 필드 개체 아이디 |

##### XML 예

```xml
<hp:fieldEnd beginIDRef="1790845288" fieldid="623209829"/>
```

---

### 10.7.4 bookmark 요소

필드에서 사용되는 책갈피와는 다른 구조를 가지는 책갈피를 표현하기 위한 요소이다. 필드의 책갈피는 지정된 구역에 책갈피 표시를 하지만, `<bookmark>` 요소를 사용한 책갈피는 지정된 구역을 가지지 않는 단순히 지정된 위치에 책갈피 표시를 한다.

##### bookmark 속성 (표 169)

| 속성 이름 | 설명 |
|---|---|
| `name` | 책갈피 이름 |

##### XML 예

```xml
<hp:bookmark name="책갈피"/>
```

---

### 10.7.5 머리말/꼬리말 요소 형식

머리말 및 꼬리말을 표현하기 위한 요소 형식이다. (`<header>`, `<footer>`)

##### HeaderFooterType 속성 (표 170)

| 속성 이름 | 설명 |
|---|---|
| `id` | 머리말/꼬리말을 식별하기 위한 아이디 |
| `applyPageType` | 머리말/꼬리말이 적용될 페이지 형식. `BOTH`: 양쪽, `EVEN`: 짝수쪽, `ODD`: 홀수쪽 |

##### HeaderFooterType 하위 요소 (표 171)

| 하위 요소 이름 | 설명 |
|---|---|
| `subList` | 머리말/꼬리말 내용 |

##### XML 예

```xml
<hp:footer id="3" applyPageType="BOTH">
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="BOTTOM"
    linkListIDRef="0" linkListNextIDRef="0" textWidth="42520" textHeight="4252"
    hasTextRef="0" hasNumRef="0">
    <hp:p id="0" paraPrIDRef="22" styleIDRef="13" pageBreak="0" columnBreak="0"
      merged="0" paraTcId="12">
      <hp:run charPrIDRef="1">
        <hp:t>
          <hp:insertBegin Id="40" TcId="11"/>
        </hp:t>
        <hp:ctrl>
          <hp:autoNum num="1" numType="PAGE">
            <hp:autoNumFormat type="DIGIT" userChar="" prefixChar=""
              suffixChar="" supscript="0"/>
          </hp:autoNum>
        </hp:ctrl>
        <hp:t/>
      </hp:run>
    </hp:p>
  </hp:subList>
</hp:footer>
```

---

### 10.7.6 각주/미주 요소 형식

각주 및 미주를 표현하기 위한 요소 형식이다. (`<footNote>`, `<endNote>`)

##### NoteType 속성 (표 172)

| 속성 이름 | 설명 |
|---|---|
| `id` | 각주/미주를 식별하기 위한 아이디 |

##### NoteType 하위 요소 (표 173)

| 하위 요소 이름 | 설명 |
|---|---|
| `subList` | 각주/미주 내용 |

##### XML 예

```xml
<hp:footNote instId="1832523497">
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP"
    linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
    hasTextRef="0" hasNumRef="0">
    <hp:p id="0" paraPrIDRef="10" styleIDRef="14" pageBreak="0"
      columnBreak="0" merged="0">
      <hp:run charPrIDRef="3">
        <hp:ctrl>
          <hp:autoNum num="1" numType="FOOTNOTE">
            <hp:autoNumFormat type="DIGIT" userChar="" prefixChar=""
              suffixChar=")" supscript="0"/>
          </hp:autoNum>
        </hp:ctrl>
        <hp:t> </hp:t>
      </hp:run>
    </hp:p>
  </hp:subList>
</hp:footNote>
```

---

### 10.7.7 자동/새 번호 요소 형식

자동 번호 및 새 번호를 표현하기 위한 요소 형식이다.

##### AutoNumNewNumType 속성 (표 174)

| 속성 이름 | 설명 |
|---|---|
| `num` | 번호 |
| `numType` | 번호의 종류 |

##### AutoNumNewNumType 하위 요소 (표 175)

| 하위 요소 이름 | 설명 |
|---|---|
| `autoNumFormat` | 번호 서식. 10.6.7.2 참조 |

##### XML 예

```xml
<hp:autoNum num="1" numType="PAGE">
  <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/>
</hp:autoNum>
```

---

### 10.7.8 pageNumCtrl 요소

쪽 번호를 홀수쪽, 짝수쪽 또는 양쪽 모두에 표시할지를 설정하기 위한 요소이다.

##### pageNumCtrl 속성 (표 176)

| 속성 이름 | 설명 |
|---|---|
| `pageStartsOn` | 홀/짝수 구분 |

---

### 10.7.9 pageHiding 요소

현재 구역 내에서 감추어야 할 것들을 설정하기 위한 요소이다.

##### pageHiding 속성 (표 177)

| 속성 이름 | 설명 |
|---|---|
| `hideHeader` | 머리말 감추기 여부 |
| `hideFooter` | 꼬리말 감추기 여부 |
| `hideMasterPage` | 바탕쪽 감추기 여부 |
| `hideBorder` | 테두리 감추기 여부 |
| `hideFill` | 배경 감추기 여부 |
| `hidePageNum` | 쪽 번호 감추기 여부 |

##### XML 예

```xml
<hp:pageHiding hideHeader="0" hideFooter="0" hideMasterPage="0"
  hideBorder="0" hideFill="1" hidePageNum="0"/>
```

---

### 10.7.10 pageNum 요소

쪽 번호의 위치 및 모양을 설정하기 위한 요소이다.

##### pageNum 속성 (표 178)

| 속성 이름 | 설명 |
|---|---|
| `pos` | 번호 위치 |
| `formatType` | 번호 모양 종류 |
| `sideChar` | 줄표 넣기 |

##### XML 예

```xml
<hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/>
```

---

### 10.7.11 indexmark 요소

`<indexmark>`는 찾아보기(Index, 색인)와 관련된 정보를 갖고 있는 요소이다.

##### indexmark 하위 요소 (표 179)

| 하위 요소 이름 | 설명 |
|---|---|
| `firstKey` | 찾아보기에 사용할 첫 번째 키워드. 요소의 값으로 키워드 문자열을 가짐 |
| `secondKey` | 찾아보기에 사용할 두 번째 키워드. 요소의 값으로 키워드 문자열을 가짐 |

##### XML 예

```xml
<hp:indexmark>
  <hp:firstKey>aa</hp:firstKey>
  <hp:secondKey>aa</hp:secondKey>
</hp:indexmark>
```

---

### 10.7.12 hiddenComment 요소

`<hiddenComment>`는 숨은 설명 내용 정보를 갖고 있는 요소이다.

##### hiddenComment 하위 요소 (표 180)

| 하위 요소 이름 | 설명 |
|---|---|
| `subList` | 숨은 설명 내용. 10.1.1 참조 |

##### XML 예

```xml
<hp:hiddenComment>
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP"
    linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
    hasTextRef="0" hasNumRef="0">
    <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
      <hp:run charPrIDRef="6">
        <hp:t>숨은 주석임.</hp:t>
      </hp:run>
    </hp:p>
  </hp:subList>
</hp:hiddenComment>
```

---

## 10.8 t 요소

### 10.8.1 t

`<t>` 요소는 문서의 실제 글자들을 담고 있는 요소이다. `<t>` 요소는 요소의 값으로 글자들을 가지게 된다. 단 Tab 글자, 줄바꿈 글자와 같이 특수 글자들은 실제 글자 대신에 하위 요소로서 가지고 있게 된다.

##### t 속성 (표 181)

| 속성 이름 | 설명 |
|---|---|
| `charPrIDRef` | 글자 모양 설정 아이디 참조값 |

##### t 하위 요소 (표 182)

| 하위 요소 이름 | 설명 |
|---|---|
| `{요소 값}` | 글자 |
| `markpenBegin` | 형광펜 시작 |
| `markpenEnd` | 형광펜 끝 |
| `titleMark` | 제목 차례 표시 |
| `tab` | 탭. 하위 속성들은 integer type이지만 단위는 HWPUNIT |
| `lineBreak` | 강제 줄나눔 |
| `hyphen` | 하이픈 |
| `nbSpace` | 묶음 빈칸 |
| `fwSpace` | 고정폭 빈칸 |
| `insertBegin` | 변경 추적 삽입 시작지점 |
| `insertEnd` | 변경 추적 삽입 끝지점 |
| `deleteBegin` | 변경 추적 삭제 시작지점 |
| `deleteEnd` | 변경 추적 삭제 끝지점 |

---

### 10.8.2 markpenBegin 요소

형광펜 색상 정보를 담고 있는 요소이다.

##### markpenBegin 속성 (표 183)

| 속성 이름 | 설명 |
|---|---|
| `beginColor` | 형광펜 색상 |

##### XML 예

```xml
<hp:markpenBegin color="#FF0000"/>
  sampletext
<hp:markpenEnd/>
```

---

### 10.8.3 titleMark 요소

제목 차례 표시 여부를 갖고 있는 요소이다.

##### titleMark 속성 (표 184)

| 속성 이름 | 설명 |
|---|---|
| `ignore` | 제목 차례 표시 여부. `true`: 제목 차례 표시, `false`: 차례 만들기 무시 |

---

### 10.8.4 tab 요소

##### tab 속성 (표 185)

| 속성 이름 | 설명 |
|---|---|
| `width` | 탭의 간격 |
| `leader` | 탭의 채울모양 (LineType2) |
| `type` | 탭 종류. `LEFT`: 왼쪽 정렬 탭, `RIGHT`: 오른쪽 정렬 탭, `CENTER`: 가운데 정렬 탭, `DECIMAL`: 소수점 정렬 탭 |

##### XML 예

```xml
<hp:tab width="31188" leader="0" type="2"/>
```

---

### 10.8.5 변경 추적 요소 형식

`<insertBegin>`, `<insertEnd>`, `<deleteBegin>`, `<deleteEnd>` 요소는 `[TrackChangeTag]` 형식을 기본으로 하며, `[TrackChangeTag]`은 변경 추적 정보를 정의한 형식이다.

##### TrackChangeTag 속성 (표 186)

| 속성 이름 | 설명 |
|---|---|
| `Id` | 식별하기 위한 아이디 |
| `TcId` | 변경 추적 아이디 참조값 |
| `paraend` | 문단 끝 포함 여부 |

##### XML 예

```xml
<hp:run charPrIDRef="7">
  <hp:t>
    프로그램입니다.
    <hp:insertBegin Id="1" TcId="1"/>
    <hp:insertEnd Id="1" TcId="1" paraend="1"/>
  </hp:t>
</hp:run>
```
