# 부속서 C (규정) Header XML 스키마

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:hh="http://www.owpml.org/owpml/2024/head"
xmlns:hp="http://www.owpml.org/owpml/2024/paragraph" xmlns:hc="http://www.owpml.org/owpml/2024/core"
xmlns="http://www.owpml.org/owpml/2024/head" targetNamespace="http://www.owpml.org/owpml/2024/head"
elementFormDefault="qualified">
<xs:import namespace="http://www.owpml.org/owpml/2024/core"
schemaLocation="HWPMLCoreSchema.xsd"/>
<xs:element name="head" type="HWPMLHeadType">
<xs:annotation>
<xs:documentation>Root Element</xs:documentation>
</xs:annotation>
</xs:element>
<xs:complexType name="HWPMLHeadType">
<xs:sequence>
<xs:element name="beginNum">
<xs:annotation>
<xs:documentation>시작 번호</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="page" type="xs:positiveInteger" use="required">
<xs:annotation>
<xs:documentation>페이지 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="footnote" type="xs:positiveInteger" use="required">
<xs:annotation>
<xs:documentation>각주 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="endnote" type="xs:positiveInteger" use="required">
<xs:annotation>
<xs:documentation>미주 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="pic" type="xs:positiveInteger" use="required">
<xs:annotation>
<xs:documentation>그림 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="tbl" type="xs:positiveInteger" use="required">
<xs:annotation>

<xs:documentation>표 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="equation" type="xs:positiveInteger" use="required">
<xs:annotation>
<xs:documentation>수식 시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="refList" type="MappingTableType" minOccurs="1"/>
<xs:element name="forbiddenWordList" type="ForbiddenWordListType" minOccurs="0"/>
<xs:element name="compatibleDocument" type="CompatibleDocumentType" minOccurs="0"/>
<xs:element name="trackchangeConfig">
<xs:complexType>
<xs:sequence>
<xs:element name="trackChangeEncrpytion" type="hc:KeyEncryptionType"
minOccurs="0"/>
</xs:sequence>
<xs:attribute name="flags" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
<xs:element name="docOption" type="DocOptionType" minOccurs="0"/>
c:MetaTagType" minOccurs="0"/>
</xs:sequence>
<xs:attribute name="version" type="xs:string" use="required"/>
<xs:attribute name="secCnt" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
<xs:complexType name="DocOptionType">
<xs:sequence>
<xs:element name="linkinfo">
<xs:complexType>
<xs:attribute name="path" type="xs:string" use="required"/>
<xs:attribute name="pageInherit" type="xs:boolean" default="false"/>
<xs:attribute name="footnoteInherit" type="xs:boolean" default="false"/>
</xs:complexType>
</xs:element>
<xs:element name="licensemark" minOccurs="0">
<xs:complexType>
<xs:attribute name="type" type="xs:unsignedInt" use="required"/>
<xs:attribute name="flag" type="xs:byte" use="required"/>
<xs:attribute name="lang" type="xs:byte"/>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:complexType>
<xs:complexType name="MappingTableType">
<xs:annotation>

<xs:documentation>
매핑 테이블. 본문에서 사용될각종 데이터를 가지고 있는 엘리먼트.
</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="fontfaces">
<xs:annotation>
<xs:documentation>글꼴 리스트</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="fontface" type="FontfaceType" minOccurs="1"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:positiveInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="borderFills" minOccurs="0">
<xs:annotation>
<xs:documentation>테두리/배경/채우기 리스트</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="borderFill" type="BorderFillType" minOccurs="0"
unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>테두리/배경 항목의 개수</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="charProperties">
<xs:annotation>
<xs:documentation>글자 모양 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="charPr" type="CharShapeType" minOccurs="1"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:positiveInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="tabProperties" minOccurs="0">
<xs:annotation>
<xs:documentation>탭 정보</xs:documentation>

</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="tabPr" type="TabDefType" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="numberings" minOccurs="0">
<xs:annotation>
<xs:documentation>번호 문단 모양</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="numbering" type="NumberingType" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="bullets" minOccurs="0">
<xs:annotation>
<xs:documentation>-
글머리표
문단 모양
</xs:documentation>
n>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="bullet" type="BulletType" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="paraProperties">
<xs:annotation>
<xs:documentation>문단 모양</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="paraPr" type="ParaShapeType" maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:positiveInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="styles">
<xs:annotation>
<xs:documentation>스타일</xs:documentation>
</xs:annotation>

<xs:complexType>
<xs:sequence>
<xs:element name="style" type="StyleType" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="memoProperties" minOccurs="0">
<xs:annotation>
<xs:documentation>메모 모양</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="memoPr" type="MemoShapeType" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="trackChanges" minOccurs="0">
<xs:annotation>
</x
s:do
cum
<xs:documentation>변경 추적
entation>
</xA
s:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="trackChange" type="TrackChange" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
<xs:element name="trackChangeAuthors" minOccurs="0">
<xs:annotation>
<xs:documentation>변경 추적 작성자</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="trackChangeAuthor" type="TrackChangeAuthor" minOccurs="0"
maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger"/>
</xs:complexType>
</xs:element>
</xs:sequence>
</xs:complexType>
<xs:complexType name="FontfaceType">

