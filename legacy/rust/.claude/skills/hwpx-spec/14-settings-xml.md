# 14 settings xml 스키마

## 14.1 네임스페이스

settings XML은 기본적으로 `http://www.owpml.org/owpml/2024/app`을 기본 네임스페이스로 사용한다. 기본 네임스페이스의 접두어(prefix)는 기본적으로 `ha`를 사용한다. 잘못된 사용을 줄이기 위해서 `ha`를 기본 네임스페이스(`http://www.owpml.org/owpml/2024/app`) 이외의 네임스페이스에 사용하지 않는 것을 권고한다.

## 14.2 settings xml 구조

### 14.2.1 settings.xml

`<HWPApplicationSetting>` 요소는 settings.xml 파일에서 최상위 요소로서, 문서의 설정 관련 값들을 가지고 있다.

#### 표 313 -- HWPApplicationSetting 요소

| 하위 요소 이름 | 설명 |
|---|---|
| CaretPosition | 문서의 커서 위치 정보 |
| config-item | 문서 설정 요소에 대한 정보 |

#### 샘플 176 -- HWPApplicationSetting 예

```xml
<ha:HWPApplicationSetting xmlns:ha="http://www.owpml.org/owpml/2024/app"
  xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">
  <ha:CaretPosition listIDRef="0" paraIDRef="12" pos="6"/>
</ha:HWPApplicationSetting>
```

### 14.2.2 CaretPosition 요소

#### 표 314 -- CaretPosition 요소

| 속성 이름 | 설명 |
|---|---|
| listIDRef | 리스트 아이디 |
| paraIDRef | 문단 아이디 |
| pos | 문단 내의 글자 위치 |

#### 샘플 177 -- CaretPosition 예

```xml
<ha:CaretPosition listIDRef="0" paraIDRef="34" pos="96"/>
```

### 14.2.3 config-item-set 요소

#### 14.2.3.1 config-item-set

`<config-item-set>`는 문서의 설정값들을 가질 수 있는 요소이다.

자세한 내용은 ODF - 3.10.2(`http://docs.oasis-open.org/office/v1.2/OpenDocument-v1.2-part1.pdf`)를 참고한다.

#### 표 315 -- config-item-set 요소

| 속성 이름 | 설명 |
|---|---|
| name | 설정 요소 이름 |

#### 표 316 -- config-item-set 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| config-item | 설정 요소에 대한 정보 |

#### 14.2.3.2 config-item 요소

`<config-item>`는 문서의 설정 정보들을 가질 수 있는 요소이다.

#### 표 317 -- config-item 요소

| 속성 이름 | 설명 |
|---|---|
| name | 설정 이름 |
| type | 설정 데이터 타입 |
