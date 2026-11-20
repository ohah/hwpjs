# HWP5 조판 저장 후보 계약

하위 작성부의 원래 상태 기록이다. 후속 Session·History·ABI 연결 소스와 현재 제한은 [strict plain 통합 계약](hwp5-strict-layout-integration.md)을 따른다. Core·CLI 기본 경로는 아직 연결하지 않았다. 기본 strict 저장 거부를 유지한다. 이 후보는 조판 저장 완료나 공식 한글 상호운용 완료가 아니다. 일반 Canvas 최적화 계약은 [증분 조판 설계](incremental-layout-design.md)가 소유하고, 여기서는 Native 저장에 필요한 데이터·수명·원본 보존 계약만 추가한다.

## 근거와 최소 범위

기준은 chart-worker와 현대 생성이 통합된 d8c943a36cef87ee76d32ce66b40897325e81f5f의 own source다. 형식 근거는 SHA1d1da9e6fe22563ae2c5285bbbfc6762974fb7f002278084cbc11e5266bdc782인 한컴 revision1.3 PDF 표62와 같은 후보의 typed reader/header 모델이다. rhwp 구현·알고리즘·expected JSON은 보지 않았다. 엄격한 클린룸 절차의 독립성을 인증하는 문서로 쓰지 않는다.

첫 단계의 발행 범위는 top-level plain 본문, 단일단, 겹치지 않는 양의 줄 흐름이다. 여러 문단과 LF hard break, 빈 마지막 줄, 한글·보조 평면 문자·결합 문자를 데이터 계약에서 다룬다. 필드·inline 개체·중첩 표·복합 단·관측 불명확 원본·미지원 별도 줄 구분자에는 기존 거부를 유지한다. 새 문서 전용 dirty 예외를 두지 않는다. 같은 계약을 일반 편집의 현재 문단과 리소스에도 적용할 수 있도록 설계한다.

## 실제 엔진과 아직 없는 값

기존 layoutContent는 제공받은 measure와 grapheme 분절로 줄의 display UTF16 범위, 폭, textHeight, advance와 logical y를 계산한다. paginateBodyRows는 실제 pageOrdinal/columnOrdinal 및 column reference box를 붙인다. 새 observeHwp5LayoutForSave/observeHwp5PageLayoutForSave는 이 함수들을 그대로 호출하고 Native sourceOffsets로 범위를 연결한다. viewport의 원점·scroll 값은 저장 좌표로 쓰지 않고 실제 column box에서 뺀 local y만 관측한다.

이 엔진은 자신을 근사 grapheme 흐름으로 선언한다. 관측 row.height는 줄간격을 포함한 advance이고, HWP의 줄 상자 높이로 대입할 값이 아니다. Canvas 표시의 textBaseline=top을 임의 비율로 변환해 Native baseline을 만들지 않는다. 정확한 baseline/line-box와 text-height 의미, 적용 글꼴·fallback·shaping/줄바꿈 환경 및 HWP page-flow 원점은 아직 발행 자격이 확인되지 않았다. 관측 어댑터는 이를 unresolved로 돌려준다. 측정 callback이 실제 OS 측정인지, 합성인지도 별도 증거다. 검사에서 실제 엔진 계산을 실행한 것과 실측 글꼴을 검증한 것은 다르다.

## 저장 데이터

js/hwp5-line-layout-candidate.mjs는 Native-owned snapshot의 raw UTF16와 page/line 데이터의 논리적 일관성만 검사한다. 반환 kind나 freeze, caller의 숫자·메타데이터·브랜드는 권한이 아니다. certified나 allow-unverified 옵션을 만들지 않았다.