<xs:annotation>
<xs:documentation>언어별 글꼴 그룹</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="font" minOccurs="1" maxOccurs="unbounded">
<xs:annotation>
<xs:documentation>글꼴</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="substFont" minOccurs="0">
<xs:annotation>
<xs:documentation>대체 글꼴</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="face" type="xs:string" use="required">
<xs:annotation>
<xs:documentation>글꼴 이름</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="type" use="required">
<xs:annotation>
<
<-
<xs
/xs:ann
xs:sim
<xsM
:documentation>글꼴의 유형</xs:documentation>
otation>
pleType>
:restriction bOase="xs:sTtring">
<xs:enumeration value="REP"/>
<xs:enumeration value="TTF"/>
<xs:enumeration value="HFT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="isEmbedded" type="xs:boolean" default="false"/>
<xs:attribute name="binaryItemIDRef" type="xs:string"/>
</xs:complexType>
</xs:element>
<xs:element name="typeInfo" minOccurs="0">
<xs:annotation>
<xs:documentation>글꼴 정보</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="familyType" use="required">
<xs:annotation>
<xs:documentation>글꼴 계열.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="FCAT_UNKNOWN"/>

<xs:enumeration value="FCAT_MYUNGJO">
<xs:annotation>
<xs:documentation>serif</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="FCAT_GOTHIC">
<xs:annotation>
<xs:documentation>sans-
serif</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="FCAT_SSERIF">
<xs:annotation>
<xs:documentation>monospace</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="FCAT_BRUSHSCRIPT">
<xs:annotation>
<xs:documentation>cursive</xs:documentation>
</xs:annotation>
</xs:enumeration>
         KATS-M
<xs:enume
ration val
<xs:annotation>
<xs:documT
ue="FCA
T_D
ECORATIVE">
entation>cursive</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="FCAT_NONRECTMJ">
<xs:annotation>
<xs:documentation>serif</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="FCAT_NONRECTGT">
<xs:annotation>
<xs:documentation>sans-
serif</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="serifStyle" type="xs:string">
<xs:annotation>
<xs:documentation>세리프 유형</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="weight" type="xs:integer" use="required">
<xs:annotation>

<xs:documentation>굵기</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="proportion" type="xs:integer" use="required">
<xs:annotation>
<xs:documentation>비례</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="contrast" type="xs:integer" use="required">
<xs:annotation>
<xs:documentation>대조</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="strokeVariation" type="xs:integer" use="required">
<xs:annotation>
<xs:documentation>스트로크 편차</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="armStyle" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation>자획유형</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:a-
ttribute
name="letteO
rform" typeT
="xs:boI
oleaE
n" use="required">
<xs:annotation>
<xs:documentation>글자형</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="midline" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation>중간선</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="xHeight" type="xs:integer" use="required">
<xs:annotation>
<xs:documentation>X-높이</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>글꼴 아이디</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="face" type="xs:string" use="required">
<xs:annotation>

<xs:documentation>글꼴 이름</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="type" use="required">
<xs:annotation>
<xs:documentation>글꼴의 유형(rep : 대표글꼴, ttf : 트루타입글꼴, hft : 한/글
전용 글꼴)
                            </xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="REP"/>
<xs:enumeration value="TTF"/>
<xs:enumeration value="HFT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="isEmbedded" type="xs:boolean" default="false"/>
<xs:attribute name="binaryItemIDRef" type="xs:string"/>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="lang" use="req
<xs:ann
<xA
otation>
s:documT
entationS
>언어(-
uired">
한글, 영M
어, 한자, 일O
어, 기타,T
 심볼, 사I
자)</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="HANGUL"/>
<xs:enumeration value="LATIN"/>
<xs:enumeration value="HANJA"/>
<xs:enumeration value="JAPANESE"/>
<xs:enumeration value="OTHER"/>
<xs:enumeration value="SYMBOL"/>
<xs:enumeration value="USER"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="fontCnt" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>글꼴의 개수</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="BorderFillType">
<xs:annotation>
<xs:documentation>테두리/배경/채우기</xs:documentation>
</xs:annotation>

<xs:sequence>
<xs:element name="slash" type="SlashType" minOccurs="0"/>
<xs:element name="backSlash" type="SlashType" minOccurs="0"/>
<xs:element name="leftBorder" type="BorderType" minOccurs="0">
<xs:annotation>
<xs:documentation>왼쪽 테두리</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="rightBorder" type="BorderType" minOccurs="0">
<xs:annotation>
<xs:documentation>오른쪽 테두리</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="topBorder" type="BorderType" minOccurs="0">
<xs:annotation>
<xs:documentation>위쪽 테두리</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="bottomBorder" type="BorderType" minOccurs="0">
<xs:annotation>
<xs:documentation>아래쪽 테두리</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="diagonal" type="BorderType" minOccurs="0">
<xs:annotation>
<xs:documentation>대각선</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="fillBrush" type="hh:fillBrushType" minOccurs="0">
<xs:annotation>
<xs:documentation>채우기 정보</xs:documentation>
</xs:annotation>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>테두리/채우기 항목 아이디</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="threeD" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>3D효과 on/off</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="shadow" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>그림자 효과 on/off</xs:documentation>
</xs:annotation>

