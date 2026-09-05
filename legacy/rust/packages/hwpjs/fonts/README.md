# PDF 변환용 폰트 (한글 지원)

**Noto Sans KR**을 이미 받아 패키지에 포함해 두었습니다. (저장소에 커밋되어 있음.) 별도 다운로드 없이 `npm install @ohah/hwpjs`만 하면 `fonts/`가 함께 설치됩니다.

`hwpjs to-pdf` / `hwpjs batch --format pdf` 실행 시 `--font-dir`을 지정하지 않으면, 이 패키지의 `fonts/`(또는 cwd의 `./fonts`)를 자동으로 사용해 한글이 깨지지 않습니다.

## 포함된 폰트

- **NotoSansKR-Regular.ttf** (Noto Sans KR, variable font → Regular 용도)  
  - 출처: [Google Fonts – ofl/notosanskr](https://github.com/google/fonts/tree/main/ofl/notosanskr)  
  - 라이선스: [SIL Open Font License 1.1](https://scripts.sil.org/OFL)

## 개발/재다운로드

폰트는 이미 패키지에 포함되어 있습니다. 최신 버전으로 갱신할 때만 패키지 루트에서:

```bash
bun run download-pdf-fonts
```

## 폰트 로드 오류가 날 때

일부 환경에서 변수 폰트 로드에 실패할 수 있습니다. 그럴 때는 [Google Fonts에서 Noto Sans KR](https://fonts.google.com/noto/specimen/Noto+Sans+KR)을 "Download family"로 받아 압축을 푼 뒤, 그 안의 **정적(static) TTF** 파일을 프로젝트의 `./fonts`에 넣고 `--font-dir ./fonts`로 지정해 보세요.

## React Native에서

`toPdf()`는 React Native에서도 사용할 수 있습니다. 네이티브에서 파일 시스템 경로가 필요하므로, **폰트가 들어 있는 디렉터리 경로**를 `fontDir`로 넘겨야 합니다.

- 설치 시 패키지에 포함된 폰트 경로: `node_modules/@ohah/hwpjs/fonts/`
- 앱에서 쓰려면 이 폴더를 앱 번들/문서 디렉터리로 복사한 뒤, 그 경로를 `toPdf(data, { fontDir: '복사한_경로', embedImages: true })`에 넣으면 됩니다.
- 예: 프로젝트에 `assets/fonts`를 만들고 `node_modules/@ohah/hwpjs/fonts/*.ttf`를 복사해 두고, 런타임에 해당 디렉터리 경로(플랫폼별 문서/번들 경로)를 `fontDir`로 전달.

## 라틴만 쓸 때

한글이 없는 문서만 변환할 경우 Liberation Sans 등 라틴 폰트만 쓰고 싶다면 `--font-dir`으로 해당 폴더를 지정하면 됩니다.
