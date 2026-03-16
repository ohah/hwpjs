# 8. 컨테이너 및 패키징

## 8.1 OCF

OWPML 문서는 콘텐츠를 구성하는 여러 파일들을 물리적으로 하나의 파일로 묶기 위해 개방형 컨테이너 포맷인 OCF 규격을 기반으로 생성되어야 한다. OCF에 관한 자세한 내용은 IDPF OCF 2.0.1 표준(http://idpf.org/epub/20/spec/OCF_2.0.1_draft.doc)을 참조한다.

OWPML 문서는 콘텐츠를 구성하는 다양한 유형의 파일들 간의 논리적 구조를 정의하기 위한 패키징 포맷으로 전자책의 논리적 구조를 정의하는 OPF를 사용한다. OPF에 관한 자세한 내용은 IDPF OPF 2.0.1 표준을 참조한다.

## 8.2 OCF OWPML 프로파일

OWPML은 OCF에서 사용되는 기본 파일 및 디렉터리 외에 추가적인 파일 및 디렉터리를 사용한다. 그 중 `version.xml`은 필수적으로 사용되어야 하는 파일로써 OWPML 파일 형식에 대한 버전 정보를 가지고 있는 파일이다. 그 외의 "Preview 디렉터리", "Contents 디렉터리", "BinData 디렉터리", "Scripts 디렉터리", "XMLTemplate 디렉터리", "DocHistory 디렉터리", "Chart 디렉터리"는 선택적으로 사용되는 디렉터리로, 일부 디렉터리는 사용자 선택에 의해 사용되지 않을 수 있다.

### 컨테이너 파일 구조

```
파일 형식 정보
├── mimetype                          # ZIP Container 파일 버전 정보
├── version.xml                       # 메타데이터 폴더
├── META-INF/                         # 컨테이너 메타데이터
│   ├── container.xml                 # 파일 목록 메타데이터
│   ├── [manifest.xml]                # 문서에 대한 메타데이터
│   ├── [metadata.xml]                # 전자서명 정보
│   ├── [signatures.xml]              # 암호화 정보
│   ├── [encryption.xml]              # 권리사항 정보
│   └── [rights.xml]
├── Preview/                          # 미리보기 폴더
│   ├── PrvText.txt                   # 텍스트 미리보기
│   └── PrvImage.png                  # 이미지 미리보기
├── Chart/                            # 차트 폴더
│   └── chart1.xml                    # 차트 정보
├── Contents/                         # 콘텐츠 폴더
│   ├── content.hpf                   # 콘텐츠 패키지 정보
│   ├── header.xml                    # 헤더 정보
│   ├── section0.xml                  # 구역 정보 0
│   └── section1.xml                  # 구역 정보 1
├── BinData/                          # 바이너리 데이터 폴더
│   ├── img0.jpg                      # 이미지 파일
│   └── subdoc.hwpx                   # 첨부문서 파일
├── Scripts/                          # 스크립트 폴더
│   └── default.js                    # 스크립트 파일
├── XMLTemplate/                      # 템플릿 폴더
│   ├── TemplateSchema.xsd            # 템플릿 스키마
│   └── TemplateInstance.xml          # 템플릿 인스턴스 문서
├── DocHistory/                       # 문서 히스토리 폴더
│   └── VersionLog0.xml               # 문서 버전 정보
└── Custom/                           # 사용자 폴더
    └── Bibliography.xml              # 사용자 정보 샘플
```

추가적인 디렉터리 이름에 대해서는 이 표준에서는 강제하지는 않는다. 하지만 파일 형식에 대한 처리 효율 및 편의성을 위해서 위에 제시된 디렉터리 이름을 그대로 사용할 것을 권고한다.

## 8.3 파일 형식 버전 식별

리딩 시스템이 OWPML 문서 파일을 제대로 렌더링하기 위해서는 파일 형식 외에도 파일 형식에 대한 버전 식별이 필요하다. 가령 같은 OWPML 문서 파일 형식이라도 2.x의 구조와 3.x의 구조가 크게 다를 수 있고, 리딩 시스템이 2.x까지만을 지원한다고 하면 3.x의 문서 파일은 사용자를 위한 처리를 해야 한다. 이를 위해서는 파일 형식 버전 정보를 컨테이너의 특정 파일에 기록해야 한다.

OWPML 부합화된 OCF 컨테이너는 최상위 디렉터리의 직접 자식으로서 `version.xml`을 가지고 있어야 하며, 이 `version.xml` 파일 안에는 파일 형식에 대한 버전을 기록하고 있어야 한다.

### version.xml 스키마

`version.xml` 스키마는 `http://www.owpml.org/owpml/2024/version`을 기본 목표 네임스페이스로 사용한다.

파일 형식 버전은 아래와 같이 크게 네 가지로 구분된다:

| 버전 구분 | 설명 |
|---|---|
| `major` | 문서 형식의 구조가 완전히 바뀌는 것을 나타낸다. 값이 다르면 구버전과 호환이 불가능하다. |
| `minor` | 큰 구조는 동일하나, 큰 변화가 있는 것을 나타낸다. 값이 다르면 구버전과 호환이 불가능하다. |
| `micro` | 구조는 동일하다. 하위 요소가 추가되었거나, 하위 버전에서 호환되지 않는 정보가 추가된 것을 나타낸다. 숫자가 달라도 구버전과 호환이 가능하다. |
| `buildNumber` | 하위 요소에 정보들이 추가된 것을 나타낸다. 숫자가 달라도 구버전과 호환이 가능하다. |

> **주의:** `version.xml` 파일은 암호화 및 압축을 하지 말아야 한다.

**샘플 3: version.xml**

```xml
<hv:HCFVersion xmlns:hv="http://www.owpml.org/owpml/2024/version"
  tagetApplication="WORDPROCESSOR"
  major="5" minor="1" micro="0" buildNumber="1"
  os="1" xmlVersion="1.2"
  application="Hancom Office Hangul"
  appVersion="11, 0, 0, 2129 WIN32LEWindows_8"/>
```

## 8.4 OPF OWPML 프로파일

### 8.4.1 OPF 도입

OWPML은 기본 OPF 스펙에서 몇 가지 요소를 추가해서 사용한다.

### 8.4.2 OPF 적용 요소

`<package>` - `<manifest>` - `<item>`에 속성 추가 사항이 있다.

OPF의 manifest 정보만으로는 OWPML에서 사용하기에 부족하다. 이에 따라 `@isEmbedded` 속성과 `@sub-path` 속성을 추가하였다. 두 속성은 OWPML 부합화된 OPF에서는 반드시 사용되어야 하는 필수 속성이다.

| 속성 | 설명 |
|---|---|
| `@isEmbedded` | 선언된 리소스가 컨테이너 내에 포함되어 있는지를 나타내기 위한 속성 |
| `@sub-path` | 컨테이너 내에서 찾을 수 없는 리소스를 외부에서 찾기 위한 경로를 지정하는 속성 |

### 8.4.3 Metadata profile

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
