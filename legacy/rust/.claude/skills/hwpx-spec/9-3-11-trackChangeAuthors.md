# 9.3.12 trackChangeAuthors 요소

#### 9.3.12.1 trackChangeAuthors 일반 항목

변경 추적 검토자 목록을 가지고 있는 요소이다.

#### 표 92 -- trackChangeAuthors 요소

| 속성 이름 | 설명 |
|-----------|------|
| itemCnt | 변경 추적 검토자 수 |

#### 표 93 -- trackChangeAuthors 하위 요소

| 하위 요소 이름 | 설명 |
|---------------|------|
| trackChangeAuthor | 변경 추적 검토자 |

#### 샘플 45 -- trackChangeAuthors 예

```xml
<hh:trackChangeAuthors itemCnt="1">
  <hh:trackChangeAuthor name="hancom" mark="1" id="1"/>
</hh:trackChangeAuthors>
```

#### 9.3.12.2 trackChangeAuthor 요소

변경 추적 검토자 정보를 가지고 있는 요소이다.

#### 표 94 -- trackChangeAuthor 요소

| 속성 이름 | 설명 |
|-----------|------|
| name | 검토자 이름 |
| mark | 검토 표시 여부 |
| color | 검토 표시 색상 |
| id | 검토자를 구별하기 위한 아이디 |

#### 샘플 46 -- trackChangeAuthor 예

```xml
<hh:trackChangeAuthors itemCnt="1">
  <hh:trackChangeAuthor name="hancom" mark="1" id="1"/>
</hh:trackChangeAuthors>
```
