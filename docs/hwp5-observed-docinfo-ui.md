# 관측 DocInfo 모드의 Worker·동의 UI

## 계약과 책임

Worker는 두 선택적 native ABI가 모두 있을 때만 보존 모드의 가능성과 활성 진단을 응답합니다. 기본 열기 오류가 UnexpectedEnd/RepairedSourceUnsupported/ResourceCountMismatch이고 비배포 HWP5·미개방 세션일 때만 observedDocInfoEditingAvailable을 제안합니다. 이것은 다음 명시적 열기의 성공 보장이 아니며 자동 fallback도 아닙니다. ABI가 없는 기존 WASM에서는 두 필드를 추가하지 않습니다. [JS 옵션·wire 경계](hwp5-observed-docinfo-api.md)는 별도 문서가 소유합니다.

기존 편집 시작 버튼은 유지하고 별도 ‘불완전 서식 원본 보존 편집’ 버튼이 retainObservedDocInfo:true를 요청합니다. observed-docinfo-consent.mjs가 정확한true 동의·미해석 수 경고를 소유합니다. CFB 보정은 기존 normalization-consent.mjs가 별도로 동의받습니다. 취소·busy·문서 전환 시 이전 선택이 남지 않으며 이미 열린 세션을 이 옵션으로 바꾸지 않습니다. HWPX는 해당 옵션의 존재 자체를 거부합니다. 저장 상태 경고는 보존 모드와 미해석/부재 수·리소스 불일치·조판 미복원을 명시하며 저장 권한을 부여하지 않습니다.

## 분리 검증 (2026-10-20)

main bbc707a2의 분리 사본 `/tmp/hwpjs-observed-ui-publish.fSBbhE`에서 관련 Worker/컨트롤/앱·단일 버튼만 적용했습니다. 다른 로컬 차트·수식·표 생성·window 모델 변경은 포함하지 않습니다. 후보8aeb8f4d6bbf1692ece828ba22dd7d517ad345a24b1a588465f2ffcee0c74355의 여덟 테스트 파일15/15·skip0·exit0입니다. 기본30434b54의 일곱 파일13/13·skip0·exit0은 보존 모드 편집이 아니라 ABI 부재 명시 거부·일반 편집 보존을 포함한 별도 결과입니다.

worker-compat 회귀는 추적 HWP5 55경로(54개 정상 읽기·암호 기본 거부1)를 조회합니다. 후보에서 선택 ABI를 숨긴 응답과 노출한 응답은 새 두 필드 외에 전체 내용이 같고, 이전 응답·원본 파일/입력 버퍼가 변하지 않습니다. 기본 WASM에서는 해당 capability가false임을 보고합니다. 읽기 응답 대조이며55개 편집 완료·원본 조판 동치를 뜻하지 않습니다. 실제 보존 모드 Worker 사례는 reference 없으면 명시적skip이고, 구형 ABI 실행은 편집 미지원/명시 거부만 검사했다고 진단합니다. 최초 reference 준비가 부족했던 실행의skip을 후속 통과에 합산하지 않습니다.

후보의 실제 Chromium `--case=observed-docinfo`는 두 동의·150개/개수 불일치 경고·Canvas hit와 신뢰된 pointerdown/한글·이모지 입력·undo/redo·다운로드·독립 전체 Section/비대상 stream/metadata·음성 대조·native/브라우저 재열기를 통과했습니다. 산출물 suffix hwpjs-reference-browser-pwdf29, 저장 SHA25609f4861546500b87e7e6680ac4772d4db52ae447d01d64f012139672b206d1b8입니다. 화면은 물리 페이지가 아닌 논리 미리보기이며 조판 미복원 경고가 유지됩니다. 준비 중 case 미복사로 난 UnknownBrowserReferenceCase는 브라우저 시작 전 도구 준비 실패로 구분합니다.

같은 분리 UI와 기본30434b54의 `--case=roadmap`도 실제 편집 왕복에 성공하고 새 버튼이 숨겨졌음을 확인했습니다. 산출물 suffix2eZayE·저장d7a030c6ef07a92ce55e7ef7d5fc25fd9125e277e03bf5ea03aaaf4906ed9985입니다. 두 실제 실행 모두 browserClosed/serverExited/success true·exit0이며 전용58895 서버와 소유 세션을 종료했습니다.

이번 게시에는 native 구현·기본 WASM 교체가 없습니다. 현재 기본 데모에서 새 버튼은 노출되지 않으며 후보의 전체 native 검증·승격은 별도입니다.
