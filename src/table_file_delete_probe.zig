//! 합성 출력 소유권 검사는 전용 필터로 실행한다. 파일 변환 실물 검사는 별도다.
test "표 파일 삭제 ABI 검사 등록" {
    _ = @import("wasm/table_file_delete_output_tests.zig");
}
