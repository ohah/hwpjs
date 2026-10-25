# HWPJS 문서 테마

`index.tsx`는 Rspress의 공개 Layout/HomeHero/HomeFeature/DocContent를 조합합니다. 문서 링크는 기본 DocContent의 MDX context를 통해 base를 적용합니다. `DocumentGraphic.tsx`는 직접 그린 장식용 SVG이며 제품 화면이나 벤더 리소스가 아닙니다.

스타일 책임은 `styles/tokens.css`(라이트·다크), `chrome.css`(공통 문서 UI), `home.css`(홈·모바일), `playground.css`(명시적 /playground의 사이트 chrome·스크롤 초기화)로 분리합니다. 편집기의 위치·크기·z-index는 부모 `components/playground.css`가 소유합니다.

Spinon의 `packages/docs/theme/index.tsx`, Rspress 설정, `spec/styles.css`에서 배지·격자 히어로·강조색·카드의 시각 패턴만 참고했습니다. 조회한 Spinon 루트/문서 패키지에는 해당 코드의 라이선스 선언이 없어 원문 코드·브랜드·로고·링크·자산을 복사하지 않았습니다. 이 테마는 독립 작성했으며 기존 Rspress 기본 테마(MIT)를 공개 API로 사용합니다. 신규 의존성은 없습니다.

`_verification`은 배포·커밋에서 제외하는 담당자 검증 자료입니다. 실제 편집 E2E와 서버·배포는 부모 담당이며 이 테마의 디자인 검증과 구분합니다.
