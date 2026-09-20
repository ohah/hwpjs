# EMF+ OffsetClip record

## 범위와 단일 출처

`src/image/emf/emf_plus_offset_clip.zig`는 MS-EMFPLUS 2.3.1.1의 EmfPlusOffsetClip wire record를 소유합니다. Type `0x4035`, Size 20, DataSize와 실제 data 길이 8을 각각 검사하고 dx, dy를 공용 little-endian IEEE 754 binary32 reader로 읽습니다.

Flags는 reserved/MUST ignore이므로 16비트 원값을 보존하며 특정 bit 의미를 부여하거나 nonzero 값을 거부하지 않습니다. float의 signed zero, 무한대와 NaN payload도 정규화하지 않습니다.

## 미지원 경계

반환값은 clipping translation wire 명령만 표현합니다. 현재 world-space clipping region에 translation을 실제 적용하거나 graphics state snapshot 및 렌더링에 반영하는 기능은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

Flags 0과 모든 bit set, dx/dy 순서와 원시 float bit, 모든 payload 잘림, RecordType과 세 size 축, 공통 framing에는 유효하지만 전용 크기는 잘못된 stream, count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

다섯 관점의 적대적 검토로 (1) 공식 Type/Size/DataSize와 실제 slice 길이, (2) reserved Flags의 무시와 원시 16비트 보존, (3) dx/dy의 little-endian 순서 및 signed zero·NaN payload 비트 보존, (4) stream routing·count·오류 시 원자적 rollback·실제 EMF framing, (5) clipping translation replay가 아직 미지원이라는 경계를 각각 대조했습니다.

파서 조건·세 길이 축·Flags·dx·dy·stream parse·count·route의 의미를 독립적으로 훼손한 10종 변이를 Debug, ReleaseSafe, ReleaseFast에서 실행했습니다. 30/30 실행 모두 컴파일 오류나 timeout이 아닌 테스트 실패로 검출됐고 임시 작업 사본은 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1841/1841 test를 통과했습니다. 모드별 구성은 native 1802, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
