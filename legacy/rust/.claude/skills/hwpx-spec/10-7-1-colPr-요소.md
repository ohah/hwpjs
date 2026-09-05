# 10.7 ctrl 요소 및 10.7.1 colPr 요소

## 10.7 ctrl 요소

`<ctrl>` 요소는 콘텐츠에서 본문 내 제어 관련 요소들을 모은 요소이다.

### ctrl 하위 요소 (표 126)

| 하위 요소 이름 | 설명 |
|---|---|
| `colPr` | 단 설정 정보 |
| `fieldBegin` | 필드 시작 |
| `fieldEnd` | 필드 끝 |
| `bookmark` | 책갈피 |
| `header` | 머리말 (10.7.5 머리말/꼬리말 요소 형식 참조) |
| `footer` | 꼬리말 (10.7.5 머리말/꼬리말 요소 형식 참조) |
| `footNote` | 각주 (10.7.6 각주/미주 요소 형식 참조) |
| `endNote` | 미주 (10.7.6 각주/미주 요소 형식 참조) |
| `autoNum` | 자동 번호 |
| `newNum` | 새 번호 |
| `pageNumCtrl` | 홀/짝수 조정 |
| `pageHiding` | 감추기 |
| `pageNum` | 쪽번호 위치 |
| `indexmark` | 찾아보기 표식 |
| `hiddenComment` | 숨은 설명 |

### XML 예

```xml
<hp:ctrl>
  <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
</hp:ctrl>
```

---

## 10.7.1 colPr 요소

### 10.7.1.1 colPr

단 설정 정보를 가지고 있는 요소이다.

#### colPr 속성 (표 127)

| 속성 이름 | 설명 |
|---|---|
| `id` | 단 설정 정보를 구별하기 위한 아이디 |
| `type` | 단 종류 |
| `layout` | 단 방향 지정 |
| `colCount` | 단 개수 |
| `sameSz` | 단 너비를 동일하게 지정할지 여부. true이면 동일한 너비, false이면 각기 다른 너비 |
| `sameGap` | 단 사이 간격. 단 너비를 동일하게 지정했을 경우에만 사용됨 |

#### colPr 하위 요소 (표 128)

| 하위 요소 이름 | 설명 |
|---|---|
| `colLine` | 단 구분선 |
| `colSz` | 단 사이 간격. 단 너비를 각기 다르게 지정했을 경우에만 사용됨 |

#### XML 예

```xml
<hp:ctrl>
  <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
</hp:ctrl>
```

### 10.7.1.2 colLine 요소

단 사이의 구분선 설정 정보를 가지고 있는 요소이다.

#### colLine 속성 (표 129)

| 속성 이름 | 설명 |
|---|---|
| `type` | 구분선 종류 |
| `width` | 구분선 굵기 |
| `color` | 구분선 색 |

#### XML 예

```xml
<hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="14174">
  <hp:colLine type="DOUBLE_SLIM" width="0.7 mm" color="#3A3C84"/>
</hp:colPr>
```

### 10.7.1.3 colSz 요소

`<colPr>`의 속성 중 `@sameSz` 속성이 false(각기 다른 단 사이 간격을 가짐)로 설정되었을 때에만 사용되는 요소이다.

#### colSz 속성 (표 130)

| 속성 이름 | 설명 |
|---|---|
| `width` | 단의 크기 |
| `gap` | 단 사이 간격 |

#### XML 예

```xml
<hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="0" sameGap="2268">
  <hp:colLine type="DOUBLE_SLIM" width="0.7 mm" color="#3A3C84"/>
  <hp:colSz width="20097" gap="1747"/>
  <hp:colSz width="10924" gap="0"/>
</hp:colPr>
```
