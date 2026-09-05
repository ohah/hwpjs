# 9.3.7 bullets 요소

#### 9.3.7.1 bullets 일반 항목

글머리표 문단 모양 정보 목록을 가지고 있는 요소이다.

#### 표 68 -- bullets 요소

| 속성 이름 | 설명 |
|-----------|------|
| bulletCount | 글머리표 문단 모양 정보의 개수 |

#### 표 69 -- bullets 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| bullet | 글머리표 문단 모양 정보 |

#### 샘플 33 -- bullets 예

```xml
<hh:bullets itemCnt="1">
  <hh:bullet id="1" char="l" useImage="0">
    <hh:paraHead level="0" align="LEFT" useInstWidth="0" autoIndent="1" widthAdjust="0"
      textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT"
      charPrIDRef="4294967295" checkable="0"/>
  </hh:bullet>
</hh:bullets>
```

#### 9.3.7.2 bullet 요소

글머리표 문단 모양 정보를 사용하면 문단의 머리에 번호 대신 글머리표 또는 그림 글머리표를 붙일 수 있다. 속성 `@useImg`의 값이 참(true)으로 설정되면 반드시 `<img>` 요소를 자식 요소로 가지고 있어야 한다. 즉, 글머리표로 사용되는 이미지에 대한 참조 정보를 가지고 있어야 한다.

#### 표 70 -- bullet 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 글머리표 문단 모양을 구별하기 위한 아이디 |
| char | 글머리표 문자 |
| checkedChar | 선택 글머리표 문자 |
| useImg | 글머리표 문자 대신 글머리표 그림을 사용할지 여부 |

#### 표 71 -- bullet 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| img | 글머리표 그림에 사용되는 그림에 대한 정보 |
| paraHead | 번호/글머리표 문단 머리의 정보 |
