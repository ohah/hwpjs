# 16 전자서명

## 16.1 Signatures.xml

전자서명은 서명 알고리즘, 전자서명 값, 서명에 사용된 키의 정보를 사용하여 문서에 디지털 서명을 하는 기능으로 `<ds:SignedInfo>`, `<ds:SignatureValue>`, `<ds:KeyInfo>`을 사용한다. 전자서명에 대한 정보는 `META-INF/signatures.xml`에 기입된다.

OWPML 문서는 문서에 대한 전자서명을 위해 다음의 알고리즘을 사용하여야 한다.

- 기본 알고리즘: RSA2048withSHA256
- 해쉬 알고리즘: SHA256
- 정규화 알고리즘: c14n-20010315

세부적인 규격은 W3C Signature을 참고한다(`https://www.w3.org/TR/xmldsig-core`).

## 16.2 Signature의 요소

### 16.2.1 Signature

#### 표 323 -- Signature 요소

| 하위 요소 이름 | 설명 |
|---|---|
| ds:SignedInfo | 전자서명에 대한 정규화 알고리즘, 서명(해시) 알고리즘, 전자서명 대상에 대한 링크 정보 |
| ds:SignatureValue | base64 인코딩 전자서명 값 |
| ds:KeyInfo | 전자서명에 사용된 키에 대한 정보 |
| ds:Object | 전자서명 대상에 대한 정보 |

### 16.2.2 ds:SignedInfo의 요소

#### 16.2.2.1 ds:SignedInfo

#### 표 324 -- ds:SignedInfo 요소

| 하위 요소 이름 | 설명 |
|---|---|
| ds:CanonicalizationMethod | `<ds:SignedInfo>` 요소에 적용되어야 할 정규화 알고리즘 |
| ds:SignatureMethod | 전자서명 알고리즘 |
| ds:Reference | 전자서명된 원본 문서의 위치 및 서명 값에 대한 정보 |

#### 16.2.2.2 ds:SignatureMethod의 요소

`<ds:SignedInfo>` 요소에 서명을 생성하기 위하여 이용되는 알고리즘을 가지고 있다.

#### 16.2.2.3 ds:Reference의 요소

`<ds:Reference>`는 전자서명된 원본 문서의 위치와 서명에 대한 정보를 가지고 있다.

#### 표 325 -- ds:Reference 요소

| 속성 이름 | 설명 |
|---|---|
| URI | 전자서명된 원본 문서의 위치 |

#### 표 326 -- ds:Reference 하위 요소

| 하위 요소 이름 | 설명 |
|---|---|
| ds:Transforms | 서명에 적용된 순서화된 목록, 정규화 인코딩/디코딩 암호에 대한 식별 정보 |
| ds:DigestMethod | 전자서명에 적용된 해시 알고리즘 |
| ds:DigestValue | 서명된 전자서명의 실제 값 |

### 16.2.3 ds:KeyInfo의 요소

`<ds:KeyInfo>`는 전자서명에 사용된 키에 대한 정보로 서명을 검증할 수 있도록 공개키를 포함한다. OWPML에서는 공개키로 공인 인증서를 사용하며 `<ds:KeyInfo>`의 요소 중 `<ds:X509Data>`를 사용한다.

### 16.2.4 ds:Object의 요소

`<ds:Object>`는 전자서명의 대상을 명시하기 위한 요소이다.

## 16.3 XML 예

#### 샘플 180 -- Signature 예

```xml
<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    <ds:Reference URI="">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <ds:DigestValue>zGe+X...</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>pOF8Wg==</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509IssuerSerial>
        <ds:X509IssuerName>...</ds:X509IssuerName>
        <ds:X509SerialNumber>60002</ds:X509SerialNumber>
      </ds:X509IssuerSerial>
      <ds:X509Certificate>ydBfv0WUvA==...</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
  <ds:Object>
    <ds:Manifest Id="...">
      <ds:Reference URI="...">
        <ds:Transforms>
          <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        </ds:Transforms>
        <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <ds:DigestValue>16AOvvY...</ds:DigestValue>
      </ds:Reference>
    </ds:Manifest>
  </ds:Object>
</ds:Signature>
```