</xs:attribute>
<xs:attribute name="centerLine">
<xs:annotation>
<xs:documentation>중심선종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE"/>
<xs:enumeration value="VERTICAL"/>
<xs:enumeration value="HORIZONTAL"/>
<xs:enumeration value="CROSS"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="breakCellSeparateLine" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>자동으로 나뉜 표의 경계선설정 여부.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="SlashType">
<xs:attribute name="type" use="required">
<xs:sim
pleType>
<xs:restriction base="xs:string">
<xs:enT
umeratiS
on val-
ue="NOM
NE">
<xs:annotation>
<xs:documentation>없음</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER">
<xs:annotation>
<xs:documentation>중심선하나</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER_BELOW">
<xs:annotation>
<xs:documentation>중심선+ 중심선아래의 사선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER_ABOVE">
<xs:annotation>
<xs:documentation>중심선+ 중심선위의 사선</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="ALL">
<xs:annotation>
<xs:documentation>중심선+ 중심선아래의 사선+ 중심선위의 사선
                            </xs:documentation>

</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="Crooked" type="xs:boolean" use="required"/>
<xs:attribute name="isCounter" type="xs:boolean" use="required"/>
</xs:complexType>
<xs:complexType name="BorderType">
<xs:annotation>
<xs:documentation>테두리 형식</xs:documentation>
</xs:annotation>
<xs:attribute name="type" type="hc:LineType2" use="required">
<xs:annotation>
<xs:documentation>테두리선종류</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="width" type="hc:LineWidth" use="required">
<xs:annotation>
<xs:documentation>테두리선굵기.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="c
<xs:annotation>
<xs:documT
olor" type="hc:RGBColorType" use="required">
entationS
>테두리-
선색상M
</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="CharShapeType">
<xs:annotation>
<xs:documentation>글자 모양</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="fontRef">
<xs:annotation>
<xs:documentation>언어별 글꼴. 각 글꼴 타입에 맞는(한글이면 한글글꼴 타입) 참조
글꼴 ID를 기술.
                    </xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="hangul" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="latin" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="hanja" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="japanese" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="other" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="symbol" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="user" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>

</xs:element>
<xs:element name="ratio">
<xs:annotation>
<xs:documentation>언어별 장평. 단위는 %.</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="hangul" use="optional" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="200"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="latin" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="200"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:at
<T
tribute name="hanja" default="100">
xs:simplS
eType>
<xs:restric-
tion basM
e="xs:positiveInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="200"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="japanese" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="200"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="other" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="200"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="symbol" default="100">
<xs:simpleType>

<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="200"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="user" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="50"/>
<xs:maxInclusive value="200"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="spacing">
<xs:annotation>
<xs:documentation>언어별 자간. 단위는 %.</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="hangul" default="0">
<
xs:simpl
<xs:S
eType
restric
<xs:m-
>
tion base="xs:integer">
inInclusM
ive value="-O
50"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="latin" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-50"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="hanja" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-50"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="japanese" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">

<xs:minInclusive value="-50"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="other" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-50"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="symbol" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-50"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="user" default="0">
<
xs:simpl
<xs:S
eType
restric
<xs:m-
>
tion basM
e="xs:integer">
inInclusive value="-50"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="relSz">
<xs:annotation>
<xs:documentation>언어별 글자의 상대 크기. 단위는 %.</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="hangul" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="10"/>
<xs:maxInclusive value="250"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="latin" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="10"/>

<xs:maxInclusive value="250"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="hanja" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="10"/>
<xs:maxInclusive value="250"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="japanese" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="10"/>
<xs:maxInclusive value="250"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="other" default="100">
<xs:simpleType>
<xs:
restric
<xs:m-
tion base="xs:positiveInteger">
inInclusM
ive value="10"/>
<xs:maxInclusive value="
250"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="symbol" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="10"/>
<xs:maxInclusive value="250"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="user" default="100">
<xs:simpleType>
<xs:restriction base="xs:positiveInteger">
<xs:minInclusive value="10"/>
<xs:maxInclusive value="250"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="offset">
<xs:annotation>

<xs:documentation>언어별 오프셋. 단위는 %.</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="hangul" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="100"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="latin" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="100"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="hanja" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:m
<xs:m-
inInclusive value="-100"/>
axIncluM
sive value="
100"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="japanese" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="other" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="symbol" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="50"/>

</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="user" default="0">
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="50"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="italic" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 기울임.</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="bold" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 진하게.</xs:documentation>
</xs:annotation>
</xs:ele
ment>
<xs:element name="underline" minOccurs="0">
<xs:annotation>
<xs:doTcumentSation>-글자 속M성: 밑줄.</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="type" use="required">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE">
<xs:annotation>
<xs:documentation>없음</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BOTTOM">
<xs:annotation>
<xs:documentation>글자 아래</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER">
<xs:annotation>
<xs:documentation>글자 중간</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="TOP">
<xs:annotation>

