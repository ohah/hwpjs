# 12 문서 이력 정보 XML 스키마

## 12.1 문서 이력 정보

문서 이력 정보 XML 스키마는 문서 변경사항 이력 추적을 위한 저장 XML 스키마이다.

## 12.2 history 요소

### 12.2.1 history

문서 이력 정보 목록을 가지고 있는 요소이다.

#### 표 302 -- history 요소

| 속성 이름 | 설명 |
|---|---|
| version | OWPML history XML의 버전. 이 문서 기준으로 현재 버전은 1.0임. |

#### 표 303 -- history 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| historyEntry | Revision별 히스토리 정보를 담고 있는 요소 |

#### 샘플 170 -- history 예

```xml
<hhs:history xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" version="1.0.0.1">
  <hhs:historyEntry revisionNumber="1" revisionDate="2021-11-22 07:59:55.579"
    revisionAuthor="hancom1" revisionDesc="" autoSave="0">
    <hhs:headDiff href="">
      <hhs:update path="DOCSETTING[1]" oldValue="">
        <hhs:update path="CARETPOS[1]" oldValue="">
          <hhs:update path="@Para" oldValue="1"/>
          <hhs:update path="@Pos" oldValue="0"/>
        </hhs:update>
      </hhs:update>
    </hhs:headDiff>
    ......
  </hhs:historyEntry>
</hhs:history>
```

### 12.2.2 historyEntry 요소

#### 12.2.2.1 historyEntry

실제 변경 내용을 가지고 있는 요소이다.

#### 표 304 -- historyEntry 요소

| 속성 이름 | 설명 |
|---|---|
| revisionNumber | 이력 번호 |
| revisionDate | 이력 날짜 |
| revisionAuthor | 이력 작성자 |
| revisionDesc | 이력 설명 |
| revisionLock | 이력 잠금 여부 |
| autoSave | 이력 자동 저장 여부 |

#### 표 305 -- historyEntry 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| packageDiff | OWPML Package의 이력 내용을 담고 있는 요소 (12.2.2.2 참조) |
| headDiff | OWPML Head의 이력 내용을 담고 있는 요소 (12.2.2.2 참조) |
| bodyDiff | OWPML Body의 이력 내용을 담고 있는 요소 (12.2.2.2 참조) |
| tailDiff | OWPML TAIL의 이력 내용을 담고 있는 요소 |

#### 샘플 171 -- historyEntry 예

```xml
<hhs:historyEntry revisionNumber="1" revisionDate="2021-11-22 07:59:55.579"
  revisionAuthor="hancom1" revisionDesc="" autoSave="0">
  ......
  <hhs:headDiff href="">
    ......
  </hhs:headDiff>
  <hhs:bodyDiff href="">
    ......
  </hhs:bodyDiff>
  <hhs:tailDiff href="">
    ......
  </hhs:tailDiff>
</hhs:historyEntry>
```

### 12.2.2.2 DiffEntryType

#### 12.2.2.2.1 DiffEntryType

문서의 변경 이력을 종류별로 구분하기 위한 요소 형태이다. 변경 이력 종류에는 추가, 수정, 삭제가 있다.

#### 표 306 -- DiffEntryType 요소

| 속성 이름 | 설명 |
|---|---|
| href | 변경 추적 대상 파일의 경로. 지정되는 경로는 컨테이너 내에서의 절대 경로임. |

#### 표 307 -- DiffEntryType 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| insert | 새로운 내용 추가 이력 정보 |
| update | 내용 변경 이력 정보 |
| delete | 내용 삭제 이력 정보 |

#### 샘플 172 -- DiffEntryType 예

```xml
<hhs:bodyDiff href="">
  <hhs:update path="SECTION[1]" oldValue="">
    <hhs:update path="P[1]" oldValue="">
      <hhs:insert path="TEXT[2]"/>
      <hhs:position path="TEXT[1]"/>
      <hhs:delete path="">
        <TEXT CharShape="0">
          <CHAR> </CHAR>
        </TEXT>
      </hhs:delete>
    </hhs:update>
  </hhs:update>
</hhs:bodyDiff>
```

#### 12.2.2.2.2 DiffDataType

문서 이력 내용이 적용될 대상의 경로를 가지고 있는 요소 형태이다.

#### 표 308 -- DiffDataType 요소

| 속성 이름 | 설명 |
|---|---|
| path | 이력 정보를 반영할 대상 노드의 경로. XPath로 대상 노드를 지정 |

#### 12.2.2.2.3 insert 요소

`<insert>` 요소는 [DiffDataType]을 확장해서 사용한다. [DiffDataType]의 자세한 내용은 12.2.2.2.2를 참조한다.

#### 샘플 173 -- insert 예

```xml
<hhs:insert path="P[2]"/>
```

#### 12.2.2.2.4 update 요소

`<update>` 요소는 [DiffDataType]을 확장해서 사용한다. [DiffDataType]의 자세한 내용은 12.2.2.2.2를 참조한다.

#### 표 309 -- update 요소

| 속성 이름 | 설명 |
|---|---|
| oldValue | 변경사항이 반영되기 이전의 값 |

#### 표 310 -- update 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| insert | 새로운 내용 추가 이력 정보 |
| update | 내용 변경 이력 정보 |
| delete | 내용 삭제 이력 정보 |

#### 샘플 174 -- update 예

```xml
<hhs:update path="MAPPINGTABLE[1]" oldValue="">
  <hhs:update path="CHARSHAPELIST[1]" oldValue="">
    <hhs:update path="@Count" oldValue="7"/>
    <hhs:insert path="CHARSHAPE[8]"/>
  </hhs:update>
</hhs:update>
```

#### 12.2.2.2.5 delete 요소

`<delete>` 요소는 [DiffDataType]을 확장해서 사용한다. [DiffDataType]의 자세한 내용은 12.2.2.2.2를 참조한다.

#### 표 311 -- delete 요소

| 하위 요소 이름 | 설명 |
|---|---|
| ##any | 자식으로 가질 수 있는 요소 형식에 제한이 없음. |

#### 샘플 175 -- delete 예

```xml
<hhs:update path="SECTION[1]" oldValue="">
  <hhs:update path="P[1]" oldValue="">
    <hhs:insert path="TEXT[2]"/>
    <hhs:position path="TEXT[1]"/>
    <hhs:delete path="">
      <TEXT CharShape="0">
        <CHAR> </CHAR>
      </TEXT>
    </hhs:delete>
  </hhs:update>
</hhs:update>
```
