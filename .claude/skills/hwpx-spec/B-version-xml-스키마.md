# 부속서 B (규정) Version XML 스키마

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.owpml.org/owpml/2024/version"
  targetNamespace="http://www.owpml.org/owpml/2024/version">
  <xs:element name="version">
    <xs:complexType>
      <xs:attribute name="tagetApplication" use="required">
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:enumeration value="WORDPROCESSOR"/>
            <xs:enumeration value="PRESENTATION"/>
            <xs:enumeration value="SPREADSHEET"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:attribute>
      <xs:attribute name="major" type="xs:nonNegativeInteger" use="required" form="unqualified"/>
      <xs:attribute name="minor" type="xs:nonNegativeInteger" use="required"/>
      <xs:attribute name="micro" type="xs:nonPositiveInteger" default="0" form="unqualified"/>
      <xs:attribute name="buildNumber" type="xs:nonNegativeInteger" default="0"/>
      <xs:attribute name="application" type="xs:string"/>
      <xs:attribute name="appVersion" type="xs:string"/>
    </xs:complexType>
  </xs:element>
</xs:schema>
```
