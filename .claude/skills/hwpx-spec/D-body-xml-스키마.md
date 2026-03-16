# 부속서 D (규정) Body XML 스키마

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
xmlns:hp="http://www.owpml.org/owpml/2024/paragraph" xmlns:hs="http://www.owpml.org/owpml/2024/section"
targetNamespace="http://www.owpml.org/owpml/2024/section" elementFormDefault="qualified">
    <xs:import namespace="http://www.owpml.org/owpml/2024/paragraph"
schemaLocation="HWPMLParaListSchema.xsd"/>
    <xs:element name="sec" type="hp:SectionType">
        <xs:annotation>
            <xs:documentation>Root Element</xs:documentation>
        </xs:annotation>
    </xs:element>
</xs:schema>
```
