# 9.3.5 tabProperties 요소

#### 9.3.5.1 탭 정보

탭 정보 목록을 가지고 있는 요소이다.

#### 표 58 -- tabProperties 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 탭 정보의 개수 |

#### 표 59 -- tabProperties 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| tabPr | 탭 정보 |

#### 샘플 29 -- tabProperties 예

```xml
<hh:tabProperties itemCnt="3">
  <hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>
  <hh:tabPr id="1" autoTabLeft="1" autoTabRight="0"/>
  <hh:tabPr id="2" autoTabLeft="0" autoTabRight="1"/>
  <hh:tabPr id="3" autoTabLeft="0" autoTabRight="0">
    <hh:tabItem pos="32992" type="CENTER" leader="CIRCLE"/>
  </hh:tabPr>
</hh:tabProperties>
```

#### 9.3.5.2 tabPr 요소

##### 9.3.5.2.1 tabPr

탭(Tab) 정보는 한꺼번에 일정한 거리로 본문을 띄울 때 사용하는 요소이다. 탭은 여러 개의 항목을 세로로 가지런히 나열해 입력할 때에도 사용할 수 있다.

#### 표 60 -- tabPr 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 탭 정보를 구별하기 위한 아이디 |
| autoTabLeft | 문단 왼쪽 끝 자동 탭 여부 (내어쓰기용 자동 탭) |
| autoTabRight | 문단 오른쪽 끝 자동 탭 여부 |

#### 표 61 -- tabPr 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| tabItem | 탭 정의 정보 |

##### 9.3.5.2.2 tabItem 요소

탭의 모양 및 위치 정보 등을 표현하기 위한 요소이다.

#### 표 62 -- tabItem 요소

| 속성 이름 | 설명 |
|-----------|------|
| pos | 탭의 위치. 단위는 HWPUNIT |
| type | 탭의 종류: `LEFT` (왼쪽), `RIGHT` (오른쪽), `CENTER` (가운데), `DECIMAL` (소수점) |
| leader | 탭 채움 종류 |

#### 샘플 30 -- tabItem 예

```xml
<hh:tabItem pos="32992" type="CENTER" leader="CIRCLE"/>
```
