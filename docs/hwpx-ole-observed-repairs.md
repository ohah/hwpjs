# HWPX OLE 관측 편차의 복사본 검사

## 범위와 판정

`src/cfb/observed_repairs.zig`는 원본 CFB가 strict 검사에서 `InvalidRoot` 또는 `InvalidFat`으로 실패한 경우에만 HWPX OLE 계층이 호출합니다. 원본 바이트와 원래 `Target.inspection_error`는 그대로 둡니다. 임시 복사본의 **루트 생성 시간**, **파일 끝 이후 FAT 슬롯의 0**, **루트 mini-stream 용량 밖 MiniFAT 슬롯의 0**만 명세값으로 치환한 뒤 기존 strict CFB reader 전체를 다시 실행합니다. 다른 값·위치·구조 오류는 고치지 않고 `normalization_error`로 남깁니다. 이것은 원본의 명세 적합성 인정도 파일 저장/수정도 아닙니다.

FAT 복구는 DIFAT 섹터가 없고 헤더의 FAT 목록이 109개 이내인 입력에 한정합니다. MiniFAT 복구는 MiniFAT 섹터가 정확히 하나일 때만 수행합니다. 이 제한은 관측 표본의 좁은 편차만 대상으로 삼기 위한 것이며, 더 복잡한 CFB를 비엄격 파서로 자동 우회하지 않습니다. 정상 strict 결과는 변경하지 않습니다. `Options.inspect_observed_repairs=false`로 별도 조사를 끌 수 있습니다.

`Target.normalized`에는 **복사본 strict 재검사**의 편차 원값·변경 슬롯 수·내부 엔트리/스트림 계수를 둡니다. `Target.inspection_error`와 `Report.inspection_failures`는 원본의 strict 실패를 계속 나타냅니다. strict 계수와 normalized 계수는 섞지 않되, 작업 한도는 둘을 합산해 적용합니다. 정규화 실패를 정상 컨테이너로 세지 않으며 OOM·한도 초과는 호출 오류로 전파합니다. 내부 스트림 `Contents`의 의미, OLE 활성화, 렌더링, 편집·저장은 여전히 범위 밖입니다.

Microsoft [MS-CFB 루트 항목](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/026fde6e-143d-41bf-a7da-c08b2130d50e)은 루트 생성 시간이 0이어야 한다고 명시합니다. [FAT 예시](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/42af9724-54c8-4e6a-9e3e-f114335ab0e6)와 [MiniFAT 예시](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/b3142838-fc70-4f54-a194-90c3c9515afd)는 사용하지 않는 슬롯을 FREESECT로 표시합니다. 이 문서의 0 슬롯은 관측된 비준수 입력이며, 모든 0 슬롯을 임의로 재해석하는 일반 규칙이 아닙니다.

## 독립 대조와 한계

2026-09-26의 두 로컬 corpus에서 읽을 수 있는 HWPX 476개 중 OLE 후보 99개를 확인했습니다. 원본 strict 통과 65개와 실패 34개는 분리됩니다. 실패 34개는 임시 복사본의 strict 재검사에 모두 성공했습니다. 34개 모두 루트 생성 시간이 비영, 그중 14개는 EOF 이후 FAT 0 슬롯, 2개는 mini-stream 용량 밖 MiniFAT 0 슬롯이 추가로 있었습니다. 따라서 원본 strict 실패 34건을 성공 99건으로 바꿔 세지 않습니다.

선택적 독립 조사 `python3 tools/hwpx-ole-payload-oracle.py --compat`는 로컬 BSD `olefile` 0.47을 사용합니다. 제품 의존성이 아닙니다. 독립 파서가 추출한 99개 OLE의 스트림 수·총 바이트·각 스트림 SHA-256 앞 64비트의 순서 무관 합을 8개 shard에서 Zig의 복사본 strict 결과와 전부 대조했습니다. 이 해시 대조는 같은 내용에 대한 강한 표본 근거이지만, 전체 스키마·표시·편집 동일성의 증명은 아닙니다. Python의 기본 ZIP/XML·루트/FAT/MiniFAT 관측은 `--self-test`와 인자 없는 실행으로 재현합니다.

합성 반례는 원본 바이트 불변, 세 필드의 단독·복합 편차, 비영 꼬리 마커 거부, 실제 사용 중인 FAT 슬롯 손상 거부, 잘못된 루트 이름, 자원 한도 및 모든 할당 실패를 검사합니다. 기본 테스트는 `zig test src/root.zig --test-filter 'CFB observed repairs'`와 `--test-filter 'HWPX OLE payloads'`입니다. 실파일 스트림 대조는 `zig test src/hwpx_ole_repair_survey.zig -O ReleaseFast --test-filter 'HWPX OLE normalized shard N'`을 N=0..7 각각 실행합니다. 실파일 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에 포함되지 않습니다.

2026-09-26 확인: 복사본 검사 합성 6개는 Debug·ReleaseSafe·ReleaseFast에서 통과했고, 제품 OLE 합성 10개와 실제 `inspectKnown` 연결도 통과했습니다. 독립 Python `--self-test`, 기본 관측, `--compat` 및 전용 OLE 실파일 8개 shard와 전체 HWPX known 8개 shard가 일치했습니다. 최종 소스의 Debug 전체 테스트 2,512/2,512, ReleaseSafe 전체 audit와 ReleaseSafe 제품 빌드도 통과했습니다. 이 결과는 원본의 strict 실패 34건을 정상 파일로 판정하거나, OLE 내부 `Contents`의 의미를 해석했다는 뜻이 아닙니다.