<xs:documentation>글자 위</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="shape" type="hc:LineType2" use="required"/>
<xs:attribute name="color" type="hc:RGBColorType" use="required"/>
</xs:complexType>
</xs:element>
<xs:element name="strikeout" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 취소선</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="shape" type="hc:LineType2" use="required">
<xs:annotation>
<xs:documentation>취소선모양</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="color" type="hc:RGBColorType" use="required">
<xs:annotation>
<xs:
docum
entatio
n>취소선색
</xs:docum
entatio
n>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="outline" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 외각선</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="type" type="hc:LineType1" use="required">
<xs:annotation>
<xs:documentation>외각선종류</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="shadow" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 그림자</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="type" use="required">
<xs:annotation>
<xs:documentation>그림자 종류</xs:documentation>
</xs:annotation>

<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE"/>
<xs:enumeration value="DROP"/>
<xs:enumeration value="CONTINUOUS"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="color" type="hc:RGBColorType" use="required">
<xs:annotation>
<xs:documentation>그림자 색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="offsetX" use="required">
<xs:annotation>
<xs:documentation>그림자 간격 X. 단위는 %.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="100"/>
</xs:restriction>
<
/xs:simpleType>
</xs:attribute>
<xs:attribute nS
ame="-
offsetYM
" use="requir
<xs:annotation>
ed">
<xs:documentation>그림자 간격 Y. 단위는 %.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="-100"/>
<xs:maxInclusive value="100"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="emboss" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 양각</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="engrave" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 음각</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="supscript" minOccurs="0">

<xs:annotation>
<xs:documentation>글자 속성: 위첨자</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="subscript" minOccurs="0">
<xs:annotation>
<xs:documentation>글자 속성: 아래첨자</xs:documentation>
</xs:annotation>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>글자 모양 아이디</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="height" type="xs:integer" default="1000">
<xs:annotation>
<xs:documentation>글자 크기 (hwpunit 단위, 10 pt = 1000 hwpunit)</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="textColor" type="hc:RGBColorType" default="#000000">
<xs:annotation>
</xsK
<xs:documentation>글자색</xs:documentation>
</xs:annotation>
:attributeA
>
<xs:attribute name="sThadeCoSlor" ty-pe="hc:MRGBColorTyOpe" defauTlt="#FFFIFFF">
<xs:annotation>
<xs:documentation>음영색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="useFontSpace" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>글꼴에 어울리는 빈칸</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="useKerning" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>커닝</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="symMark" default="NONE">
<xs:annotation>
<xs:documentation>강조점 종류.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE"/>
<xs:enumeration value="DOT_ABOVE"/>

<xs:enumeration value="RING_ABOVE"/>
<xs:enumeration value="TILDE"/>
<xs:enumeration value="CARON"/>
<xs:enumeration value="SIDE"/>
<xs:enumeration value="COLON"/>
<xs:enumeration value="GRAVE_ACCENT"/>
<xs:enumeration value="ACUTE_ACCENT"/>
<xs:enumeration value="CIRCUMFLEX"/>
<xs:enumeration value="MACRON"/>
<xs:enumeration value="HOOK_ABOVE"/>
<xs:enumeration value="DOT_BELOW"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="borderFillIDRef" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>글자테두리 기능</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="TabDefType">
<xs:annotation>
<xs:doc
umentat
ion>탭 정
의 정
보</xs
:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="tabItem" minOccurs="0">
<xs:complexType>
<xs:attribute name="pos" type="xs:integer" use="required">
<xs:annotation>
<xs:documentation>탭의 위치. 단위는 hwpunit.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="type" use="required">
<xs:annotation>
<xs:documentation>탭의 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT">
<xs:annotation>
<xs:documentation>왼쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RIGHT">
<xs:annotation>
<xs:documentation>오른쪽</xs:documentation>
</xs:annotation>
</xs:enumeration>

<xs:enumeration value="CENTER">
<xs:annotation>
<xs:documentation>가운데</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DECIMAL">
<xs:annotation>
<xs:documentation>소수점</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="leader" type="hc:LineType2" use="required">
<xs:annotation>
<xs:documentation>채움 종류</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute
<xs:ann
<xA
 name="autoTabLeft" type="xs:boolean" default="false">
otation>
s:documentation>문단 왼쪽 끝 자동 탭(내어쓰기용 자동 탭)</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="autoTabRight" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>문단 오른쪽 끝 자동 탭</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="NumberingType">
<xs:annotation>
<xs:documentation>번호 문단 모양 정보</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="paraHead" type="ParaHeadType" maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="start" type="xs:integer" default="1">
<xs:annotation>
<xs:documentation>시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="BulletType">

