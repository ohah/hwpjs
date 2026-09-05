# 10.6 secPr 요소

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
