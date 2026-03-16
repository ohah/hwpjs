# 10.9.5 AbstractShapeComponentType

KS X 6101:2024 HWPX/OWPML 표준 - Section 10.9.5

---

### 10.9.5.1 AbstractShapeComponentType

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

### 10.9.5.2 객체가 속한 그룹 내에서의 오프셋 정보 -- `<offset>`

**표 211 -- offset 요소**

| 속성 이름 | 설명 |
|---|---|
| x | 객체가 속한 그룹 내에서의 x offset |
| y | 객체가 속한 그룹 내에서의 y offset |

```xml
<hp:offset x="0" y="0"/>
```

### 10.9.5.3 객체 생성 시 최초 크기 -- `<orgSz>`

**표 212 -- orgSz 요소**

| 속성 이름 | 설명 |
|---|---|
| width | 개체 생성 시 최초 폭. 단위는 HWPUNIT |
| height | 개체 생성 시 최초 높이. 단위는 HWPUNIT |

```xml
<hp:orgSz width="16800" height="12825"/>
```

### 10.9.5.4 객체의 현재 크기 -- `<curSz>`

**표 213 -- curSz 요소**

| 속성 이름 | 설명 |
|---|---|
| width | 개체의 현재 폭. 단위는 HWPUNIT |
| height | 개체의 현재 높이. 단위는 HWPUNIT |

```xml
<hp:curSz width="12500" height="5000"/>
```

### 10.9.5.5 객체가 뒤집어진 상태인지 여부 -- `<flip>`

**표 214 -- flip 요소**

| 속성 이름 | 설명 |
|---|---|
| horizontal | 좌우로 뒤집어진 상태인지 여부 |
| vertical | 상하로 뒤집어진 상태인지 여부 |

```xml
<hp:flip horizontal="1" vertical="0"/>
```

### 10.9.5.6 객체 회전 정보 -- `<rotationInfo>`

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

### 10.9.5.7 객체 렌더링 정보

#### 10.9.5.7.1 객체 렌더링 -- `<renderingInfo>`

객체 렌더링 시 필요한 변환 행렬, 확대/축소 행렬, 회전 행렬을 가지고 있는 요소이다.

**표 216 -- renderingInfo 요소**

| 하위 요소 이름 | 설명 |
|---|---|
| transMatrix | Translation Matrix (10.9.5.7.2 참조) |
| scaMatrix | Scaling Matrix (10.9.5.7.2 참조) |
| rotMatrix | Rotation Matrix (10.9.5.7.2 참조) |

#### 10.9.5.7.2 행렬 요소 형식 -- `[MatrixType]`

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
