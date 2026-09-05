# 8.4 OPF OWPML 프로파일

## 8.4.1 OPF 도입

OWPML은 기본 OPF 스펙에서 몇 가지 요소를 추가해서 사용한다.

## 8.4.2 OPF 적용 요소

`<package>` - `<manifest>` - `<item>`에 속성 추가 사항이 있다.

OPF의 manifest 정보만으로는 OWPML에서 사용하기에 부족하다. 이에 따라 `@isEmbedded` 속성과 `@sub-path` 속성을 추가하였다. 두 속성은 OWPML 부합화된 OPF에서는 반드시 사용되어야 하는 필수 속성이다.

| 속성 | 설명 |
|---|---|
| `@isEmbedded` | 선언된 리소스가 컨테이너 내에 포함되어 있는지를 나타내기 위한 속성 |
| `@sub-path` | 컨테이너 내에서 찾을 수 없는 리소스를 외부에서 찾기 위한 경로를 지정하는 속성 |

## 8.4.3 Metadata profile

Metadata 요소는 하위 요소들로 문서 내용에 대한 메타데이터를 가지고 있게 된다. 메타데이터는 Dublin Core 메타데이터 표준을 사용할 수 있다.

- 관련 문서: http://dublincore.org/

### 표 10 -- metadata 형식

| 설명 | 바이너리 형식에서의 이름 | 새 파일 형식에서의 이름 |
|---|---|---|
| 제목 | 005HwpSummaryInfomation | `<dc:title>` |
| 주제 | 005HwpSummaryInfomation | `<dc:subject>` |
| 지은이 | 005HwpSummaryInfomation | `<dc:creator>` |
| 작성된 시각 | 005HwpSummaryInfomation | `<meta name="CreateDate">` |
| 수정된 시각 | - | `<meta name="ModifiedDate">` |
| 키워드 | 005HwpSummaryInfomation | `<meta name="Keywords">` |
| 기타 설명 | 005HwpSummaryInfomation | `<dc:description>` |
| 작성 회사 (출판사) | - | `<dc:publisher>` |
| 언어 | - | `<dc:language>` |

**샘플 4: metadata의 예**

```xml
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>예제 문서</dc:title>
  <dc:creator>오피스요소기술팀</dc:creator>
  <dc:publisher>한글과컴퓨터</dc:publisher>
  <dc:language xsi:type="dcterms:RFC3066">ko</dc:language>
  <dc:description>문서에 대한 요약 정보. 기존 comments에 해당.</dc:description>
  <meta content="text" name="CreatedDate">2010-12-14T 14:01:00Z</meta>
  <meta content="text" name="ModifiedDate">2010-12-14T 14:01:00Z</meta>
  <meta content="text" name="Keywords">키워드 예제</meta>
</metadata>
```
