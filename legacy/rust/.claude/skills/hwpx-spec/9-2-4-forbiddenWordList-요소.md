# 9.2.4 forbiddenWordList 요소

`<forbiddenWordList>` 요소는 금칙 문자의 목록이다.

#### 표 15 -- forbiddenWordList 속성

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 금칙 문자의 개수 |

| 하위 요소 이름 | 설명 |
|---------------|------|
| forbiddenWord | 금칙 문자. 요소의 값으로 문자열을 가짐. |

`<forbiddenWord>` 자식 요소는 요소 값으로 금칙 문자열을 가지는 단순 형식의 요소이다.

#### 샘플 7 -- forbiddenWordList 예

```xml
<forbiddenWordList itemCnt="2">
  <forbiddenWord>d</forbiddenWord>
  <forbiddenWord>f</forbiddenWord>
</forbiddenWordList>
```
