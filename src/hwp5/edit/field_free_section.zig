//! 파일 변환의 초기 지원 프로필은 필드가 없는 구역이다.
//! 문단을 가로지르는 범위를 지역 텍스트 검사로 추측하지 않는다.
pub fn validate(tree: @import("../body/tree.zig").Tree) !void {
    for (tree.nodes) |row| {
        if (row.record.value != .text) continue;
        var tokens = row.record.value.text.tokens();
        while (try tokens.next()) |token| {
            if (token.value == .control and (token.value.control.code == 3 or token.value.control.code == 4)) return error.ProtectedFieldRange;
        }
    }
}
