# 5.0.3.0 그림 effects-only 꼬리

## 계약

공통 그림 꼬리 프로필은 정확한 version05000300에 effects_only를 선택합니다. 기존 native pictureTailSources의 명시 배치를 재사용하며 prefix78 뒤 effects 플래그까지만 소비합니다. 길이/파싱 실패를 보고 dimensions8/with_alpha9로 재시도하지 않습니다.

Worker는 width/height/alpha 모두 null, extra_bytes0인 결과만 이 프로필로 게시합니다. 같은 버전에서 추가 크기·알파·미지 꼬리를 허용하지 않습니다. 미지 effects와 opacity는 기존 native/geometry paint 검사에서 계속 거부합니다. alpha 부재는 원값을0으로 바꾸지 않고 정확한 version/layout 일치 때 표시 정책으로 허용합니다. 없는 그림 크기를 만들어 넣지 않습니다. crop은 기존 부재 reference 정책을 재사용하며 실제 이미지 픽셀/한글 동치는 별도입니다.

## 근거와 검증

실제 sungeo.hwp의 독립 CFB.js/DEFLATE/레코드 검사에서 그림14개 모두 payload82바이트입니다. offset73 opacity,74 instance u32,78 effects u32이며 이후 바이트가 없습니다. offset82의 크기와90의alpha는 부재입니다. 모든 effects0이며 처음 두 instance는 서로 다른 원값, 나머지는0입니다.

후보0dc374f0의 공개 API14개를 고정 offset으로 대조하고 dimensions8/with_alpha9가 UnexpectedEnd로 거부되는 것과 무변경 저장 bytes를 검사했습니다. 실제 Worker의 tail14개·geometry14개에서 width/height/alpha null을 유지하고 paintError null을 확인했습니다. 파생 응답의 크기/alpha/꼬리 및 인접 버전050002ff/05000301은 거부합니다.

기존 distribution dimensions8·구형 암호 base73·프로필/attachment 회귀를 합쳐8/8·fail/skip/cancel0·종료코드0입니다. 새 native 파서를 작성하거나 기본 WASM을 교체한 것이 아닌 JS 표시 프로필 확장입니다. 그림의 실제 Canvas 해독·전체 페이지·OS 글꼴·이미지 crop 픽셀 동치 검증으로 확대하지 않습니다.

## main 분리 사본 게시 사전 검증

분리 사본의 빌드 산출물1f502885로 참조 HWP5의 명시된 보정/배포/관측 모드를 구분해 추가 조회했습니다. version05000300인135경로 중 그림이 있는20경로의136그림은 effects_only 소비 후 extra_bytes0이며 다른 꼬리0개입니다. 두 saved hongbo 경로는 OrphanPicture로 거부했고 정상136개에 포함하지 않았습니다. 두 이름은 동일bytes이며 파일 경로 수를 독립적인 작성기/버전 표본 수로 주장하지 않습니다. 그림 미조회/기본 열기 거부를 정상 그림 지원으로 계산하지 않습니다. 기록은 분리 사본의 effects-version-census.jsonl입니다.

main4470d413의 분리 사본 `/private/tmp/hwpjs-effects-profile-publish.dvKbLk`에는 이 두 JS 모듈·새 회귀·계약 문서와 기존 세 인덱스/명령 링크·정규 테스트 등록만 적용했습니다. 다른 미게시 도형/책갈피/native 변경은 포함하지 않습니다. 기존 기본 WASM1211e56195c6e380c8faee253506cc877322caf94b8458fcb1d6470f53f634c5로 새 실제14그림/Worker/음성 검사3/3, 기존 editor/reader Worker/그림 hit·outline 포함 집중12/12·fail/skip/cancel0·종료코드0입니다.

첫 분리 실행은 reference 부모 폴더 준비 누락으로 ENOENT2개가 났으며 제품 오류로 계수하지 않습니다. 원본 reference의 읽기용 링크를 준비한 뒤 전체 집중을 다시 실행했습니다. 해당 링크와 산출물은 게시 대상이 아닙니다.

분리 사본의 ReleaseSafe 설치 빌드는 완료됐고 WASM SHA256은1f502885039518843b7d673de5f6f4d0f21d2de0f2d73dbfbaf26635dd3a08d5입니다. 정규 hwp5-editor-audit는 종료코드0·635테스트/634pass·실패0·skip1로 끝났습니다(editor-audit.log,993262ms). skip은 구형 ABI baseline 부재이며 별도 FEA87400 baseline을 명시한 observed-docinfo-options3/3·skip0·종료코드0으로 보완했습니다(observed-baseline.log). 원래 gate 수치를 소급해635pass로 바꾸지 않습니다.

분리 사본의 별도 -j1 ReleaseSafe 전체 native test는 종료코드0으로 완료됐습니다. native-test.log의 `run test w`는 테스트 stderr에 출력한 할당 실패 순회 진단에 따른 경고 표시입니다. Zig0.17 Maker의 성공/stderr 분기도 마지막 명령에 `failed command:`라는 레이블을 붙이므로 해당 문자열만으로 실패로 판단하지 않습니다. 전체 테스트 개수는 로그에 없어 수치를 주장하지 않습니다. 이 결과는 분리된8파일 수정에만 해당하며 현재 main 작업 트리의 다른 native 변경이나 기본 WASM 승격을 검증한 것은 아닙니다.
