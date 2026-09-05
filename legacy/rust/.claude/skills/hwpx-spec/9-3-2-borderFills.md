# 9.3.3 borderFills 요소

#### 9.3.3.1 borderFills

한 문서 내에서는 다양한 테두리/배경 정보들이 사용되는데 이런 테두리/배경 정보를 목록 형태로 가지고 있는 요소이다.

#### 표 30 -- borderFills 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 테두리/배경/채우기 정보의 개수 |

#### 표 31 -- borderFills 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| borderFill | 테두리/배경/채우기 정보 |

#### 샘플 12 -- borderFills 예

```xml
<hh:borderFills itemCnt="2">
  <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
    <hh:slash type="NONE" Crooked="0" isCounter="0"/>
    <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
    <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
  </hh:borderFill>
  <hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
    <hh:slash type="NONE" Crooked="0" isCounter="0"/>
    <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
    <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
    <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
    <hh:fillBrush>
      <hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/>
    </hh:fillBrush>
  </hh:borderFill>
</hh:borderFills>
```

#### 9.3.3.2 borderFill 요소

##### 9.3.3.2.1 borderFill

테두리/배경/채우기 정보에는 페이지의 테두리/배경/채우기 정보뿐만 아니라 표, 그림 등의 테두리/배경/채우기 정보까지 포함되어 있다. 이러한 특성으로 인해서 특정 속성 또는 특정 자식 요소는 특정 객체에서 사용되지 않을 수 있다. 대표적으로 속성 `breakCellSeparateLine`은 표에서만 사용되는 속성으로 페이지, 그림 등에서는 사용되지 않는다.

#### 표 32 -- borderFill 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 테두리/배경/채우기 정보를 구별하기 위한 아이디 |
| threeD | 3D 효과의 사용 여부 |
| shadow | 그림자 효과의 사용 여부 |
| centerLine | 중심선 종류 |
| breakCellSeparateLine | 자동으로 나뉜 표의 경계선 설정 여부 |

#### 표 33 -- borderFill 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| slash | 대각선 모양 설정 (9.3.3.2.2 참조) |
| backSlash | 대각선 모양 설정 (9.3.3.2.2 참조) |
| leftBorder | 왼쪽 테두리 (9.3.3.2.3 참조) |
| rightBorder | 오른쪽 테두리 (9.3.3.2.3 참조) |
| topBorder | 위쪽 테두리 (9.3.3.2.3 참조) |
| bottomBorder | 아래쪽 테두리 (9.3.3.2.3 참조) |
| diagonal | 대각선 (9.3.3.2.3 참조) |
| fillBrush | 채우기 정보 |

##### 9.3.3.2.2 SlashType

테두리/배경 설정 중, 대각선의 정보를 담기 위한 요소이다.

#### 표 34 -- SlashType 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | Slash/BackSlash의 모양: `NONE` (없음), `CENTER` (중심선만), `CENTER_BELOW` (중심선 + 중심선아래선), `CENTER_ABOVE` (중심선 + 중심선위선), `ALL` (중심선 + 아래선 + 위선) |
| Crooked | 꺾인 대각선. Slash/BackSlash의 가운데 대각선이 꺾인 대각선임을 나타냄 |
| isCounter | slash/backSlash 대각선의 역방향 여부 |

##### 9.3.3.2.3 BorderType

`<leftBorder>`, `<rightBorder>`, `<topBorder>`, `<bottomBorder>`, `<diagonal>`은 모두 같은 형식을 가진다.

#### 표 35 -- BorderType 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 테두리선의 종류 |
| width | 테두리선의 굵기. 단위는 mm |
| color | 테두리선의 색상 |

#### 샘플 13 -- BorderType 예

```xml
<hh:borderFill id="4" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
  <hh:slash type="NONE" Crooked="0" isCounter="0"/>
  <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
  <hh:leftBorder type="DOUBLE_SLIM" width="0.7 mm" color="#000000"/>
  <hh:rightBorder type="DOUBLE_SLIM" width="0.7 mm" color="#000000"/>
  <hh:topBorder type="DOUBLE_SLIM" width="0.7 mm" color="#000000"/>
  <hh:bottomBorder type="DOUBLE_SLIM" width="0.7 mm" color="#000000"/>
  <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
</hh:borderFill>
```

##### 9.3.3.2.4 fillBrush 요소

