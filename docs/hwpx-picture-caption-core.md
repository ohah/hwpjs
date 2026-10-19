# 그림 캡션 코어와 현재 문단 연결

`table_caption_values.readPicture`는 정확한 `pic` 노드의 직접 caption 값만 읽고 기존 caption 필드 파서를 재사용합니다. 캡션 부재는 null, 잘못된 그림 노드는 오류입니다. 캡션의 시각적 배치·본문 어울림·편집 가능 여부를 여기서 판단하지 않습니다.

`caption_list_owner.zig`는 직접 `pic/tbl → caption → subList → p` 연결과 namespace·중복을 검사합니다. `caption_current_bindings.zig`는 현재 문단의 joined 조각 소속 일치·100000개 한도·문단 번호 오버플로·할당자 소유 결과와 실패 정리를 소유합니다. 표와 그림은 같은 순회를 재사용하되 기존 표 출력 타입과 오류를 유지합니다. `picture_caption_bindings.zig`는 native 전역1기반 paragraph와 picture_node/caption_node/list_node를 반환합니다. 원문 노드를 복제한 별도 편집 캐시는 만들지 않습니다.

이 커밋은 native 코어뿐입니다. optional WASM ABI·JS·Worker·Canvas·그림+표 어울림은 후속 연결이며 제품 기본 WASM을 교체하지 않습니다.

집중 검사: `mise exec -- zig test src/picture_caption_probe.zig -O ReleaseSafe --test-filter 'HWPX picture caption source' --test-filter 'HWPX current caption bindings' --test-filter 'HWPX table caption source'`. 루트 sentinel 포함10/10·skip0입니다. 직접/간접 소속·중복·현재/joined 문단·기존 표 회귀·모든 할당 실패를 검사합니다. 실제 참조 그림350은 native paragraph32의 caption이며 width8504/gap850/last_width14004를 읽었습니다.

고정 소스 `/tmp/hwpjs-picture-policy-publish.3oorRe`의 tree `382b141071b69b399db4860ab80b2f636714beb2`에서 `zig build test -j2 -Doptimize=ReleaseSafe --summary all`은7/7단계·4148/4149통과·1skip·exit0입니다. runner 본체4139pass/1skip와 추가9pass입니다. skip 이름은 요약에 없어 미확인입니다. 제품 ReleaseSafe 빌드도5/5단계이며 별도 prefix를 사용했습니다. 이 고정 native 소스와 후속 JS/ABI 후보 전체를 같은 검증 결과로 합치지 않습니다.

`caption-core.result.json`은 nativeSuccess=true·signal=null·stopped=false·measuredLimitExceeded=false·resourceObservationComplete=true, 표본2622·관측 오류0입니다. 프로세스 트리 RSS 표본 합계 최대8237456KiB/제한10485760KiB·5302523ms입니다. 공유 페이지가 중복될 수 있는 관측값이며 OS hard cap 또는 정밀 peak가 아닙니다. stdout의 `failed command` 문구만으로 실패를 단정하지 않고 최종 build summary와 exit0을 확인했습니다. 이는 모든 픽스쳐 편집·조판·브라우저 완료 증거가 아닙니다.