<xs:annotation>
<xs:documentation>글머리표 문단 모양 정보</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="img" type="hc:ImageType" minOccurs="0"/>
<xs:element name="paraHead" type="ParaHeadType"/>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="char" type="xs:string" use="required">
<xs:annotation>
<xs:documentation>글머리표 문자</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="checkedChar" type="xs:string">
<xs:annotation>
<xs:documentation/>
</xs:annotation>
</xs:attribute>
<xs:attribute name="useImage" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation/>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:c
ompK
lexTypeA
 name="PT
araHeaS
dType-
" mixedM
="true">
<xs:annotation>
<xs:documentation>각 번호 문단 머리의 정보.
문자열 내 특정 문자에 제어코드(^)를 붙임으로써 글에서 표시되는 번호 문단 머리의 포맷을 제어한다.
^n : 레벨 경로를 표시한다. (예: 1.1.1.1.1.1.1)
^N : 레벨 경로를 표시하며 마지막에 마침표를 하나 더 찍는다. (예: 1.1.1.1.1.1.1.)
^레벨번호(1~7) : 해당 레벨에 해당하는 숫자 또는 문자 또는 기호를 표시한다.</xs:documentation>
</xs:annotation>
<xs:attribute name="start" type="xs:unsignedInt" default="1">
<xs:annotation>
<xs:documentation>시작 번호</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="level" use="required">
<xs:annotation>
<xs:documentation>수준</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:positiveInteger"/>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="align" default="LEFT">
<xs:annotation>
<xs:documentation>문단의 정렬 종류</xs:documentation>

</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="LEFT"/>
<xs:enumeration value="CENTER"/>
<xs:enumeration value="RIGHT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="useInstWidth" type="xs:boolean" default="true">
<xs:annotation>
<xs:documentation>번호 너비를 실제 인스턴스 문자열의 너비에 따를지
여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="autoIndent" type="xs:boolean" default="true">
<xs:annotation>
<xs:documentation>자동 내어쓰기 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="widthAdjust" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>번호 너비 보정값. 단위는 hwpunit.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attributeA name="tTextOffseStType-" default="PERCEN
라 상OT">
<xs:annotation>
<xs:documentation>수준별 본문과의 거리 단위 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="PERCENT"/>
<xs:enumeration value="HWPUNIT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="textOffset" type="xs:integer" default="50">
<xs:annotation>
<xs:documentation>본문과의 거리</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="numFormat" type="hc:NumberType1" default="DIGIT">
<xs:annotation>
<xs:documentation>번호 포맷(글머리표 문단의 경우에는 사용되지
않는다)</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="charPrIDRef" type="xs:nonNegativeInteger">

<xs:annotation>
<xs:documentation>글자 모양 아이디 참조</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="checkable" type="xs:boolean">
<xs:annotation>
<xs:documentation>확인용 글머리표</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="ParaShapeType">
<xs:annotation>
<xs:documentation>문단 모양 정보</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="align">
<xs:annotation>
<xs:documentation>문단 내 정렬</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="horizontal" use="required">
<xs:annotation>
<xs:documentation>정렬 방식</xs:documentation>
</xs:annotation>
<xs:simplS
eType-
>
<xs:restriction basMe="xs:string">
<xs:enumeration value="JUSTIFY">
<xs:annotation>
<xs:documentation>양쪽 정렬</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="LEFT">
<xs:annotation>
<xs:documentation>왼쪽 정렬</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="RIGHT">
<xs:annotation>
<xs:documentation>오른쪽 정렬</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER">
<xs:annotation>
<xs:documentation>가운데 정렬</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DISTRIBUTE">
<xs:annotation>

<xs:documentation>배분 정렬</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="DISTRIBUTE_SPACE">
<xs:annotation>
<xs:documentation>나눔 정렬(공백에만
배분)</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="vertical" use="required">
<xs:annotation>
<xs:documentation>세로 정렬</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="BASELINE">
<xs:annotation>
<xs:documentation>글꼴 기준</xs:documentation>
</xs:annotation>
</xs:e
<xs:e-
numeration>
numeraM
tion value="TOP">
<xs:annotation>
<xs:documenta
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CENTER">
<xs:annotation>
<xs:documentation>가운데</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BOTTOM">
<xs:annotation>
<xs:documentation>아래</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="heading">
<xs:annotation>
<xs:documentation>문단 머리 번호/글머리표</xs:documentation>
</xs:annotation>
<xs:complexType>

<xs:attribute name="type" use="required">
<xs:annotation>
<xs:documentation>문단 머리 모양 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NONE">
<xs:annotation>
<xs:documentation>없음</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="OUTLINE">
<xs:annotation>
<xs:documentation>개요</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="NUMBER">
<xs:annotation>
<xs:documentation>번호</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BULLET">
<
xs:annotation>
<xs:documentation>글머리표</xs:documentation>
</xs:annM
otation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="idRef" type="xs:nonNegativeInteger" use="required">
<xs:annotation>
<xs:documentation>번호/글머리포 문단 모양 아이디
참조</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="level" use="required">
<xs:annotation>
<xs:documentation>단계</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:nonNegativeInteger"/>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="breakSetting">
<xs:annotation>
<xs:documentation>문단 줄나눔 설정</xs:documentation>