- version은 원본에서 얻은 명시 값이다. 첫 코덱은5.0.1.7 이상5.0.x를 다루며5.1은 거부한다. 포맷·문서 버전을 올리거나 없는 tracking 필드를 추가하지 않는다.
- 문단은 section, Native draft에서 얻은 header ordinal, 소유한 raw UTF16, 단조롭게 연결된 줄 범위로 구성한다. display/source의 차이를 보이는 문자열 길이로 추측하지 않는다. 확장 secd/cold payload나 surrogate pair·결합/ZWJ grapheme 내부는 줄 경계가 아니다. 한 batch의 플랫폼 grapheme provider로 일관성을 검사하며, 그 환경 결합은 발행 자격의 별도 조건이다. 마지막 CR은 본문 종결이며 LF를 흘리지 않거나 마지막 빈 줄을 빠뜨리면 거부한다.
- 쪽은 순서와 body/column 폭·높이를 가진다. 첫 단계는 단일단이다. 줄의 쪽 순서, 실제 첫 쪽/단 줄 플래그, 범위 초과, 음의/비유한 치수, 겹침을 검사한다. 제한된 엔진 결과와 불완전한 source/page mapping은 저장 입력이 아니다.
- 표62 출력은 start/y/height/text_height/baseline/spacing/x/width/flags의9필드, LE36바이트다. start는 원시 UTF16 단위, 세로·가로 값은 signed HWP 단위다. flags의 first page/column, empty와 첫/마지막 세그먼트 의미를 구분한다. bit31 구현 property나 미해석 비트는 새 레코드에서 거부한다. 초기 코덱은 한 줄 한 세그먼트만 다룬다.
- CSS96dpi의1px는75HWP 단위다. 양·음 같은 방향의 half-away-from-zero 양자화 후 i32 범위를 검사한다. 이는 단위 변환 규칙이며 실제 측정·쪽 의미의 인증이 아니다.
- JS 초기 정책은 body 안의 비음수 x만 발행 후보로 받는다. Native typed 코덱은 signed x를 손실 없이 보존한다. hanging indent 등 일반 편집 확장은 지오메트리 정책 검증을 추가해야 하며 수치 형식을 바꾸지 않는다.

## 원본 보존 작성부

src/hwp5/edit/line_layout_patch.zig는 이미 Native 모델에서 준비된 current section 바이트에 대해서만 순수 후보 버퍼를 만든다. 임의 CFB 후처리 도구가 아니며 CFB·FileHeader·DocInfo·Session dirty·history를 만지지 않는다. Native owner의 snapshot/qualification이 없으면 이 결과로 저장을 허용할 수 없다.

입력 patch는 정렬된 header ordinal과 현재 expected raw text, typed segments를 빌린다. 입력의 텍스트·헤더 count와 원래 cache count를 검증한다. 선택된 top-level 문단의 header line-count2바이트와 직접 tag69만 바꾼다. 헤더의 high bit·리소스 참조·instance·선택 버전 필드·framing을 복사해 보존하고, 선택하지 않은 레코드·알 수 없는 레코드의 raw bytes와 순서를 그대로 복사한다. 같은 payload의 기존 cache는 extended framing까지 그대로 보존한다. 원문 해석이 부족한 header tail·중첩 owner·중복 text/runs/cache는 거부한다.

새 버퍼는 전체 성공 뒤에만 반환한다. 늦은 문단 오류·예산 초과·할당 실패는 원본을 바꾸거나 부분 결과를 발행하지 않는다. 이 원본 보존은 section 작성부의 범위이며 전체 CFB 무손실·일반 편집 완료 주장과 구분한다.

## Native 저장 연결 설계

