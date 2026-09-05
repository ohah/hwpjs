# 9.2.6 trackChangeConfig 요소

#### 9.2.6.1 trackChangeConfig

`<trackChangeConfig>`는 변경 추적에 대한 상태 정보와 암호 정보를 가지고 있다.

#### 표 18 -- trackChangeConfig 요소

| 속성 이름 | 설명 |
|-----------|------|
| flags | 변경 추적 상태 정보 |

| 하위 요소 이름 | 설명 |
|---------------|------|
| config-item-set | 변경 추적 암호 정보 |

`<trackChangeConfig>`의 하위 속성인 flag 값은 변경 추적 문서의 상태 및 표시 정보 값을 가지고 있다.

#### 표 19 -- flag 값

| flag 값 | 설명 |
|---------|------|
| 0x00000001 | 변경 추적 상태 |
| 0x00000002 | 변경 추적 원본 |
| 0x00000004 | 변경 내용 안보기 |
| 0x00000008 | 변경 추적 문장 안 표시 |
| 0x00000010 | 변경 추적 서식 표시 |
| 0x00000020 | 변경 추적 삽입/삭제 표시 |

#### 9.2.6.2 config-item-set 요소

`<config-item-set>` 요소는 변경 추적 암호 정보를 갖고 있는 요소로 13.2.2의 속성을 따른다.

#### 샘플 9 -- config-item-set 예

```xml
<config:config-item-set name="TrackChangePasswordInfo">
  <config:config-item name="algorithm-name" type="string">PBKDF2</config:config-item>
  <config:config-item name="salt" type="base64Binary">nsJ...
  </config:config-item>
  <config:config-item name="iteration-count" type="int">1024
  </config:config-item>
  <config:config-item name="hash" type="base64Binary">j2E...
  </config:config-item>
</config:config-item-set>
```