</xs:annotation>
<xs:complexType>
<xs:attribute name="breakLatinWord" use="required">
<xs:annotation>
<xs:documentation>라틴 문자의 줄나눔 단위</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="KEEP_WORD">
<xs:annotation>
<xs:documentation>단어</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="HYPHENATION">
<xs:annotation>
<xs:documentation>하이픈</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BREAK_WORD">
<xs:annotation>
<xs:documentation>글자</xs:documentation>
</xs:annotation>
<T
</xs
/xs:simpS
</xs:enumeration>
:restric
leTyp-
tion>
e>
</xs:attribute>
<xs:attribute name="breakNonLatinWord" use="required">
<xs:annotation>
<xs:documentation>라틴 문자 이외의 문자의 줄나눔
단위</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="KEEP_WORD">
<xs:annotation>
<xs:documentation>어절</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BREAK_WORD">
<xs:annotation>
<xs:documentation>글자</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="widowOrphan" type="xs:boolean" use="required">
<xs:annotation>

<xs:documentation>외톨이줄 보호 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="keepWithNext" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation>다음 문단과 함께</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="keepLines" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation>문단 보호 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="pageBreakBefore" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation>문단 앞에서 항상 쪽나눔 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="lineWrap" use="required">
<xs:annotation>
<xs:documentation>한 줄로 입력 사용 시의 형식</xs:documentation>
</xs:annotation>
<
xs:simpl
eType>
<xs:restric-
tion basM
e="xs:string">
<xs:enumeration value="BO
REAK">
<xs:annotation>
<xs:documentation>일반적인 줄바꿈</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="SQUEEZE">
<xs:annotation>
<xs:documentation>자간을 조정하여 한 줄을
유지</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="KEEP">
<xs:annotation>
<xs:documentation>내용에 따라 폭이
늘어남</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="margin">
<xs:annotation>

<xs:documentation>문단 여백</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:sequence>
<xs:element name="intent" type="hc:HWPValue">
<xs:annotation>
<xs:documentation>들여쓰기/내어쓰기.
n이 0보다 크면 들여쓰기 n.
n이 0이면 : 보통.
n이 0보다 작으면 내어쓰기 n.</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="left" type="hc:HWPValue">
<xs:annotation>
<xs:documentation>왼쪽 여백.
단위를 표기하지 않으면 hwpunit이고 표기하면 표기한
단위로.</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="right" type="hc:HWPValue">
<xs:annotation>
<xs:documentation>오른쪽 여백</xs:documentation>
</xs:annot
</xs:elemS
ent>
<xs:element na-
ation>
me="preM
v" type="hcO
:HWPValue">
<xs:annotation>
<xs:documentation>문단 간격 위</xs:documentation>
</xs:annotation>
</xs:element>
<xs:element name="next" type="hc:HWPValue">
<xs:annotation>
<xs:documentation>문단 간격 아래</xs:documentation>
</xs:annotation>
</xs:element>
</xs:sequence>
</xs:complexType>
</xs:element>
<xs:element name="lineSpacing">
<xs:annotation>
<xs:documentation>줄 간격</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="type" use="required">
<xs:annotation>
<xs:documentation>줄 간격 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">

<xs:enumeration value="PERCENT">
<xs:annotation>
<xs:documentation>글자에 따라</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="FIXED">
<xs:annotation>
<xs:documentation>고정 값</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="BETWEEN_LINES">
<xs:annotation>
<xs:documentation>여백만 지정</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="AT_LEAST">
<xs:annotation>
<xs:documentation>최소</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:atT
tribute n
<xs:anno
<xs:S
ame="value" type="xs:integer" use="required">
tation>
docum-entatioMn>줄 간격 값O.
type이 PERCENT이면 0%~500%로 제한.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="unit" default="HWPUNIT">
<xs:annotation>
<xs:documentation>줄 간격 값의 단위</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="CHAR"/>
<xs:enumeration value="HWPUNIT"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="border">
<xs:annotation>
<xs:documentation>문단 테두리</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="borderFillIDRef" type="xs:nonNegativeInteger" use="required">

<xs:annotation>
<xs:documentation>테두리/배경 모양 아이디 참조</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="offsetLeft" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>문단 테두리 왼쪽 간격. 단위는
hwpunit.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="offsetRight" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>문단 테두리 오른쪽 간격. 단위는
hwpunit.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="offsetTop" type="xs:integer" default="0">
<xs:annotation>
<xs:documentation>문단 테두리 위쪽 간격. 단위는
hwpunit.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="offsetB
<T
xs:anno
<xs:S
tation>
docum-
entatioM
ottom" type="xs:integer" default="0">
n>문단 테두리 아래쪽 간격. 단위는
hwpunit.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="connect" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>문단 테두리 연결 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="ignoreMargin" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>문단 테두리 여백 무시 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
<xs:element name="autoSpacing">
<xs:annotation>
<xs:documentation>문단 자동 간격 조절 설정</xs:documentation>
</xs:annotation>
<xs:complexType>
<xs:attribute name="eAsianEng" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation>한글과 영어 간격을 자동 조절</xs:documentation>

