# 8.2 OCF OWPML 프로파일

OWPML은 OCF에서 사용되는 기본 파일 및 디렉터리 외에 추가적인 파일 및 디렉터리를 사용한다. 그 중 `version.xml`은 필수적으로 사용되어야 하는 파일로써 OWPML 파일 형식에 대한 버전 정보를 가지고 있는 파일이다. 그 외의 "Preview 디렉터리", "Contents 디렉터리", "BinData 디렉터리", "Scripts 디렉터리", "XMLTemplate 디렉터리", "DocHistory 디렉터리", "Chart 디렉터리"는 선택적으로 사용되는 디렉터리로, 일부 디렉터리는 사용자 선택에 의해 사용되지 않을 수 있다.

## 컨테이너 파일 구조

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
