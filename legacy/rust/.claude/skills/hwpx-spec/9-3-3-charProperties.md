# 9.3.4 charProperties 요소

#### 9.3.4.1 charProperties

콘텐츠 내에서 글자 모양 정보는 반드시 한 개 이상 정의되어 있어야 한다. 내용이 없는 콘텐츠라도 기본 글자 모양 정보는 정의되어 있어야 한다. 헤더 스키마 상에서는 속성 `@itemCnt`의 값으로 올 수 있는 범위가 1 이상으로(`positiveInteger`) 제한되어 있으며, 자식 요소인 `<charPr>` 요소의 개수 한정자 역시 1 이상으로 정의되어 있다.

#### 표 44 -- charProperties 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 글자 모양 정보의 개수 |

#### 표 45 -- charProperties 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| charPr | 글자 모양 정보 |

#### 샘플 19 -- charProperties 예

```xml
<hh:charProperties itemCnt="11">
  <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none"
    useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">
    <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
    <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
    <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
  </hh:charPr>
</hh:charProperties>
```

#### 9.3.4.2 charPr 요소

##### 9.3.4.2.1 글자 모양

글자 모양 설정 정보를 표현하기 위한 요소이다.

#### 표 46 -- charPr 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 글자 모양 정보를 구별하기 위한 아이디 |
| height | 글자 크기. 단위는 HWPUNIT |
| textColor | 글자 색 |
| shadeColor | 음영 색 |
| useFontSpace | 글꼴에 어울리는 빈칸을 사용할지 여부 |
| useKerning | 커닝 사용 여부 |
| symMark | 강조점 종류 |
| borderFillIDRef | 글자 테두리 기능. 만약 글자 테두리를 사용한다면 해당 속성이 존재하고, 속성의 값은 테두리/채우기 정보의 아이디 참조이다. |

#### 표 47 -- charPr 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| fontRef | 언어별 글꼴. 각 글꼴 타입에 맞게(한글이면 한글 글꼴 타입), 참조하는 글꼴 ID를 언어별로 기술 |
| ratio | 언어별 장평. 단위는 % |
| spacing | 언어별 자간. 단위는 % |
| relSz | 언어별 글자의 상대 크기. 단위는 % |
| offset | 언어별 오프셋. 단위는 % |
| italic | 글자 속성: 기울임. 해당 요소가 존재하면 기울임 글자 속성이 지정된 것이다. |
| bold | 글자 속성: 진하게. 해당 요소가 존재하면 진하게 글자 속성이 지정된 것이다. |
| underline | 글자 속성: 밑줄 |
| strikeout | 글자 속성: 취소선 |
| outline | 글자 속성: 외곽선 |
| shadow | 글자 속성: 그림자. 해당 요소가 존재하면 그림자 글자 속성이 지정된 것이다. |
| emboss | 글자 속성: 양각. 해당 요소가 존재하면 양각 글자 속성이 지정된 것이다. |
| engrave | 글자 속성: 음각. 해당 요소가 존재하면 음각 글자 속성이 지정된 것이다. |
| supscript | 글자 속성: 위첨자. 해당 요소가 존재하면 위첨자 글자 속성이 지정된 것이다. |
| subscript | 글자 속성: 아래첨자. 해당 요소가 존재하면 아래첨자 글자 속성이 지정된 것이다. |

##### symMark 값

속성 `@symMark`는 글자 속성 중 강조점을 나타내기 위한 속성이다.

#### 표 48 -- symMark 유니코드 값

| 속성 값 | 유니코드 값 | 속성 값 | 유니코드 값 |
|---------|------------|---------|------------|
| NONE | 없음 | GRAVE_ACCENT | 0x0300 |
| DOT_ABOVE | 0x0307 | ACUTE_ACCENT | 0x0301 |
| RING_ABOVE | 0x030A | CIRCUMFLEX | 0x0302 |
| TILDE | 0x030C | MACRON | 0x0304 |
| CARON | 0x0303 | HOOK_ABOVE | 0x0309 |
| SIDE | 0x302E | DOT_BELOW | 0x0323 |
| COLON | 0x302F | | |

##### 9.3.4.2.2 fontRef 요소

각 언어별 글자에서 참조하는 글꼴들에 대한 정보를 가지고 있는 요소이다.

#### 표 49 -- fontRef 요소

| 속성 이름 | 설명 |
|-----------|------|
| hangul | 한글 글자에서 사용될 글꼴의 아이디 참조값 |
| latin | 라틴 글자에서 사용될 글꼴의 아이디 참조값 |
| hanja | 한자 글자에서 사용될 글꼴의 아이디 참조값 |
| japanese | 일본어 글자에서 사용될 글꼴의 아이디 참조값 |
| other | 기타 글자에서 사용될 글꼴의 아이디 참조값 |
| symbol | 심볼 글자에서 사용될 글꼴의 아이디 참조값 |
| user | 사용자 글자에서 사용될 글꼴의 아이디 참조값 |

#### 샘플 20 -- fontRef 예

```xml
<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
```

##### 9.3.4.2.3 ratio 요소

각 언어별로 글자 장평 설정을 가지고 있는 요소이다. 글자가 시작되는 부분을 기준으로 장평을 적용한다. 즉, 글자 방향이 가로쓰기인 경우 글자의 왼쪽 시작되는 부분이 기준이다.

#### 표 50 -- ratio 요소

