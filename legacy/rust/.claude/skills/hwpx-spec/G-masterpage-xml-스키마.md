# 부속서 G (규정) MasterPage XML 스키마

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:hp="http://www.owpml.org/owpml/2024/paragraph"
  xmlns:hm="http://www.owpml.org/owpml/2024/master-page"
  targetNamespace="http://www.owpml.org/owpml/2024/master-page"
  elementFormDefault="qualified">
  <xs:import namespace="http://www.owpml.org/owpml/2024/paragraph"
    schemaLocation="HWPMLParaListSchema.xsd"/>
  <xs:element name="masterPage" type="hm:MasterPageType">
    <xs:annotation>
      <xs:documentation>Root Element</xs:documentation>
    </xs:annotation>
  </xs:element>
  <xs:complexType name="MasterPageType">
    <xs:sequence>
      <xs:element name="subList" type="hp:ParaListType"/>
    </xs:sequence>
    <xs:attribute name="id" type="xs:string" use="required"/>
    <xs:attribute name="type" default="BOTH">
      <xs:annotation>
        <xs:documentation>바탕쪽이 적용되는 형식</xs:documentation>
      </xs:annotation>
      <xs:simpleType>
        <xs:restriction base="xs:string">
          <xs:enumeration value="BOTH"/>
          <xs:enumeration value="EVEN"/>
          <xs:enumeration value="ODD"/>
          <xs:enumeration value="LAST_PAGE"/>
          <xs:enumeration value="OPTIONAL_PAGE"/>
        </xs:restriction>
      </xs:simpleType>
    </xs:attribute>
    <xs:attribute name="pageNumber" type="xs:nonNegativeInteger">
      <xs:annotation>
        <xs:documentation>type 속성 값이 OPTIONAL_PAGE인 경우 임의의 쪽 번호</xs:documentation>
      </xs:annotation>
    </xs:attribute>
    <xs:attribute name="pageDuplicate" type="xs:boolean" default="false"/>
    <xs:attribute name="pageFront" type="xs:boolean" default="false"/>
  </xs:complexType>
</xs:schema>
```
