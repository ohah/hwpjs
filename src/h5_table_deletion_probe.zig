//! 전용 필터로 합성 검사만 실행한다. 실물 파일 검사는 별도 후보에서 수행한다.
test "HWP5 표 전체 삭제 검사 등록" {
    _ = @import("hwp5/edit/table_deletion_tests.zig");
    _ = @import("hwp5/edit/table_deletion_file.zig");
}
