# 9.3.6 numberings 요소

문단 번호 모양 정보 목록을 가지고 있는 요소이다.

#### 표 63 -- numberings 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 문단 번호 모양 정보의 개수 |

#### 표 64 -- numberings 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| numbering | 문단 번호 모양 정보 |

#### 샘플 31 -- numberings 예

```xml
<hh:numberings itemCnt="1">
  <hh:numbering id="1" start="0">
    <hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
      charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead>
    <hh:paraHead start="1" level="2" align="LEFT" useInstWidth="1" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE"
      charPrIDRef="4294967295" checkable="0">^2.</hh:paraHead>
    <hh:paraHead start="1" level="3" align="LEFT" useInstWidth="1" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
      charPrIDRef="4294967295" checkable="0">^3)</hh:paraHead>
    <hh:paraHead start="1" level="4" align="LEFT" useInstWidth="1" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE"
      charPrIDRef="4294967295" checkable="0">^4)</hh:paraHead>
    <hh:paraHead start="1" level="5" align="LEFT" useInstWidth="1" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
      charPrIDRef="4294967295" checkable="0">(^5)</hh:paraHead>
    <hh:paraHead start="1" level="6" align="LEFT" useInstWidth="1" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE"
      charPrIDRef="4294967295" checkable="0">(^6)</hh:paraHead>
    <hh:paraHead start="1" level="7" align="LEFT" useInstWidth="1" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="CIRCLED_DIGIT"
      charPrIDRef="4294967295" checkable="1">^7</hh:paraHead>
    <hh:paraHead start="1" level="8" align="LEFT" useInstWidth="0" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
      charPrIDRef="4294967295" checkable="0"/>
    <hh:paraHead start="1" level="9" align="LEFT" useInstWidth="0" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
      charPrIDRef="4294967295" checkable="0"/>
    <hh:paraHead start="1" level="10" align="LEFT" useInstWidth="0" autoIndent="1"
      widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
      charPrIDRef="4294967295" checkable="0"/>
  </hh:numbering>
</hh:numberings>
```

#### 9.3.6.1 numbering 요소

##### 9.3.6.1.1 numbering 일반 항목

여러 개의 항목을 나열할 때 문단의 머리에 번호를 매기거나 글머리표, 그림 글머리표를 붙일 수 있다. 문단 번호는 7 수준까지 다단계 번호를 매겨 주고, 문단 번호를 사용한 문장의 순서가 바뀌면 문단 번호도 그에 맞게 자동으로 바뀌어야 한다.

#### 표 65 -- numbering 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 번호 문단 모양을 구별하기 위한 아이디 |
| start | 번호 문단에서 시작되는 숫자 번호 |

#### 표 66 -- numbering 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| paraHead | 번호/글머리표 문단 머리의 정보 |

##### 9.3.6.1.2 paraHead 요소

각 번호/글머리표 문단 머리의 정보이다. 문자열 내 특정 문자에 제어코드(`^` 0x005E)를 붙임으로써 한글 워드프로세서에서 표시되는 번호/글머리표 문단 머리의 포맷을 제어한다.

- `^n`: 레벨 경로를 표시한다 (예: 1.1.1.1.1)
- `^N`: 레벨 경로를 표시하며 마지막에 마침표를 하나 더 찍는다 (예: 1.1.1.1.1.)
- `^레벨번호(1~7)`: 해당 레벨에 해당하는 숫자 또는 문자 또는 기호를 표시한다

#### 표 67 -- paraHead 요소

| 속성 이름 | 설명 |
|-----------|------|
| start | 사용자 지정 문단 시작번호 |
| level | 번호/글머리표의 수준 |
| align | 문단의 정렬 종류: `LEFT` (왼쪽), `RIGHT` (오른쪽), `CENTER` (가운데) |
| useInstWidth | 번호 너비를 실제 인스턴스 문자열의 너비에 따를지 여부 |
| autoIndent | 자동 내여 쓰기 여부 |
| widthAdjust | 번호 너비 보정 값. 단위는 HWPUNIT |
| textOffsetType | 수준별 본문과의 거리 단위 종류: `PERCENT`, `HWPUNIT` |
| textOffset | 수준별 본문과의 거리 |
| numFormat | 번호 형식 (글머리표 문단의 경우에는 사용되지 않음) |
| charPrIDRef | 글자 모양 아이디 참조값 |
| checkable | 확인용 글머리표 여부 |

#### 샘플 32 -- paraHead 예

```xml
<hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1"
  widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
  charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead>
```