1. 기존 Session owner가 재사용되지 않는 문서 incarnation과 실제 history/mutation epoch를 사용하여 current model/resource/version snapshot을 준비한다. 기존 historyTicket과 owner 수명 계약을 재사용하며 숫자 revision만으로 새 권위를 만들지 않는다. 구조 편집 뒤에는 Native draft serializer가 current identity를 ordinal로 연결한다. 외부에서 임의 ordinal을 골라 발행하지 않는다.
2. 글꼴·자원·segmenter/shaping/provider generation을 고정한다. 시작/종료 snapshot과 환경을 결합하고 계산 중 편집/undo/redo/글꼴 변경이 있으면 결과를 폐기한다. 계산 callback의 getter나 caller self-certification으로 이 결합을 대체하지 않는다.
3. first plain scope에서는 영향받는 section 전체의 줄과 page-flow를 재계산한다. 앞 문단의 줄 수가 바뀌면 뒷 문단의 텍스트가 같아도 y/쪽/cache가 바뀔 수 있으므로 텍스트 dirty 문단만 쓰지 않는다. 바이트가 같은 cache는 보존하되 영향 closure를 먼저 증명한다.
4. 실제 baseline/line box가 포함된 내부 생산 결과를 논리 검사기와 Native typed 검증에 통과시킨다. 현재 근사 preview 관측만으로 이 단계를 통과시킬 수 없다. 공개 JS packet은 수치 검사 데이터이지 발행 토큰이 아니다.
5. Native current section draft를 메모리에서 정상 writer로 준비하고 line-layout patch를 적용한다. allow-stale 저장한 CFB를 다시 열거나 factory 텍스트를 미리 넣는 우회는 하지 않는다. 원본은 현재 owner가 성공 시까지 보관한다.
6. source/operation/resource/font environment와 전체 dirty layout coverage를 commit 직전에 다시 대조한다. 전체 Section·DocInfo 계획과 history 원자 거래 안에서만 검증된 layout revision을 설치하고 기존 정상 CFB writer로 저장한다. 이후 변경은 인증을 무효화한다. 깨진 source나 미지원 문맥은 기존 strict 거부를 유지한다.

이6단계의 실제 owner 연결은 이번 leaf 코덱·검사기를 붙였다는 이유로 존재한다고 부르지 않는다. 아직 Session.save의 제한을 해제하지 않았다.

## 비용과 한도

N은 glyph/UTF16 수U, 입력 record 수R, 출력 line 수L, paragraph 수P, page 수Q 및 실제로 복사하는 container 바이트B를 포함한다. 새 논리 검사기는 O(U+L+P+Q), section patch는 O(R+U+L)이다. 정렬된 ordinal과 disjoint 범위를 사용해 전체 framing1회와 선택 범위1회를 수행한다. 각 문단마다 문서 전체를 검색하거나 line마다 앞 문단·리소스를 다시 스캔하지 않는다. Typed 배열·candidate bytes의 메모리도 이에 선형이다.

한 번의 whole eligible section 재조판을 O(편집 길이)로 부르지 않는다. 일반 shaping 비용은 제공자의 별도 계약이며 임의 callback의 비용을 O(1)이라고 가정하지 않는다. 실제 일반 편집·복잡한 표/float 엔진 전체의 선형성을 이 leaf 검사로 주장하지 않는다. 전체 CFB 저장은 현재 writer의 O(B) 복사 비용도 계산해야 한다.

기본 한도는 raw UTF16 합4Mi units, 전체 line262144, paragraph line65535, page16384다. Native section output은 호출자의 명시 바이트 한도 안에서 준비한다. 한도는 실행 성공을 보장하는 튜닝 값이 아니라 자원 거부 계약이다.

## 준비 검사와 남은 gate

순수 Node14개는 Unicode·multi-line·trailing empty·source controls·page overflow/first flags·겹침·missing baseline·비유한 값·버전·명시 legacy·복사 소유권·예산과 선형 work 수를 검사한다. 실제 기존 grapheme/page 엔진도 합성 측정 callback으로 실행하며 source mapping과 쪽 넘침을 대조한다. 실제 폰트/Canvas/OS나 Native 저장의 증거는 아니다.

Native 준비7개는 독립36-byte 필드 기대값, signed 값·버전, surrogate/hard-break/empty 거부, 선택 header2/tag69 한정·opaque 이웃 보존, 반복 cache 동치, 늦은 실패/예산/순서의 원본 보존, 선형 방문 수와 extended framing 보존을 검사하도록 작성했다. 작성 당시 미실행이었고, 이후 별도 frozen Native7 cohort에서7/7 실제 통과했다. 이 통합 후보의 컴파일·저장 증거로 합산하지 않는다. Native 실패 주입·실제 Session/history·wire validation·자격 있는 실측 producer·정상 strict CLI 저장·공식 한글 수용은 후속 gate다. Root/배포는 별도다.
