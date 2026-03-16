# 11 바탕쪽 설정 XML 스키마

## 11.1 바탕쪽 정보

### 11.1.1 바탕쪽

바탕쪽의 레이아웃 설정 정보를 가지고 있는 요소이며, 이를 표현하기 위한 스키마이다.

#### 표 298 -- masterPage 요소

| 속성 이름 | 설명 |
|---|---|
| id | 바탕쪽 설정 정보 식별자 |
| type | 바탕쪽이 적용되는 형식. `BOTH`: 모두 적용, `EVEN`: 짝수쪽, `ODD`: 홀수쪽, `LAST_PAGE`: 마지막쪽, `OPTIONAL_PAGE`: 임의의 쪽 |
| pageNumber | type 속성값이 `OPTIONAL_PAGE`인 경우 임의의 쪽 번호 |
| pageDuplicate | 기본 바탕쪽과 확장 바탕쪽이 겹쳐질지 여부. 바탕쪽(기본 바탕쪽): 구역의 홀수, 짝수, 양쪽에 적용되는 바탕쪽. 확장 바탕쪽: 구역의 임의의 페이지나 구역시작, 구역 끝에 적용할 수 있는 바탕쪽. 예: 바탕쪽 홀수를 지정하고, 확장바탕쪽 구역 시작페이지에 바탕쪽을 지정하면, 기본 바탕쪽과 확장바탕쪽이 겹쳐서 나올 수도 있음. |
| pageFront | 바탕쪽 앞으로 보내기 여부 |

#### 표 299 -- masterPage 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| subList | 바탕쪽 내용 |

### 11.1.2 참조

#### 샘플 168 -- masterPage 예

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hm:masterPage xmlns:hp="http://www.owpml.org/owpml/2024/paragraph"
  xmlns:hm="http://www.owpml.org/owpml/2024/master-page"
  id="masterpage0" type="BOTH" pageNumber="0" pageDuplicate="0" pageFront="0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xml="http://www.w3.org/XML/1998/namespace">
    <hm:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0"
      linkListNextIDRef="0" textWidth="42520" textHeight="65762" hasTextRef="0" hasNumRef="0">
        <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
            <hp:run charPrIDRef="6">
                <hp:t>바탕쪽내용</hp:t>
            </hp:run>
        </hp:p>
    </hm:subList>
</hm:masterPage>
```

## 11.1.2 subList 요소

`<subList>` 요소는 반드시 한 개 이상의 문단을 하위 요소로 가지고 있어야 한다. HWP 문서 콘텐츠에 내용(글자, 표, 그림 등)이 없다고 해도 `<subList>` 요소는 빈 내용을 가지는 `<p>` 자식 요소를 가지고 있어야 한다. `<p>` 요소에 대한 자세한 설명은 10.4를 참조한다.

#### 표 300 -- subList 요소

| 속성 이름 | 설명 |
|---|---|
| id | 문단 목록을 식별하기 위한 아이디 |
| textDirection | 텍스트 방향 |
| lineWrap | 경계에서 줄나눔 방식 |
| vertAlign | 세로 정렬 |
| linkListIDRef | list ID reference |
| linkListNextIDRef | list ID와 연결된 ID reference |
| textWidth | 텍스트 영역의 폭 |
| textHeight | 텍스트 영역의 높이 |
| hasTextRef | 해당 레벨의 텍스트에 대한 참조 여부 |
| hasNumRef | 해당 레벨의 번호에 대한 참조 여부 |
| metatag | 메타태그 관련 정보 |

#### 표 301 -- subList 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| p | 문단 |

#### 샘플 169 -- subList 예

```xml
<hm:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0"
  linkListNextIDRef="0" textWidth="42520" textHeight="65762" hasTextRef="0" hasNumRef="0">
  <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="6">
      <hp:t>바탕쪽</hp:t>
    </hp:run>
  </hp:p>
</hm:subList>
```
