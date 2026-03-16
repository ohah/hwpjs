# 10.7.8 ~ 10.7.12 페이지 제어 요소

## 10.7.8 pageNumCtrl 요소

쪽 번호를 홀수쪽, 짝수쪽 또는 양쪽 모두에 표시할지를 설정하기 위한 요소이다.

### pageNumCtrl 속성 (표 176)

| 속성 이름 | 설명 |
|---|---|
| `pageStartsOn` | 홀/짝수 구분 |

---

## 10.7.9 pageHiding 요소

현재 구역 내에서 감추어야 할 것들을 설정하기 위한 요소이다.

### pageHiding 속성 (표 177)

| 속성 이름 | 설명 |
|---|---|
| `hideHeader` | 머리말 감추기 여부 |
| `hideFooter` | 꼬리말 감추기 여부 |
| `hideMasterPage` | 바탕쪽 감추기 여부 |
| `hideBorder` | 테두리 감추기 여부 |
| `hideFill` | 배경 감추기 여부 |
| `hidePageNum` | 쪽 번호 감추기 여부 |

### XML 예

```xml
<hp:pageHiding hideHeader="0" hideFooter="0" hideMasterPage="0"
  hideBorder="0" hideFill="1" hidePageNum="0"/>
```

---

## 10.7.10 pageNum 요소

쪽 번호의 위치 및 모양을 설정하기 위한 요소이다.

### pageNum 속성 (표 178)

| 속성 이름 | 설명 |
|---|---|
| `pos` | 번호 위치 |
| `formatType` | 번호 모양 종류 |
| `sideChar` | 줄표 넣기 |

### XML 예

```xml
<hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/>
```

---

## 10.7.11 indexmark 요소

`<indexmark>`는 찾아보기(Index, 색인)와 관련된 정보를 갖고 있는 요소이다.

### indexmark 하위 요소 (표 179)

| 하위 요소 이름 | 설명 |
|---|---|
| `firstKey` | 찾아보기에 사용할 첫 번째 키워드. 요소의 값으로 키워드 문자열을 가짐 |
| `secondKey` | 찾아보기에 사용할 두 번째 키워드. 요소의 값으로 키워드 문자열을 가짐 |

### XML 예

```xml
<hp:indexmark>
  <hp:firstKey>aa</hp:firstKey>
  <hp:secondKey>aa</hp:secondKey>
</hp:indexmark>
```

---

## 10.7.12 hiddenComment 요소

`<hiddenComment>`는 숨은 설명 내용 정보를 갖고 있는 요소이다.

### hiddenComment 하위 요소 (표 180)

| 하위 요소 이름 | 설명 |
|---|---|
| `subList` | 숨은 설명 내용. 10.1.1 참조 |

### XML 예

```xml
<hp:hiddenComment>
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP"
    linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"
    hasTextRef="0" hasNumRef="0">
    <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
      <hp:run charPrIDRef="6">
        <hp:t>숨은 주석임.</hp:t>
      </hp:run>
    </hp:p>
  </hp:subList>
</hp:hiddenComment>
```
