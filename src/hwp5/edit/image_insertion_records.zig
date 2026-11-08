//! 새 인라인 그림의 고정 레코드 생성기입니다. 문단·DocInfo·CFB 갱신은 수행하지 않습니다.
//! 명세 표 69·70·82~85·107·108을 사용하며 기존 그림의 속성을 복사하지 않습니다.
const std = @import("std");
const rules = @import("../body/control_rules.zig");
const Size = @import("../../image/image_insertion.zig").Size;

pub const Payloads = struct {
    text_control: [16]u8,
    control: [46]u8,
    component: [196]u8,
    picture: [82]u8,
};

fn put32(bytes: []u8, at: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[at..][0..4], value, .little);
}
fn matrix(bytes: []u8) void {
    for ([_]f64{ 1, 0, 0, 0, 1, 0 }, 0..) |value, index| {
        std.mem.writeInt(u64, bytes[index * 8 ..][0..8], @bitCast(value), .little);
    }
}

/// instance_id와 bin_data_ordinal은 문서 전체에서 검증·예약한 값이어야 합니다.
/// 크기는 절대값, 인라인·줄간격 영향 켬, 여백·회전·크롭·효과 없음인 명시 프로필입니다.
pub fn create(size: Size, bin_data_ordinal: u16, instance_id: u32) !Payloads {
    if (size.width == 0 or size.height == 0 or size.width > std.math.maxInt(i32) or size.height > std.math.maxInt(i32)) return error.InvalidPictureInsertionSize;
    if (bin_data_ordinal == 0 or instance_id == 0) return error.InvalidPictureInsertionIdentity;
    var result: Payloads = .{
        .text_control = @splat(0),
        .control = @splat(0),
        .component = @splat(0),
        .picture = @splat(0),
    };
    std.mem.writeInt(u16, result.text_control[0..2], 11, .little);
    put32(&result.text_control, 2, rules.drawing_id);
    std.mem.writeInt(u16, result.text_control[14..16], 11, .little);
    put32(&result.control, 0, rules.drawing_id);
    put32(&result.control, 4, 1 | (1 << 2) | (2 << 3) | (3 << 8) | (4 << 15) | (2 << 18));
    put32(&result.control, 16, size.width);
    put32(&result.control, 20, size.height);
    put32(&result.control, 36, instance_id);
    put32(&result.component, 0, rules.id("$pic"));
    put32(&result.component, 4, rules.id("$pic"));
    put32(&result.component, 20, size.width);
    put32(&result.component, 24, size.height);
    put32(&result.component, 28, size.width);
    put32(&result.component, 32, size.height);
    put32(&result.component, 42, size.width / 2);
    put32(&result.component, 46, size.height / 2);
    std.mem.writeInt(u16, result.component[50..52], 1, .little);
    matrix(result.component[52..100]);
    matrix(result.component[100..148]);
    matrix(result.component[148..196]);
    // 그림 좌표의 기존 읽기 프로필과 같은 interleaved 사각형입니다.
    put32(&result.picture, 20, size.width);
    put32(&result.picture, 28, size.width);
    put32(&result.picture, 32, size.height);
    put32(&result.picture, 40, size.height);
    put32(&result.picture, 52, size.width);
    put32(&result.picture, 56, size.height);
    std.mem.writeInt(u16, result.picture[71..73], bin_data_ordinal, .little);
    put32(&result.picture, 74, instance_id);
    return result;
}

/// 호출자의 출력에 부분 레코드를 남기지 않고 세 레코드를 소유한 새 버퍼로 반환합니다.
pub fn encode(a: std.mem.Allocator, payloads: *const Payloads, paragraph_level: u10, limit: usize) ![]u8 {
    if (paragraph_level > std.math.maxInt(u10) - 3) return error.LimitExceeded;
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    const writer = @import("../record_writer.zig");
    try writer.append(a, &output, 71, paragraph_level + 1, &payloads.control, limit);
    try writer.append(a, &output, 76, paragraph_level + 2, &payloads.component, limit);
    try writer.append(a, &output, 85, paragraph_level + 3, &payloads.picture, limit);
    return output.toOwnedSlice(a);
}
