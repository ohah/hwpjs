# HWP5 BinData 인코딩 정책

## 계약과 SSOT

`hwp5/bin_data_stream.zig`의 `encode`/`encodeWithPolicy`는 이미 디코딩된 BinData bytes를 저장 형식으로 바꿉니다. 항목 종류·보안 기능·압축 여부 판정은 decode와 encode가 하나의 private `compressionPolicy`를 호출하며, 그 함수만 `feature_policy.requireSupported`, `BinData.isCompressed`를 사용합니다. 별도 압축 플래그 해석을 만들지 않습니다.

LINK는 외부 파일에 쓰지 않고 `ExternalLink`, 미지 종류는 `UnsupportedBinDataType`, reserved 압축값은 `UnsupportedCompression`으로 거부합니다. default 압축은 FileHeader의 compressed 비트를 따르고, compressed/uncompressed 항목값은 이를 명시적으로 덮어씁니다.

압축 경로는 [stored-block raw DEFLATE encoder](raw-deflate-stored-encoder.md)를 사용하고 CRC32/ISIZE trailer는 붙이지 않습니다. 비압축 경로도 caller 입력을 그대로 반환하지 않고 독립 복사합니다. 두 경로 모두 결과는 caller 소유이고 한도를 넘는 할당은 하지 않습니다.

## 검증

FileHeader 기본 압축 true/false와 항목 default/compressed/uncompressed의 여섯 조합을 모두 검사합니다. 압축 결과는 기존 BinData decode로 다시 풀어 원문과 대조하고, 비압축 결과는 같은 bytes이지만 다른 저장 공간인지 확인합니다. 입력 변경 후 결과가 유지되는지, 정확한 결과 길이보다 1바이트 작은 한도, 모든 할당 실패 지점도 조합별로 검사합니다.

reserved/LINK/미지 종류와 distribution 기본 거부를 정확한 오류로 확인하고, 명시적인 observed distribution 정책에서만 인코딩을 허용합니다.

최종 공통 정책 함수의 압축 판정을 항상 false로 고정, FileHeader 기본 압축값 반전, encode 비압축 복사의 마지막 바이트 제거, 공통 feature gate 제거, 공통 LINK 오류 변경의 다섯 소스 변형을 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 15개 조합 모두 컴파일 성공 후 실제 assertion 실패와 종료 코드 1로 검출했습니다. 컴파일 실패나 trap은 검출로 세지 않았습니다. 격리 로그는 `/tmp/hwpjs-bin-data-policy-mutants.CbF3cV`에 남겼습니다. 공통화 전 encode 중복 코드에 수행한 초기 15회는 최종 실적으로 사용하지 않습니다.

## 남은 범위

이 API는 저장할 CFB 경로를 선택하거나 FileHeader/DocInfo를 수정하지 않습니다. 바깥 HWP CFB의 정확한 BinData stream 교체와 전체 파일 재생성은 다음 상위 계층이 담당합니다. stored block은 호환되지만 기존 압축 stream보다 커질 수 있습니다.
