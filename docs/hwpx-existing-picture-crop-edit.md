# HWPX 기존 그림 crop Native 편집 후보

기준은 7bec628a6a1707ac6e24bb7f64661dc8fb294231이다. 소스 구현과 집중 테스트 준비만 수행했으며 Native 컴파일/실행, WASM, SDK, Worker, UI, 브라우저 검증은 미실행이다. 기존 삽입 crop의 과거 실행 증거를 이 기능의 실행 증거로 합산하지 않는다.

## 범위와 좌표

현재 Session의 section/물리 hp:pic 하나를 선택한다. 공개 표시 노드나 bitmap hit-test가 쓰기 권한을 부여하지 않는다. 기존 picture_replacement_current의 단일 id, 현재 source/resource digest, embedded resource link, 현재 표시 anchor/field 및 ancestor lock 검사를 재사용한다. History별 고유 Native scope와 되돌리지 않는 mutation epoch, history revision을 함께 검사한다. 이 관측은 Native 전용이며 공개 hash/ticket 전송이나 새 optional ABI는 추가하지 않는다.

사각형은 named left/top/right/bottom source 좌표다. 저장 imgClip 배열은 left/right/top/bottom이다. shared picture_crop_rectangle의 containment만 공유하며 HWPX의 숫자 인코딩과 소유권은 해당 모듈이 소유한다. 현재 reader의 signed 원값과 imgDim 부재/partial/zero/양수쌍을 유지한다. 원값이 음수 또는 바깥인 기존 파일을 자동 보정하지 않는다. 새 요청은 음수/빈 사각형/역순/경계+1을 거부한다. wide u32 source extent는 HWPX reader 범위 안에서 유지한다.

양수 imgDim 쌍은 명시 extent다. imgDim 요소가 완전히 없을 때만 현재 painter의 75 표시 정책에 실제 검사된 PNG/JPEG 픽셀 크기를 결합한다. 75는 보편적인 공식 DPI 규정이 아니다. present-empty/partial/zero 기준은 UnsupportedPictureCropReference, 누락 clip은 MissingPictureCropEdges, 미지원 media는 기존 inspector 오류를 변경 전에 반환한다. JPEG Exif와 PNG eXIf/APNG는 아직 source-to-preview 대응을 증명하지 않아 명시 거부한다. clip 끝값, orgSz/curSz, 표시 크기로 픽셀 크기를 역산하지 않으며 imgDim을 만들지 않는다.

## 저장과 이력

History V2 명령 picture_crop만 허용한다. 현재 관측을 no-op에도 재검증하고 stack.prepare 전에 false를 반환해 prior redo를 보존한다. 단일 명령만 받으며 교차 Session/History, undo 뒤 재사용, stale source/resource/ticket을 거부한다. pending created table의 기존 parked transaction 제한은 유지한다.

현재 Session save로 모든 선행 semantic intent를 materialize한 뒤 Native가 발급한 unique picture id와 resource link/digest, 원값/basis를 재검증한다. 기존 imgClip 네 속성의 값 span만 작성해 새 ZIP 후보를 열고 기존 parked-document history edge로 원자적으로 교환한다. 크기/위치/행렬/줄 배치 cache/원본 media/OPF와 비대상 항목을 건드리지 않는다. source crop은 고정 destination frame에만 적용되므로 line cache를 제거하지 않는다. 서명/암호화/미지원 보안 메타데이터, root/ancestor lock과 보호 field는 거부한다. size-only 보호는 geometry 변경과 분리하며 공통 크기 변경 허가로 쓰지 않는다.

## 준비된 검증과 후속

hwpx_existing_picture_crop_probe.zig의 HX existing crop 필터는 synthetic named 10 + registrar 1이다. 원값/basis, 정확 경계와 +1, lexeme 보존, PNG/JPEG 단일 이력/저장/재열기/undo/redo, stale/교차 History/no-op redo, 잘못된 명령, 명시/빈/partial/zero 기준, lock/media 거부, 같은 세션 신규 삽입 및 pending dimension 유지, field 보호를 포함한다. 공통 rectangle 2개는 별도 이미 실행된 사용자 보고이며 이 후보의 실행 결과가 아니다. OOM sweep은 별도 코호트로 계획하고 regular 실행에 넣지 않는다.

실행 전 전체 source/compiler closure pin, 독립 synthetic fixture hash, explicit one-shot runner, 자원/슬롯 확인이 필요하다. 일반 명령 후보는 `nice -n 10 zig test src/hwpx_existing_picture_crop_probe.zig -O ReleaseSafe -fllvm -j1 --test-filter 'HX existing crop'`이며 실제 compiler clone과 환경은 실행 승인 시 고정한다. 현재 이 명령은 실행하지 않았다.

원시 ZIP/XML의 비대상 entry/media byte 동치와 실제 canvas painter source rectangle oracle, optional ABI lease/JS/Core/Worker, 기존 그림 속성창 crop UI는 후속이다. 형식별 runtime 성공·공개 사용자 workflow 완료를 아직 주장하지 않는다. clean-room 우선 자료는 자체 picture owner/history/XML writer와 docs/hwpx-inserted-image-source-crop.md에 기록된 공개 OWPML PictureType imgClip/imgDim 구분이다. 타 구현이나 외부 expected JSON을 참고하지 않았다.
