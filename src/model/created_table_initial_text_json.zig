//! 셀 본문은 실제 JSON 문자열이어야 합니다. 숫자 배열의 암묵적 바이트 변환을 거부합니다.
const std = @import("std");

pub fn validate(a: std.mem.Allocator, bytes: []const u8, required: bool) !void {
    const parsed = std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always }) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => return error.InvalidTableCreationRequest,
    };
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidTableCreationRequest;
    const grid = parsed.value.object.get("cell_texts") orelse {
        if (required) return error.InvalidTableCreationRequest;
        return;
    };
    if (grid != .array) return error.InvalidTableCreationRequest;
    for (grid.array.items) |row| {
        if (row != .array) return error.InvalidTableCreationRequest;
        for (row.array.items) |cell| if (cell != .string) return error.InvalidTableCreationRequest;
    }
}