</xs:annotation>
</xs:attribute>
<xs:attribute name="eAsianNum" type="xs:boolean" use="required">
<xs:annotation>
<xs:documentation>한글과 숫자 간격을 자동 조절</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="tabPrIDRef" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>탭 정의 아이디 참조</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="condense">
<xs:annotation>
<xs:documentation>공백 최소값. 단위는 %.</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:integer">
<xs:minInclusive value="0"/>
<xs:maxInclusive value="75"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="fontLineHeight" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>글꼴에 어울리는 줄 높이 사용 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="snapToGrid" type="xs:boolean" default="true">
<xs:annotation>
<xs:documentation>편집 용지의 줄 격자 사용 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="suppressLineNumbers" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>줄 번호 건너뜀</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="checked" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>선택 글머리표 여부</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>

<xs:complexType name="StyleType">
<xs:annotation>
<xs:documentation>스타일 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="type" use="required">
<xs:annotation>
<xs:documentation>스타일 종류</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="PARA">
<xs:annotation>
<xs:documentation>문단 스타일</xs:documentation>
</xs:annotation>
</xs:enumeration>
<xs:enumeration value="CHAR">
<xs:annotation>
<xs:documentation>글자 스타일</xs:documentation>
</xs:annotation>
</xs:enumeration>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
<xs:attribute name="name" type="xs:string" use="required">
<xs:annAotation>
<xs:documentation>로컬 스타일 이름.
한글 윈도에서는 한글 스타일 이름.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="engName" type="xs:string">
<xs:annotation>
<xs:documentation>영문 스타일 이름.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="paraPrIDRef" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>문단 모양 아이디 참조.
스타일의 종류가 문단이 경우  지정해야 함.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="charPrIDRef" type="xs:nonNegativeInteger">
<xs:annotation>
<xs:documentation>글자 모양 아이디 참조.
스타일의 종류가 글자인 경우  지정해야 함.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="nextStyleIDRef" type="xs:nonNegativeInteger">

<xs:annotation>
<xs:documentation>다음 스타일 아이디 참조.
문단 스타일에서 사용자가 리턴키를 입력하여 다음 문단으로 이동하였을 때 적용될문단 스타일을
지정한다.</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="langID" type="xs:unsignedShort">
<xs:annotation>
<xs:documentation>언어 아이디</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="lockForm" type="xs:boolean" default="false">
<xs:annotation>
<xs:documentation>양식 모드에서 Style 보호하기 여부.</xs:documentation>
</xs:annotation>
</xs:attribute>
</xs:complexType>
<xs:complexType name="MemoShapeType">
<xs:annotation>
<xs:documentation>메모 모양 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
<xs:attribute name="width" type="xs
<xs:annotation>
<xs:documT
entationS
>메모가-
:nonNe
gativeInteger" use="required">
보이는 넓이</xs:O
documentT
ation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="lineWidth" type="xs:string">
<xs:annotation>
<xs:documentation>메모의 라인 두께</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="lineType" type="hc:LineType2" use="required">
<xs:annotation>
<xs:documentation>메모의 선종류</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="lineColor" type="hc:RGBColorType" use="required">
<xs:annotation>
<xs:documentation>메모의 선색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="fillColor" type="hc:RGBColorType" use="required">
<xs:annotation>
<xs:documentation>메모의 색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="activeColor" type="hc:RGBColorType" use="required">

<xs:annotation>
<xs:documentation>메모가 활성화되었을 때 색</xs:documentation>
</xs:annotation>
</xs:attribute>
<xs:attribute name="memoType">
<xs:annotation>
<xs:documentation>메모 변경 추척을 위한 속성</xs:documentation>
</xs:annotation>
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="NOMAL"/>
<xs:enumeration value="USER_INSERT"/>
<xs:enumeration value="USER_DELETE"/>
<xs:enumeration value="USER_UPDATE"/>
</xs:restriction>
</xs:simpleType>
</xs:attribute>
</xs:complexType>
<xs:complexType name="ForbiddenWordListType">
<xs:annotation>
<xs:documentation>금칙 문자</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="forbiddenWord" type="xs:string" minOccurs="1" maxOccurs="unbounded"/>
</xs:sequence>
<xs:attribute name="itemCnt" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
<xs:complexType name="CompatibleDocumentType">
<xs:annotation>
<xs:documentation>문서 호환성 정보</xs:documentation>
</xs:annotation>
<xs:sequence>
<xs:element name="layoutCompatibility">
<xs:complexType>
<xs:sequence>
<xs:element name="applyFontWeightToBold" minOccurs="0"/>
<xs:element name="useInnerUnderline" minOccurs="0"/>
<xs:element name="fixedUnderlineWidth" minOccurs="0"/>
<xs:element name="doNotApplyStrikeoutWithUnderline" minOccurs="0"/>
<xs:element name="useLowercaseStrikeout" minOccurs="0"/>
<xs:element name="extendLineheightToOffset" minOccurs="0"/>
<xs:element name="applyFontspaceToLatin" minOccurs="0"/>
<xs:element name="treatQuotationAsLatin" minOccurs="0"/>
<xs:element name="doNotApplyDiacSymMarkOfNoneAndSix" minOccurs="0"/>
<xs:element name="doNotAlignWhitespaceOnRight" minOccurs="0"/>
<xs:element name="doNotAdjustWordInJustify" minOccurs="0"/>
<xs:element name="baseCharUnitOnEAsian" minOccurs="0"/>
<xs:element name="baseCharUnitOfIndentOnFirstChar" minOccurs="0"/>

