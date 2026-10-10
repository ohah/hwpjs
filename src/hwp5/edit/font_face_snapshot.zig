//! Read-only names; original UTF-16 resource bytes are never modified.
const std = @import("std");
const info = @import("../docinfo/reader.zig");
const shared = @import("../../model/font_face_value.zig");
pub const deinit = shared.deinit;

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, max_fonts: usize, max_name_bytes: usize) ![]shared.Value {
    const report = try @import("../docinfo/resources.zig").inspect(bytes, version, .{});
    try report.validate();
    if (report.face_name_count > max_fonts) return error.LimitExceeded;
    const rows = try a.alloc(shared.Value, report.face_name_count);
    var count: usize = 0;
    errdefer {
        for (rows[0..count]) |*row| row.deinit(a);
        a.free(rows);
    }
    var language: usize = 0;
    var local: u32 = 0;
    var iterator = try info.Iterator.init(bytes, version, .{});
    while (try iterator.next()) |record| {
        if (record.value != .face_name) continue;
        while (language < 7 and local == report.fontCount(@enumFromInt(language))) {
            language += 1;
            local = 0;
        }
        if (language >= 7 or count >= rows.len) return error.ResourceCountMismatch;
        const name = try decodeName(a, record.value.face_name.name_utf16, max_name_bytes);
        rows[count] = .{ .language = @enumFromInt(language), .id = local, .name = name };
        count += 1;
        local += 1;
    }
    if (count != rows.len) return error.ResourceCountMismatch;
    return rows;
}
fn decodeName(a: std.mem.Allocator, bytes: []const u8, limit: usize) !?[]u8 {
    if (bytes.len % 2 != 0) return error.InvalidFontName;
    if (bytes.len / 2 > limit) return error.LimitExceeded;
    const units = try a.alloc(u16, bytes.len / 2);
    defer a.free(units);
    for (units, 0..) |*unit, index| unit.* = std.mem.nativeToLittle(u16, std.mem.readInt(u16, bytes[index * 2 ..][0..2], .little));
    const name = std.unicode.utf16LeToUtf8Alloc(a, units) catch |err| switch (err) {
        error.DanglingSurrogateHalf, error.ExpectedSecondSurrogateHalf, error.UnexpectedSecondSurrogateHalf => return null,
        else => return err,
    };
    if (name.len > limit) {
        a.free(name);
        return error.LimitExceeded;
    }
    return name;
}

test "HWP5 font name display preserves empty NUL and invalid UTF16 without source changes" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const name = (try decodeName(allocator, &.{ 'A', 0, 0, 0, 0x3d, 0xd8, 0, 0xde }, 16)).?;
            defer allocator.free(name);
            try std.testing.expectEqualStrings("A\x00😀", name);
            const empty = (try decodeName(allocator, &.{}, 16)).?;
            defer allocator.free(empty);
            try std.testing.expectEqual(@as(usize, 0), empty.len);
            try std.testing.expect((try decodeName(allocator, &.{ 0, 0xd8 }, 16)) == null);
        }
    }.run, .{});
    try std.testing.expectError(error.LimitExceeded, decodeName(a, &.{ 0x00, 0xac }, 2));
}

test "HWP5 font face snapshot reads actual language partitions without source changes" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/facename.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const encoded = try source.file.readStream(a, "/DocInfo");
    const decoded = try @import("../stream.zig").decode(a, &source.header, encoded, 4_000_000);
    defer a.free(decoded);
    const rows = try read(a, decoded, source.header.version(), 1_000_000, 4096);
    defer deinit(a, rows);
    try std.testing.expect(rows.len > 0);
}
