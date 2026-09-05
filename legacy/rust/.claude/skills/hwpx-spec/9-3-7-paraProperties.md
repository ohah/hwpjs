# 9.3.8 paraProperties 요소

#### 9.3.8.1 paraProperties 일반 항목

문단 모양 정보 목록을 가지고 있는 요소이다.

#### 표 72 -- paraProperties 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 문단 모양 정보의 개수 |

#### 표 73 -- paraProperties 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| paraPr | 문단 모양 정보 |

#### 샘플 34 -- paraProperties 예

```xml
<hh:paraProperties itemCnt="21">
  <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1"
    suppressLineNumbers="0" checked="0" textDir="LTR">
    <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
    <hh:heading type="NONE" idRef="0" level="0"/>
    <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD"
      widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
    <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
    <hh:margin>
      <hh:intent value="0" unit="HWPUNIT"/>
      <hh:left value="0" unit="HWPUNIT"/>
      <hh:right value="0" unit="HWPUNIT"/>
      <hh:prev value="0" unit="HWPUNIT"/>
      <hh:next value="0" unit="HWPUNIT"/>
    </hh:margin>
    <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
    <hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0"
      offsetBottom="0" connect="0" ignoreMargin="0"/>
  </hh:paraPr>
</hh:paraProperties>
```

#### 9.3.8.2 paraPr 요소

##### 9.3.8.2.1 paraPr 일반 항목

문단 모양 정보는 문단 내 정렬, 문단 테두리 등 문단을 표현할 때 필요한 각종 설정 정보를 가지고 있는 요소이다.

#### 표 74 -- paraPr 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 문단 모양 정보를 구별하기 위한 아이디 |
| tabPrIDRef | 탭 정의 아이디 참조값 |
| condense | 공백 최소값. 단위는 % |
| fontLineHeight | 글꼴에 어울리는 줄 높이 사용 여부 |
| snapToGrid | 편집 용지의 줄 격자 사용 여부 |
| suppressLineNumbers | 줄 번호 건너뜀 사용 여부 |
| checked | 선택 글머리표 여부 |
| textDir | 문단 방향 정보: `RTL` (오른쪽에서 왼쪽), `LTR` (왼쪽에서 오른쪽) |

#### 표 75 -- paraPr 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| align | 문단 내 정렬 설정 |
| heading | 문단 머리 번호/글머리표 설정 |
| breakSetting | 문단 줄나눔 설정 |
| margin | 문단 여백 설정 |
| lineSpacing | 줄 간격 설정 |
| border | 문단 테두리 설정 |
| autoSpacing | 문단 자동 간격 조절 설정 |

##### 9.3.8.2.2 align 요소

문단 내 정렬 방식을 표현하기 위한 요소이다.

#### 표 76 -- align 요소

| 속성 이름 | 설명 |
|-----------|------|
| horizontal | 가로 정렬 방식: `JUSTIFY` (양쪽 정렬), `LEFT` (왼쪽 정렬), `RIGHT` (오른쪽 정렬), `CENTER` (가운데 정렬), `DISTRIBUTE` (배분 정렬), `DISTRIBUTE_SPACE` (나눔 정렬, 공백에만 배분) |
| vertical | 세로 정렬 방식: `BASELINE` (글꼴 기준), `TOP` (위쪽), `CENTER` (가운데), `BOTTOM` (아래) |

#### 샘플 35 -- align 예

```xml
<hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
```

##### 9.3.8.2.3 heading 요소

문단 머리 모양 설정 정보를 가지고 있는 요소이다.

#### 표 77 -- heading 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 문단 머리 모양 종류: `NONE` (없음), `OUTLINE` (개요), `NUMBER` (번호), `BULLET` (글머리표) |
| idRef | 문단 머리 번호/글머리표 모양 아이디 참조값 |
| level | 문단 단계 |

#### 샘플 36 -- heading 예

```xml
<hh:heading type="NUMBER" idRef="2" level="0"/>
```

##### 9.3.8.2.4 breakSetting 요소

문단의 줄나눔 설정 정보를 가지고 있는 요소이다.

#### 표 78 -- breakSetting 요소

| 속성 이름 | 설명 |
|-----------|------|
| breakLatinWord | 라틴 문자의 나눔 단위 |
| breakNonLatinWord | 라틴 문자 이외의 문자의 줄나눔 단위 |
| widowOrphan | 외톨이줄 보호 여부 |
| keepWithNext | 다음 문단과 함께 여부 |
| keepLines | 문단 보호 여부 |
| pageBreakBefore | 문단 앞에서 항상 쪽 나눔 여부 |
| lineWrap | 한 줄로 입력 사용 시의 형식 |

#### 샘플 37 -- breakSetting 예

```xml
<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD"
  widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
```

##### 9.3.8.2.5 margin 요소

문단의 여백 정보를 가지고 있는 요소이다.

#### 표 79 -- margin 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| intent | 들여쓰기/내어쓰기. n이 0보다 크면 들여쓰기, n이 0이면 보통, n이 0보다 작으면 내어쓰기 |
| left | 왼쪽 여백 |
| right | 오른쪽 여백 |
| prev | 위쪽 문단 간격 |
| next | 아래쪽 문단 간격 |

#### 샘플 38 -- margin 예

```xml
<hh:margin>
  <hh:intent value="0" unit="HWPUNIT"/>
  <hh:left value="0" unit="HWPUNIT"/>
  <hh:right value="0" unit="HWPUNIT"/>
  <hh:prev value="0" unit="HWPUNIT"/>
  <hh:next value="0" unit="HWPUNIT"/>
</hh:margin>
```

##### 9.3.8.2.6 lineSpacing 요소

문단의 줄 간격 설정 정보를 가지고 있는 요소이다.

#### 표 80 -- lineSpacing 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 줄 간격 종류 |
| value | 줄 간격 값. type이 PERCENT이면 0% ~ 500%로 제한 |
| unit | 줄 간격 값의 단위 |

#### 샘플 39 -- lineSpacing 예

```xml
<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
```

##### 9.3.8.2.7 border 요소

문단의 테두리 설정 정보를 가지고 있는 요소이다.

#### 표 81 -- border 요소

| 속성 이름 | 설명 |
|-----------|------|
| borderFillIDRef | 테두리/배경 모양 아이디 참조값 |
| offsetLeft | 문단 테두리 왼쪽 간격. 단위는 HWPUNIT |
| offsetRight | 문단 테두리 오른쪽 간격. 단위는 HWPUNIT |
| offsetTop | 문단 테두리 위쪽 간격. 단위는 HWPUNIT |
| offsetBottom | 문단 테두리 아래쪽 간격. 단위는 HWPUNIT |
| connect | 문단 테두리 연결 여부 |
| ignoreMargin | 문단 테두리 여백 무시 여부 |

#### 샘플 40 -- border 예

```xml
<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0"
  offsetBottom="0" connect="0" ignoreMargin="0"/>
```

##### 9.3.8.2.8 autoSpacing 요소

문단 내에서 한글, 영어, 숫자 사이의 간격에 대한 자동 조절 설정 정보를 가지고 있는 요소이다.

#### 표 82 -- autoSpacing 요소

| 속성 이름 | 설명 |
|-----------|------|
| eAsianEng | 한글과 영어 간격을 자동 조절 여부 |
| eAsianNum | 한글과 숫자 간격을 자동 조절 여부 |

#### 샘플 41 -- autoSpacing 예

```xml
<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
```
