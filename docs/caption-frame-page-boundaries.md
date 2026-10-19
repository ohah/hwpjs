# 캡션 프레임과 도형 문단의 페이지 경계

## 게시 전 독립 검증

기존 Worker를 그대로 둔 /tmp/hwpjs-caption-boundary-publish.TFKrHP에서 페이지 경계 수정만 분리했습니다. 순수 그림·중첩 문단·기존 중첩 표·캡션/예약·실제 Worker 배치의9파일22개가 통과했습니다. drawing-paragraph-page-reference 회귀는 전체 source coverage를 유지한 앵커 쪽 선택과 누락/중복/변환 거부를 실제 drawingPageReference 진입점에서 확인합니다. 로컬의 미게시 drawing-page-projection 초안은 여러 미게시 collision 모듈에 의존하므로 이 게시 검사에 복사하거나 포함하지 않았습니다.

같은 분리 사본의 실제 브라우저 산출물 hwpjs-caption-canvas-z1h9VT도 Canvas pointer/키보드·undo/redo·독립 저장 normal/-O/음성 oracle·재업로드를 통과했습니다. Worker hash는 기존 e0dac171이며 묶음 조회 연결이 없는 대조입니다.5쪽·282행 고정 측정 및 실제 브라우저5쪽·그림6/6해독을 확인했고 saved hash는 아래와 같습니다. source hashes 불변·소유 세션 inactive·전용 서버 종료가 확인됐습니다. 기본 WASM은 교체하지 않았고 원본 한글 조판 동치/전체 픽스쳐 완료는 별도입니다.

## 재현과 원인 분리

수식 Worker 묶음 연결 후보의 깨끗한488902a1 사본에서 실제 issue5543_carried_anchor_ladder.hwpx 브라우저가 MissingDrawingParagraphReference로 실패했습니다. Worker 변경이 없는 API 게시 사본에서도 같은5f3baacd WASM으로 똑같이 실패했으므로 Worker 묶음 응답 변경으로 분류하지 않습니다. 실제46경로의 구/신 Worker 응답도 동일했습니다.

문서 글자 높이 보존 수정 뒤 작은 글꼴로 재조판하면서 두 경계가 드러났습니다. 고정8px/현재 폰트 높이에서는 그림350의 이미지124.51px는 종이 안이지만 캡션을 포함한157.17px 프레임 끝이 종이 아래를 넘었습니다. 전체 textHeight를20px로 강제한 대조는 다음 쪽에 배치됩니다. 실제 글꼴 브라우저의 상세 오류는 UnsupportedNestedParagraphReference였으며, 한 도형의 문단이 페이지를 걸치는데 전체 문단이 한 페이지여야 한다고 요구하던 별도 문제입니다.

## 책임과 수정

picture-caption-page-fit.mjs의 pictureFramePaperFit이 종이 기준 fit/아래 넘침 advance/복구 불가 overflow를 판단합니다. 잘못된 크기·좌우/위쪽 이탈·한 쪽보다 큰 프레임은 거부합니다. 기존 captioned-picture-body의 최종 검사도 이 공통 함수를 사용합니다. reserved-picture-page-flow는 캡션 전체가 아래로 넘칠 때 기존 monotonic anchor page 하한을 한 쪽 올리고 다시 측정합니다. 원본 위치·크기·글자 크기를 바꾸거나 프레임을 잘라 성공으로 만들지 않으며 반복/페이지 예산을 유지합니다. 캡션 없는 예약은 기존 정책을 유지합니다.

nestedParagraphReference는 기본 호출의 전체 단일-frame 요구를 유지합니다. 명시적인 pageOrdinal/columnOrdinal이 있을 때도 먼저 원본 문단 전체의 UTF-16 coverage를 검증한 뒤 해당 쪽/단의 현재 행으로 기준 박스를 계산합니다. drawingPageReference만 이미 검증한 도형 앵커의 쪽/단을 전달합니다. 다른 쪽의 누락 텍스트를 무시하거나 변환/clip을 임의 허용하지 않습니다. 이는 현재 표시 조판 정책이며 원본 한글의 모든 paragraph-relative 규칙 동치 증명이 아닙니다.

## 검증

새 캡션 overflow 회귀는 수정 전4pass/1fail(쪽0을 반환)이고 수정 후 다음 쪽 배치와 종이 경계를 통과합니다. 쪽 선택 회귀는 원래 기본 호출 거부를 유지하고 전체 coverage 누락·선택 쪽 없음·잘못된 단·입력 불변을 검사합니다. 순수 fit 반례와 실제 Worker 배치를 합친4파일9/9·skip0을 확인했습니다. 실제 고정 측정5쪽282행도 복원됐습니다.

깨끗한 Worker 사본의 실제 브라우저 산출물 hwpjs-caption-canvas-WoPhFw는 신뢰된 Canvas 클릭·한글/이모지 입력·undo/redo·독립 전체 XML/ZIP normal/-O/틀린 표식·다운로드·재업로드를 통과했습니다.5쪽·그림6/6해독이며 source hashes 불변, saved SHA256c52f341a5fbd58ea4d6db7e716138fa2888fdbcec45e072fad0db13ba1b45fad입니다. 마지막 fit 함수 공통화 뒤9개 회귀도 다시 통과했습니다. 브라우저/전용 서버는 종료됐습니다. 이 항목은 게시 전 관측 이력이며 Worker 연결·기본 WASM 승격과 구분합니다.
