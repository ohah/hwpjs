# 9.3.11 trackChanges 요소

#### 9.3.11.1 trackChanges

변경 추적 정보 목록을 가지고 있는 요소이다.

#### 표 89 -- trackChanges 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 변경 추적의 개수 |

#### 표 90 -- trackChanges 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| trackChange | 변경 추적 정보 |

#### 샘플 44 -- trackChanges 예

```xml
<hh:trackChanges itemCnt="5">
  <hh:trackChange type="Insert" date="2021-10-15T01:08:00Z" authorID="1" hide="0" id="1"/>
  <hh:trackChange type="Insert" date="2021-10-15T01:47:00Z" authorID="1" hide="0" id="2"/>
  <hh:trackChange type="ParaShape" date="2021-10-15T01:47:00Z" authorID="1" hide="0"
    id="3" parashapeID="0"/>
  <hh:trackChange type="Insert" date="2021-10-15T01:51:00Z" authorID="1" hide="0" id="4"/>
  <hh:trackChange type="ParaShape" date="2021-10-15T01:51:00Z" authorID="1" hide="0"
    id="5" parashapeID="20"/>
</hh:trackChanges>
```

#### 9.3.11.2 trackChange 요소

변경 추적 정보를 가지고 있는 요소이다.

#### 표 91 -- trackChange 요소

| 속성 이름 | 설명 |
|-----------|------|
| type | 변경 추적의 종류: `UnKnown` (없음), `Insert` (삽입), `Delete` (삭제), `CharShape` (글자 서식 변경), `ParaShape` (문단 서식 변경) |
| date | 변경 추적 시간. 형식: `%04d-%02d-%02dT%d:%d:%dZ` (년,월,일,시,분) |
| authorID | 변경 추적 검토자를 구별하기 위한 아이디 |
| charShapeID | 변경 추적 글자의 서식 정보 |
| paraShapeID | 변경 추적 문단의 서식 정보 |
| hide | 변경 추적 화면 표시 여부 |
| id | 변경 추적 적용 문서 구분 아이디 |