| 속성 이름 | 설명 |
|-----------|------|
| hangul | 한글 글자의 장평. 단위는 % |
| latin | 라틴 글자의 장평. 단위는 % |
| hanja | 한자 글자의 장평. 단위는 % |
| japanese | 일본어 글자의 장평. 단위는 % |
| other | 기타 글자의 장평. 단위는 % |
| symbol | 심볼 글자의 장평. 단위는 % |
| user | 사용자 글자의 장평. 단위는 % |

#### 샘플 21 -- ratio 예

```xml
<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
```

##### 9.3.4.2.4 spacing 요소

각 언어별로 글자 자간 설정을 가지고 있는 요소이다. 자간은 글자 사이의 간격이기 때문에 한 글자가 끝나는 부분을 기준으로 자간을 적용해야 한다.

#### 표 51 -- spacing 요소

| 속성 이름 | 설명 |
|-----------|------|
| hangul | 한글 글자의 자간. 단위는 % |
| latin | 라틴 글자의 자간. 단위는 % |
| hanja | 한자 글자의 자간. 단위는 % |
| japanese | 일본어 글자의 자간. 단위는 % |
| other | 기타 글자의 자간. 단위는 % |
| symbol | 심볼 글자의 자간. 단위는 % |
| user | 사용자 글자의 자간. 단위는 % |

#### 샘플 22 -- spacing 예

```xml
<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
```

##### 9.3.4.2.5 relSz 요소

각 언어별로 글자의 상대 크기 설정 정보를 가지고 있는 요소이다.

#### 표 52 -- relSz 요소

| 속성 이름 | 설명 |
|-----------|------|
| hangul | 한글 글자의 상대 크기. 단위는 % |
| latin | 라틴 글자의 상대 크기. 단위는 % |
| hanja | 한자 글자의 상대 크기. 단위는 % |
| japanese | 일본어 글자의 상대 크기. 단위는 % |
| other | 기타 글자의 상대 크기. 단위는 % |
| symbol | 심볼 글자의 상대 크기. 단위는 % |
| user | 사용자 글자의 상대 크기. 단위는 % |

#### 샘플 23 -- relSz 예

```xml
<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
```

##### 9.3.4.2.6 offset 요소

각 언어별로 글자의 위치 정보를 가지고 있는 요소이다. 글자 하단 끝부분을 기준으로 위치가 결정된다.

#### 표 53 -- offset 요소

| 속성 이름 | 설명 |
|-----------|------|
| hangul | 한글 글자의 오프셋. 단위는 % |
| latin | 라틴 글자의 오프셋. 단위는 % |
| hanja | 한자 글자의 오프셋. 단위는 % |
| japanese | 일본어 글자의 오프셋. 단위는 % |
| other | 기타 글자의 오프셋. 단위는 % |
| symbol | 심볼 글자의 오프셋. 단위는 % |
| user | 사용자 글자의 오프셋. 단위는 % |

#### 샘플 24 -- offset 예

```xml
<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
```

##### 9.3.4.2.7 underline 요소

글자 속성 중 밑줄을 표현하기 위한 요소이다. 이 요소가 존재하면 글자 속성 중 밑줄 속성이 지정된 것이다.

#### 표 54 -- underline 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 밑줄의 종류. `BOTTOM`, `CENTER`, `TOP` 세 가지 값 중 하나를 가질 수 있음. 현재 `CENTER` 값은 `<strikeout>`으로 대체되어서 사용되고 있지 않음. 하위 호환성을 위해 남겨둠. |
| shape | 밑줄의 모양 |
| color | 밑줄의 색 |

#### 샘플 25 -- underline 예

```xml
<hh:underline type="BOTTOM" shape="DOUBLE_SLIM" color="#B2B2B2"/>
```

##### 9.3.4.2.8 strikeout 요소

글자 속성 중 취소선을 표현하기 위한 요소이다. 취소선의 위치는 글자의 가운데가 기준이 된다. 이 요소가 존재하면 글자 속성 중 취소선 속성이 지정된 것이다.

#### 표 55 -- strikeout 요소

| 속성 이름 | 설명 |
|-----------|------|
| shape | 취소선의 모양 |
| color | 취소선의 색 |

#### 샘플 26 -- strikeout 예

```xml
<hh:strikeout shape="LONG_DASH" color="#FFD700"/>
```

##### 9.3.4.2.9 outline 요소

글자 속성 중 외곽선을 표현하기 위한 요소이다. 외곽선은 글자가 들어가 있는 박스에 선이 들어가는 것이다. 이 요소가 존재하면 글자 속성 중 외곽선 속성이 지정된 것이다.

#### 표 56 -- outline 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 외곽선의 종류 |

#### 샘플 27 -- outline 예

```xml
<hh:outline type="DASH"/>
```

##### 9.3.4.2.10 shadow 요소

글자 속성 중 그림자를 표현하기 위한 요소이다. 이 요소가 존재하면 글자 속성 중 그림자 속성이 지정된 것이다.

#### 표 57 -- shadow 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 그림자의 종류: `NONE` (그림자 없음), `DROP` (개체와 분리된 그림자), `CONTINUOUS` (개체와 연결된 그림자) |
| color | 그림자의 색 |
| offsetX | 그림자 간격 X. 단위는 % |
| offsetY | 그림자 간격 Y. 단위는 % |

#### 샘플 28 -- shadow 예

```xml
<hh:shadow type="CONTINUOUS" color="#9D5CBB" offsetX="15" offsetY="10"/>
```
