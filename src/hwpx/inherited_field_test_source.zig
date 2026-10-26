//! 선택 reference를 읽는 테스트 전용 공통 소스입니다. 저장이나 dump를 하지 않습니다.
const std = @import("std");
pub const Case = struct { path: []const u8, sha256: []const u8 };
pub const cases = [_]Case{
    .{ .path = "reference/rhwp/samples/hwpx/opengov/36389298_결재문서본문_물품검사(수)조서(라벨테이프 등).hwpx", .sha256 = "056b7476db2f45b43082397f3647d9450cd9eb73bfcf0b22e39693f92f0b26ea" },
    .{ .path = "reference/rhwp/samples/issue2373/156689818_kftc_press.hwpx", .sha256 = "f84d5ab47795b9933eef405d9ef611055cdd00091f4b03903398e543b471a2cd" },
    .{ .path = "reference/rhwp/samples/issue5162_field_wraps_table.hwpx", .sha256 = "c8f07209f7d60d60c32c7918800545c1b3079ef4e0178eaf44ca2bfe23cfc0c8" },
};

pub fn load(a: std.mem.Allocator, index: usize) ![]u8 {
    if (index >= cases.len) return error.InvalidFixtureIndex;
    const selected = cases[index];
    const bytes = std.Io.Dir.cwd().readFileAlloc(std.testing.io, selected.path, a, .limited(64 * 1024 * 1024)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    errdefer a.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    const hex = std.fmt.bytesToHex(digest, .lower);
    if (!std.mem.eql(u8, &hex, selected.sha256)) return error.InheritedFixtureSourceMismatch;
    return bytes;
}

test "inherited fixture loader invalid index is not optional" {
    try std.testing.expectError(error.InvalidFixtureIndex, load(std.testing.allocator, cases.len));
}

test "inherited fixture loader allocation failure is not skipped" {
    const bytes = try load(std.testing.allocator, 0);
    defer std.testing.allocator.free(bytes);
    var failing = std.testing.FailingAllocator.init(std.testing.allocator, .{ .fail_index = 0 });
    try std.testing.expectError(error.OutOfMemory, load(failing.allocator(), 0));
}