<xs:element name="adjustLineheightToFont" minOccurs="0"/>
<xs:element name="adjustBaselineInFixedLinespacing" minOccurs="0"/>
<xs:element name="applyPrevspacingBeneathObject" minOccurs="0"/>
<xs:element name="applyNextspacingOfLastPara" minOccurs="0"/>
<xs:element name="applyAtLeastToPercent100Pct" minOccurs="0"/>
<xs:element name="doNotApplyAutoSpaceEAsianEng" minOccurs="0"/>
<xs:element name="doNotApplyAutoSpaceEAsianNum" minOccurs="0"/>
<xs:element name="adjustParaBorderfillToSpacing" minOccurs="0"/>
<xs:element name="connectParaBorderfillOfEqualBorder" minOccurs="0"/>
<xs:element name="adjustParaBorderOffsetWithBorder" minOccurs="0"/>
<xs:element name="extendLineheightToParaBorderOffset" minOccurs="0"/>
<xs:element name="applyParaBorderToOutside" minOccurs="0"/>
<xs:element name="applyMinColumnWidthTo1mm" minOccurs="0"/>
<xs:element name="applyTabPosBasedOnSegment" minOccurs="0"/>
<xs:element name="breakTabOverLine" minOccurs="0"/>
<xs:element name="adjustVertPosOfLine" minOccurs="0"/>
<xs:element name="doNotApplyWhiteSpaceHeight" minOccurs="0"/>
<xs:element name="doNotAlignLastPeriod" minOccurs="0"/>
<xs:element name="doNotAlignLastForbidden" minOccurs="0"/>
<xs:element name="baseLineSpacingOnLineGrid" minOccurs="0"/>
<xs:element name="applyCharSpacingToCharGrid" minOccurs="0"/>
<xs:element name="doNotApplyGridInHeaderFooter" minOccurs="0"/>
<
xs:elem
ent na
me="ap
plyExtendHe
aderFoote
rEachS
ecti
on" minOccurs="0"/>
<xs:element name="doNotApplyHeaderFooterAtNoSpace" minOccurs="0"/>
<xs:element name="doNotApplyColSeparatorAtNoGap" minOccurs="0"/>
<xs:element name="doNotApplyLinegridAtNoLinespacing" minOccurs="0"/>
<xs:element name="doNotApplyImageEffect" minOccurs="0"/>
<xs:element name="doNotApplyShapeComment" minOccurs="0"/>
<xs:element name="doNotAdjustEmptyAnchorLine" minOccurs="0"/>
<xs:element name="overlapBothAllowOverlap" minOccurs="0"/>
<xs:element name="doNotApplyVertOffsetOfForward" minOccurs="0"/>
<xs:element name="extendVertLimitToPageMargins" minOccurs="0"/>
<xs:element name="doNotHoldAnchorOfTable" minOccurs="0"/>
<xs:element name="doNotFormattingAtBeneathAnchor" minOccurs="0"/>
<xs:element name="adjustBaselineOfObjectToBottom" minOccurs="0"/>
<xs:element name="doNotApplyExtensionCharCompose" minOccurs="0"/>
</xs:sequence>
</xs:complexType>
</xs:element>
</xs:sequence>
<xs:attribute name="targetProgram" use="required">
<xs:simpleType>
<xs:restriction base="xs:string">
<xs:enumeration value="HWP201X"/>
<xs:enumeration value="HWP200X"/>
<xs:enumeration value="MS_WORD"/>
</xs:restriction>
</xs:simpleType>

</xs:attribute>
</xs:complexType>
<xs:complexType name="TrackChange">
<xs:annotation>
<xs:documentation>변경 추적 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="type" type="hc:TrackChangeType"/>
<xs:attribute name="date" type="xs:dateTime"/>
<xs:attribute name="authorID" type="xs:nonNegativeInteger"/>
<xs:attribute name="charShapeID" type="xs:nonNegativeInteger"/>
<xs:attribute name="paraShapeID" type="xs:nonNegativeInteger"/>
<xs:attribute name="hide" type="xs:boolean" use="required"/>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
<xs:complexType name="TrackChangeAuthor">
<xs:annotation>
<xs:documentation>변경 추적 사용자 정보</xs:documentation>
</xs:annotation>
<xs:attribute name="name" type="xs:string"/>
<xs:attribute name="mark" type="xs:boolean"/>
<xs:attribute name="color" type="hc:RGBColorType"/>
<xs:attribute name="id" type="xs:nonNegativeInteger" use="required"/>
</xs:complexType>
</xs:schema>
```
