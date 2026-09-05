# 9.3.10 memoProperties 요소

#### 9.3.10.1 memoProperties

메모 모양 정보 목록을 가지고 있는 요소이다.

#### 표 86 -- memoProperties 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 메모 모양 정보의 개수 |

#### 표 87 -- memoProperties 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| memoPr | 메모 모양 정보 |

#### 샘플 43 -- memoProperties 예

```xml
<hh:memoProperties itemCnt="1">
  <hh:memoPr id="1" width="15591" lineWidth="1" lineType="SOLID" lineColor="#B6D7AE"
    fillColor="#F0FFE9" activeColor="#CFF1C7" memoType="NOMAL"/>
</hh:memoProperties>
```

#### 9.3.10.2 memoPr 요소

메모는 문서 작성 또는 수정 중 간략한 내용을 기록해 둘 수 있는 기능이다. `<memoPr>` 요소는 실제 메모 내용을 담고 있는 것이 아니라, 화면에 표시될 메모들의 모양 정보를 가지고 있는 요소이다. 즉, 메모 선의 색, 메모의 색 등 화면 표시를 위한 설정들을 담고 있다.

#### 표 88 -- memoPr 요소

| 속성 이름 | 설명 |
|-----------|------|
| id | 메모 모양 정보를 구별하기 위한 아이디 |
| width | 메모가 보이는 넓이 |
| lineType | 메모의 선 종류 |
| lineColor | 메모의 선 색 |
| fillColor | 메모의 색 |
| activeColor | 메모가 활성화되었을 때의 색 |
| memoType | 메모 변경 추적을 위한 속성 |
| lineWidth | 메모의 라인 두께 |
