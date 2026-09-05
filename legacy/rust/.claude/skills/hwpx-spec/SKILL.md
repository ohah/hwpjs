---
name: hwpx-spec
description: KS X 6101:2024 HWPX(OWPML) 문서 구조 표준 명세를 소제목 단위로 나눈 스펙 문서. HWPX 파싱·렌더링·검증 시 같은 번호의 .md 파일을 읽어 참조.
---

# KS X 6101:2024 - HWPX (OWPML) 문서 구조 표준

개방형 워드프로세서 마크업 언어(OWPML) 문서 구조 표준을 **소제목 단위**로 나눈 스펙 문서이다.

## 사용 방법

- HWPX 구현·파싱·렌더링·버그 수정 시 **해당 소제목과 같은 번호의 .md 파일**을 열어 참조한다.
- 예: Header 폰트 파싱 → `9-3-1-fontfaces.md`, 표 개체 → `10-9-3-표-개체.md`, 그림 개체 → `10-9-6-그림-개체.md`.

## 파일 목록 (소제목 = 파일명)

| 섹션 | 파일명 |
|------|--------|
| 머리말 | 0-머리말.md |
| 개요 | 0-개요.md |
| 1. 적용범위 | 1-적용범위.md |
| 2. 인용표준 | 2-인용표준.md |
| 3. 용어와 정의 | 3-용어와-정의.md |
| 4.1 일반사항 | 4-1-일반사항.md |
| 4.2 XML 콘텐츠문서 조건 | 4-2-xml-콘텐츠문서-조건.md |
| 4.3 리딩 시스템 적합성 | 4-3-리딩-시스템-적합성.md |
| 4.4 문서 호환성 및 적합성 | 4-4-문서-호환성-및-적합성.md |
| 5.1 XML과의 관계 | 5-1-xml과의-관계.md |
| 5.2 XML 네임스페이스 | 5-2-xml-네임스페이스.md |
| 5.3 유니코드 | 5-3-유니코드.md |
| 5.4 MIME 미디어 유형 | 5-4-mime-미디어-유형.md |
| 6. 스키마 구성 | 6-스키마-구성.md |
| 7.1 기본형식 | 7-1-기본형식.md |
| 7.2 단위 | 7-2-단위.md |
| 7.3 기본 나열 형식 | 7-3-기본-나열-형식.md |
| 7.4 색상 표현 | 7-4-색상-표현.md |
| 8.1 OCF | 8-1-ocf.md |
| 8.2 OCF OWPML 프로파일 | 8-2-ocf-owpml-프로파일.md |
| 8.3 파일 형식 버전 식별 | 8-3-파일-형식-버전-식별.md |
| 8.4 OPF OWPML 프로파일 | 8-4-opf-owpml-프로파일.md |
| 9.1 네임스페이스 | 9-1-네임스페이스.md |
| 9.2.1 head 요소 | 9-2-1-head-요소.md |
| 9.2.2 beginNum 요소 | 9-2-2-beginNum-요소.md |
| 9.2.3 refList 요소 | 9-2-3-refList-요소.md |
| 9.2.4 forbiddenWordList 요소 | 9-2-4-forbiddenWordList-요소.md |
| 9.2.5 compatibleDocument 요소 | 9-2-5-compatibleDocument-요소.md |
| 9.2.6 trackChangeConfig 요소 | 9-2-6-trackChangeConfig-요소.md |
| 9.2.7 docOption 요소 | 9-2-7-docOption-요소.md |
| 9.2.8 metaTag 요소 | 9-2-8-metaTag-요소.md |
| 9.3.1 fontfaces | 9-3-1-fontfaces.md |
| 9.3.2 borderFills | 9-3-2-borderFills.md |
| 9.3.3 charProperties | 9-3-3-charProperties.md |
| 9.3.4 tabProperties | 9-3-4-tabProperties.md |
| 9.3.5 numberings | 9-3-5-numberings.md |
| 9.3.6 bullets | 9-3-6-bullets.md |
| 9.3.7 paraProperties | 9-3-7-paraProperties.md |
| 9.3.8 styles | 9-3-8-styles.md |
| 9.3.9 memoProperties | 9-3-9-memoProperties.md |
| 9.3.10 trackChanges | 9-3-10-trackChanges.md |
| 9.3.11 trackChangeAuthors | 9-3-11-trackChangeAuthors.md |
| 10.1 네임스페이스/본문 개요 | 10-1-네임스페이스.md |
| 10.3 sec 요소 | 10-3-sec-요소.md |
| 10.4 p 요소 | 10-4-p-요소.md |
| 10.5 run 요소 | 10-5-run-요소.md |
| 10.6 secPr 요소 | 10-6-secPr-요소.md |
| 10.7.1 colPr 요소 | 10-7-1-colPr-요소.md |
| 10.7.2 fieldBegin 요소 | 10-7-2-fieldBegin-요소.md |
| 10.7.3 fieldEnd 요소 | 10-7-3-fieldEnd-요소.md |
| 10.7.4 bookmark 요소 | 10-7-4-bookmark-요소.md |
| 10.7.5 머리말/꼬리말 | 10-7-5-머리말-꼬리말.md |
| 10.7.6 각주/미주 | 10-7-6-각주-미주.md |
| 10.7.7 자동 번호 | 10-7-7-자동-번호.md |
| 10.7.8 pageNumCtrl 외 | 10-7-8-pageNumCtrl.md |
| 10.8 t 요소 | 10-8-t-요소.md |
| 10.9.1 도형 객체 공통 | 10-9-1-도형-객체-공통.md |
| 10.9.3 표 개체 | 10-9-3-표-개체.md |
| 10.9.4 수식 개체 | 10-9-4-수식-개체.md |
| 10.9.5 AbstractShapeComponentType | 10-9-5-AbstractShapeComponentType.md |
| 10.9.6 그림 개체 | 10-9-6-그림-개체.md |
| 10.9.7 OLE 개체 | 10-9-7-ole-개체.md |
| 10.9.8 묶음 개체 | 10-9-8-묶음-개체.md |
| 10.9.9 차트 개체 | 10-9-9-차트-개체.md |
| 10.10.1 그리기 객체 공통 | 10-10-1-그리기-객체-공통.md |
| 10.10.3 선 | 10-10-3-선.md |
| 10.10.4 사각형 | 10-10-4-사각형.md |
| 10.10.5 타원 | 10-10-5-타원.md |
| 10.10.6 호 | 10-10-6-호.md |
| 10.10.7 다각형 | 10-10-7-다각형.md |
| 10.10.8 곡선 | 10-10-8-곡선.md |
| 10.10.9 연결선 | 10-10-9-연결선.md |
| 10.11 양식 객체 | 10-11-양식-객체.md |
| 10.12.1 글맵시 | 10-12-1-글맵시.md |
| 10.12.2 글자 겹침 | 10-12-2-글자-겹침.md |
| 10.12.3 덧말 | 10-12-3-덧말.md |
| 10.12.4 비디오 | 10-12-4-비디오.md |
| 11. 바탕쪽 설정 | 11-바탕쪽-설정.md |
| 12. 문서 이력 정보 | 12-문서-이력-정보.md |
| 13. 파일 형식 버전 정보 | 13-파일-형식-버전-정보.md |
| 14. settings xml | 14-settings-xml.md |
| 15. 암호화 | 15-암호화.md |
| 16. 전자서명 | 16-전자서명.md |
| 17. 하위 호환성 | 17-하위-호환성.md |
| 부속서 A 제정의 취지 | A-제정의-취지.md |
| 부속서 B Version XML 스키마 | B-version-xml-스키마.md |
| 부속서 C Header XML 스키마 | C-header-xml-스키마.md |
| 부속서 D Body XML 스키마 | D-body-xml-스키마.md |
| 부속서 E ParaList XML 스키마 | E-paralist-xml-스키마.md |
| 부속서 F Core XML 스키마 | F-core-xml-스키마.md |
| 부속서 G MasterPage XML 스키마 | G-masterpage-xml-스키마.md |
| 부속서 H Document History XML 스키마 | H-history-xml-스키마.md |
| 부속서 I 수식 스크립트 | I-수식-스크립트.md |
