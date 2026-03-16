# 15 암호화

## 15.1 Manifest

ODF(Open Document Format) 표준에서 정의하고 있는 암호화를 사용하여 문서의 암호를 설정하는 것으로 `META-INF/Manifest.xml` (7.1 OCF OWPML 프로파일 참조)에 기입된다.

OWPML 문서는 문서 암호화를 위해 다음의 알고리즘을 사용하여야 한다.

- 암호화 알고리즘: AES128, AES192, AES256
- 해쉬 알고리즘: SHA1, SHA256, PBKDF2

자세한 내용은 ODF - 3.4 Encryption(`http://docs.oasis-open.org/office/v1.2/OpenDocument-v1.2-part3.pdf`)을 참고한다.

### Manifest.xml 전체 예시

```xml
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <odf:file-entry full-path="Contents/header.xml" media-type="application/xml" size="41153">
    <odf:encryption-data checksum-type="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k"
      checksum="axrtFWccmPDGJOpM1jzyFvQw8xzu58tmoz7D/ZMrnuw=">
      <odf:algorithm algorithm-name="http://www.w3.org/2001/04/xmlenc#aes256-cbc"
        initialisation-vector="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:key-derivation
        key-derivation-name="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#pbkdf2"
        key-size="32" iteration-count="1024" salt="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:start-key-generation
        start-key-generation-name="http://www.w3.org/2000/09/xmldsig#sha256"
        key-size="32"/>
    </odf:encryption-data>
  </odf:file-entry>
  <odf:file-entry full-path="Contents/masterpage0.xml" media-type="application/xml" size="3600">
    <odf:encryption-data checksum-type="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k"
      checksum="/wXg7DbBwVqtMcQn/sefu23svI0WmPel1lKjZ96Y0go=">
      <odf:algorithm algorithm-name="http://www.w3.org/2001/04/xmlenc#aes256-cbc"
        initialisation-vector="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:key-derivation
        key-derivation-name="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#pbkdf2"
        key-size="32" iteration-count="1024" salt="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:start-key-generation
        start-key-generation-name="http://www.w3.org/2000/09/xmldsig#sha256"
        key-size="32"/>
    </odf:encryption-data>
  </odf:file-entry>
  <odf:file-entry full-path="Contents/section0.xml" media-type="application/xml" size="15784">
    <odf:encryption-data checksum-type="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k"
      checksum="9t3b/lX2/dyydykGh/dTpmmjGS7dVVr05JDLDZDxJsU=">
      <odf:algorithm algorithm-name="http://www.w3.org/2001/04/xmlenc#aes256-cbc"
        initialisation-vector="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:key-derivation
        key-derivation-name="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#pbkdf2"
        key-size="32" iteration-count="1024" salt="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:start-key-generation
        start-key-generation-name="http://www.w3.org/2000/09/xmldsig#sha256"
        key-size="32"/>
    </odf:encryption-data>
  </odf:file-entry>
  <odf:file-entry full-path="Preview/PrvText.txt" media-type="text/xml" size="255">
    <odf:encryption-data checksum-type="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k"
      checksum="/2RFDWNkVjLAH6RQ2/v5fPKxKGBkVTqHfLIXFdGT/lg=">
      <odf:algorithm algorithm-name="http://www.w3.org/2001/04/xmlenc#aes256-cbc"
        initialisation-vector="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:key-derivation
        key-derivation-name="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#pbkdf2"
        key-size="32" iteration-count="1024" salt="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:start-key-generation
        start-key-generation-name="http://www.w3.org/2000/09/xmldsig#sha256"
        key-size="32"/>
    </odf:encryption-data>
  </odf:file-entry>
  <odf:file-entry full-path="settings.xml" media-type="text/xml" size="710">
    <odf:encryption-data checksum-type="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k"
      checksum="ON2psyLNj74VkgsTdXgcs2l4kt/tbCizLkQMYvxi7M8=">
      <odf:algorithm algorithm-name="http://www.w3.org/2001/04/xmlenc#aes256-cbc"
        initialisation-vector="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:key-derivation
        key-derivation-name="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#pbkdf2"
        key-size="32" iteration-count="1024" salt="WTXbaTrbsZKVtwjKYJTqDg=="/>
      <odf:start-key-generation
        start-key-generation-name="http://www.w3.org/2000/09/xmldsig#sha256"
        key-size="32"/>
    </odf:encryption-data>
  </odf:file-entry>
</odf:manifest>
```

## 15.2 Manifest 요소

### 15.2.1 Manifest

패키지 내의 암호화되는 파일에 대한 정보를 가지고 있다.

#### 표 318 -- Manifest 요소

| 하위 요소 이름 | 설명 |
|---|---|
| fileEntry | 패키지 내의 단일한 파일을 표현 |

### 15.2.2 fileEntry 요소

#### 15.2.2.1 fileEntry

패키지 내의 단일한 파일 정보를 가지고 있다.

#### 표 319 -- fileEntry 요소

| 속성 이름 | 설명 |
|---|---|
| fullPath | 패키지 내의 단일한 파일 위치 |
| mediaType | 파일의 mime 타입 |
| size | 파일의 크기 |

#### 표 320 -- fileEntry 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| encryptionData | 패키지 내의 단일한 파일을 표현 |

#### 샘플 178 -- fileEntry 예

```xml
<odf:file-entry full-path="Contents/header.xml" media-type="application/xml" size="41153">
    ......
</odf:file-entry>
```

### 15.2.2.2 encryptionData 요소

파일의 복호화에 요구되는 정보를 가지고 있다.

#### 표 321 -- encryptionData 요소

| 속성 이름 | 설명 |
|---|---|
| checksumType | 설정한 암호의 정확성의 점검 알고리즘의 이름 |
| checksum | 설정한 암호의 정확성의 점검 알고리즘의 base64 인코딩 값 |

#### 표 322 -- encryptionData 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| algorithm | 데이터 암호화 알고리즘 정보 |
| keyDerivation | 설정한 암호로부터 파일의 암호화 키를 생성하기 위한 정보 |
| startKeyGeneration | 설정한 암호의 시작키 |

#### 샘플 179 -- encryptionData 예

```xml
<odf:file-entry full-path="Contents/header.xml" media-type="application/xml" size="31158">
  <odf:encryption-data
    chcksum-type="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k"
    chcksum="uIieJF...">
    <odf:algorithm algorithm-name="http://www.w3.org/2001/04/xmlenc#aes256-cbc"
      initialisation-vector="hJs..."/>
    <odf:key-derivation
      key-derivation-name="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#pbkdf2"
      key-size="32" iteration-count="1024" salt="..."/>
    <odf:start-key-generation
      start-key-generation-name="http://www.w3.org/2000/09/xmldsig#sha256"
      key-size="32"/>
  </odf:encryption-data>
</odf:file-entry>
```
