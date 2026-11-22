# HWPX 그림 crop optional ABI 후보

기준 source 00f52d69e3990462c54ebf13db91a40263a166a1 + Native2 crop 0dfc18581b12095172ae5667788b6794782603fe75c3035b0d64090dfc28f554이다. origin 1c3a52842는 기준과 roadmap 문서만 다르며 integration tree 1c4650b7e584ec6248b0aca36e0c9492775400cb의 Native2 7개 source byte 일치를 별도로 확인했다. 이 ABI 후보는 source 준비만 했으며 Native/compiled WASM/SDK/GUI 미실행이다. Native2 actual 13/13 PASS는 기존 source rectangle/history의 증거로만 유지한다.

## 선택적 공개 경계

새 함수는 hwpx_edit_picture_crop_edit_version(), capture(section,pictureNode), commit(ptr,len), release(ptr,len) 네 개다. 모든 결과는 u32이고 wasm32 인자도 i32다. version은1이며 capture는1+기존 output 버퍼, commit은0거부/1변경/2noop/3불확실, release는정확일치1/구키·누락·소모키0+StalePictureCropLease다. 구키로 새 lease를 취소하지 않는다. 기존 hwpx_edit_picture_crop의 HPC1 출력과 일반 ABI를 변경하지 않는다. js/abi-schema.mjs가 SSOT이며 생성 파일은 tools/generate-abi.mjs로만 작성한다.

capture JSON은 {profileVersion:1,format:'hwpx',section,pictureNode,leaseKey:'canonical positive u64 decimal',crop:{left,top,right,bottom},bounds:{width,height,basis:'explicit_pair'|'absent_75_policy'},historyRevision}다. commit은 {leaseKey,crop}, release는 {leaseKey}만 받는다. 중복·미지 키·인용 숫자·실수·음수 새 사각형·u32 초과를 거부한다. capture의 기존 signed 원값은 [-2147483648,4294967295] 범위까지 정확 JSON 정수로 공개한다. clip 저장 타입은 i64이지만 현재 reader도 signedOrUnsigned32로 동일 범위를 제한한다. 범위 밖 원문은 저장 보존하고 typed crop 조회와 capture는 기존 InvalidSignedOrUnsigned32로 거부한다. ABI encoder는 future model 방어를 위해 동일 범위를 명시 재검사해 UnsupportedPictureCropCaptureValue를 반환한다. reader나 painter 범위를 확장하지 않는다. clip 끝에서 media 크기를 만들거나 imgDim을 생성하지 않는다. 공개 transport에 Native ticket/hash/owner/frame은 넣지 않는다.

## 수명과 최종 권한

한 WASM instance의 Native Store가 실제 allocated Observation을 소유한다. session formatting epoch, document_text_generation, history revision으로 frame을 묶고, 실제 History-issued ticket을 validatePictureCrop에서 재검증한다. 이 메서드는 Native2 validate를 현재 History scope/epoch로 호출하며 no-op도 포함한다. 외부 echo ticket이나 caller image 크기는 권한이 아니다.

모든 capture 시도는 실패 포함 이전 lease를 clear하고 close도 clear한다. serial은 close로 초기화하지 않는다. matching commit은 crop parse/guard/stale/noop 전에 take한다. raw JSON이 깨져 키조차 확인할 수 없으면 기존 authority를 clear한다. 정상적으로 해석된 다른 키는 현재 lease를 취소하지 않는다. 캡처 raw value가 SDK domain 밖이거나 출력 할당에 실패해도 retained authority를 clear한다. 읽기 scope·history poison·foreign owner·epoch 변화를 거부한다.

JS는 host validation/memory allocation 실패 시 Native를 호출하지 않아 lease가 그대로다. actual commit 직전 local capture를 consume한다. Native로 들어온 matching 호출은 결과와 무관하게 소모한다. malformed capture 응답에 canonical key가 확인되면 그 키로 release하되 primary error를 보존한다. 키 자체가 불명확하면 추측 release나 자동 recapture하지 않고 다음 capture/close까지 격리한다. Noether가 별도 JS/Core/Worker/UI를 소유한다.

## 검증 준비와 저장 산출물

Native probe는 hwpx_picture_crop_edit_abi_probe.zig이며 HX crop ABI named11+registrar1을 준비했다. 실제 WASM allocator를 사용하는 hwpx_edit.zig 전체를 Native용 allocator로 우회하지 않는다. Native는 export와 같은 portable handler/wire/History를 실행하고, 실제 export 서명·컴파일은 Main의 별도 WASM gate로 증명한다. 현재 새 함수4개의 source 선언과 기존 HWPX 함수307개의 서명 보존, generated schema check, zig fmt만 검사했다.

approved fixture는 exact Git blob 00f52d69e:apps/docs/docs/public/editor/fixtures/picture-resize.hwpx, SHA256 3beb9964f3a194f9d54ecac8ccc11949d1289fa141487028f6d070fd2b4ef255다. 파일은 별도 test source fixture로 복제했고 원본을 수정하지 않는다. Native test는 section0.xml의 원본 imgClip offset1871의 물리 pic parent를 찾은 뒤 실제 History query를 거친다. 공개 비교 사각형은 left225/top375/right4575/bottom2025이며 raw oracle 순서는225,4575,375,2025다. 기타 방어 테스트의 별도 사각형은 유지한다.

focused 실행 전 새 소스/compiler pin, private cache, nice10/-j1, 슬롯/디스크 gate 및 명시 실행 승인이 필요하다. HWPJS_CROP_EVIDENCE_DIR은 비어 있는 owned 절대 폴더여야 한다. 누락은 테스트 실패이며 skip하지 않는다. Sink는 exclusive create로 원본/편집/undo/redo hwpx와 metadata.json을 쓴다. 기존 실패 패킷을 덮지 않는다. 실제 saved artifacts는 아직 없다.

후속 실행 계획은 `nice -n 10 zig test src/hwpx_picture_crop_edit_abi_probe.zig -O ReleaseSafe -fllvm -j1 --test-filter 'HX crop ABI'`다. 실제 owner가 거부하면 첫 실패를 그대로 보존하며 admission/fixture 기대를 완화하지 않는다. 성공 후 independent checker에 original/edited, Contents/section0.xml,1871,225,4575,375,2025를 전달하고 undo는 원본 전체 바이트와 비교한다. H5 paired runner는 H5 saved 파일이 따로 준비됐을 때만 실행한다.

기존 docs/hwpx-inserted-image-source-crop.md와 원본 reader/renderer는 그대로다. Noori Exif orientation1 허용은 이 후보에 포함하지 않고 후속 프로필로 보존한다. production WASM/browser/deploy는 독립 실행하지 않는다.