`<fillBrush>` 요소는 세 개의 하위 요소 중 하나의 요소를 가질 수 있다(choice). 즉, 채우기는 면 채우기/그러데이션/그림으로 채우기 중 하나의 형식만을 가져야 한다.

#### 표 36 -- fillBrush 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| winBrush | 면 채우기 |
| gradation | 그러데이션 효과 |
| imgBrush | 그림으로 채우기 |

#### 샘플 14 -- fillBrush 예

```xml
<hh:fillBrush>
  <hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/>
</hh:fillBrush>
```

##### winBrush 요소

면 채우기 정보를 표현하기 위한 요소이다. 면 채우기 정보에는 면 색, 무늬 색, 무늬 종류, 투명도 등이 있다. 만약 면 채우기가 무늬를 포함하지 않으면 무늬 색은 사용되지 않는다.

#### 표 37 -- winBrush 요소

| 속성 이름 | 설명 |
|-----------|------|
| faceColor | 면 색 |
| hatchColor | 무늬 색 |
| hatchStyle | 무늬 종류 |
| alpha | 투명도 |

#### 샘플 15 -- winBrush 예

```xml
<hh:fillBrush>
  <hc:winBrush faceColor="#FFD700" hatchColor="#B2B2B2" hatchStyle="VERTICAL" alpha="0"/>
</hh:fillBrush>
```

##### gradation 요소

`<gradation>` 요소는 한 색상에서 다른 색상으로 점진적 또는 단계적으로 변화하는 기법을 표현하기 위한 요소이다.

#### 표 38 -- gradation 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 그러데이션 유형 |
| angle | 그러데이션의 기울임(시작 각) |
| centerX | 그러데이션의 가로 중심(중심 X 좌표) |
| centerY | 그러데이션의 세로 중심(중심 Y 좌표) |
| step | 그러데이션의 번짐 정도 |
| colorNum | 그러데이션의 색 수 |
| stepCenter | 그러데이션 번짐 정도의 중심 |
| alpha | 투명도 |

#### 표 39 -- gradation 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| color | 그러데이션 색 정보 |

#### 샘플 16 -- gradation 예

```xml
<hh:fillBrush>
  <hh:gradation type="SQUARE" angle="0" centerX="50" centerY="0" step="255"
    colorNum="2" stepCenter="50" alpha="0">
    <hc:color value="#6182D6"/>
    <hc:color value="#FFFFFF"/>
  </hh:gradation>
</hh:fillBrush>
```

##### color 요소

그러데이션 색상으로 표현하기 위한 요소로, 점진적으로 또는 단계적으로 변화하는 색상 중 시작 색, 또는 끝 색, 중간 단계 색 등을 표현한다.

#### 표 40 -- color 요소

| 속성 이름 | 설명 |
|-----------|------|
| value | 색 값 |

##### imgBrush 요소

그림으로 특정 부분을 채울 때 사용되는 요소로, 지정된 그림을 지정된 효과를 사용해서 채운다. 사용할 수 있는 효과에는 '크기에 맞추어', '위로/가운데로/아래로', '바둑판식으로' 등이 있다.

#### 표 41 -- imgBrush 요소

| 속성 이름 | 설명 |
|-----------|------|
| mode | 채우기 유형 |

#### 표 42 -- imgBrush 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| img | 그림 정보 |

#### 샘플 17 -- imgBrush 예

```xml
<hh:fillBrush>
  <hc:imgBrush mode="TOTAL">
    <hc:img binaryItemIDRef="image1" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
  </hc:imgBrush>
</hh:fillBrush>
```

##### img 요소

그림 정보를 표현하기 위한 요소이다. 그림 데이터에 대한 참조 아이디 및 그림에 적용될 몇몇 효과들에 대한 정보를 포함한다.

#### 표 43 -- img 요소

| 속성 이름 | 설명 |
|-----------|------|
| bright | 그림의 밝기 |
| contrast | 그림의 명암 |
| effect | 그림의 추가 효과: `REAL_PIC` (원래 그림대로), `GRAY_SCALE` (그레이 스케일로), `BLACK_WHITE` (흑백으로) |
| binaryItemIDRef | BinDataItem 요소의 아이디 참조값. 그림의 바이너리 데이터에 대한 연결 정보 |
| alpha | 투명도 |

#### 샘플 18 -- img 예

```xml
<hc:img binaryItemIDRef="image1" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
```
