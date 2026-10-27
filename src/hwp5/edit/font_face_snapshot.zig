//! Read-only names; original UTF-16 resource bytes are never modified.
const std = @import("std");
const info = @import("../docinfo/reader.zig");
const shared = @import("../../model/font_face_value.zig");
pub const deinit = shared.deinit;

pub const Metadata = struct {
    language: @import("../../model/character_fonts.zig").Language,
    id: u32,
    attributes: u8,
    substitute: ?struct { kind: u8, name: ?[]u8 },
    // Wider scalar array prevents JSON from treating the ten bytes as UTF-8.
    typeInfo: ?[10]u16,
    defaultName: ?[]u8,

    pub fn deinit(self: *Metadata, a: std.mem.Allocator) void {
        if (self.substitute) |sub| if (sub.name) |name| a.free(name);
        if (self.defaultName) |name| a.free(name);
        self.* = undefined;
    }
};

fn metadata(a: std.mem.Allocator, face: info.FaceName, language: @import("../../model/character_fonts.zig").Language, id: u32, limit: usize) !Metadata {
    var row: Metadata = .{ .language = language, .id = id, .attributes = face.attributes, .substitute = null, .typeInfo = null, .defaultName = null };
    errdefer row.deinit(a);
    if (face.substitute) |sub| row.substitute = .{ .kind = sub.kind, .name = try decodeName(a, sub.name_utf16, limit) };
    if (face.type_info) |bytes| {
        var values: [10]u16 = undefined;
        for (bytes, &values) |byte, *value| value.* = byte;
        row.typeInfo = values;
    }
    if (face.default_utf16) |name| row.defaultName = try decodeName(a, name, limit);
    return row;
}

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, max_fonts: usize, max_name_bytes: usize) ![]shared.Value {
    return readRows(shared.Value, a, bytes, version, max_fonts, max_name_bytes);
}

pub fn readMetadata(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, max_fonts: usize, max_name_bytes: usize) ![]Metadata {
    return readRows(Metadata, a, bytes, version, max_fonts, max_name_bytes);
}

fn readRows(comptime Row: type, a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, max_fonts: usize, max_name_bytes: usize) ![]Row {
    const report = try @import("../docinfo/resources.zig").inspect(bytes, version, .{});
    try report.validate();
    if (report.face_name_count > max_fonts) return error.LimitExceeded;
    const rows = try a.alloc(Row, report.face_name_count);
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
        while (language < 7 and local == report.fontCount(@fromBackingInt(@intCast(language)))) {
            language += 1;
            local = 0;
        }
        if (language >= 7 or count >= rows.len) return error.ResourceCountMismatch;
        rows[count] = if (Row == Metadata)
            try metadata(a, record.value.face_name, @fromBackingInt(@intCast(language)), local, max_name_bytes)
        else
            .{ .language = @fromBackingInt(@intCast(language)), .id = local, .name = try decodeName(a, record.value.face_name.name_utf16, max_name_bytes) };
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

test "HWP5 font metadata owns optional names and releases partial allocations" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const face: info.FaceName = .{
                .attributes = 0xe1,
                .name_utf16 = &.{ 'A', 0 },
                .substitute = .{ .kind = 255, .name_utf16 = &.{ 'B', 0 } },
                .type_info = .{ 0, 1, 2, 3, 4, 5, 6, 7, 8, 255 },
                .default_utf16 = &.{ 'C', 0 },
                .extra = &.{},
            };
            var row = try metadata(a, face, .hangul, 0, 4096);
            defer row.deinit(a);
            try std.testing.expectEqual(@as(u8, 255), row.substitute.?.kind);
            try std.testing.expectEqualStrings("B", row.substitute.?.name.?);
            try std.testing.expectEqualStrings("C", row.defaultName.?);
            for (face.type_info.?, row.typeInfo.?) |byte, value| try std.testing.expectEqual(@as(u16, byte), value);
            const json = try std.json.Stringify.valueAlloc(a, row, .{});
            defer a.free(json);
            try std.testing.expect(std.mem.indexOf(u8, json, "\"typeInfo\":[0,1,2,3,4,5,6,7,8,255]") != null);
            try std.testing.expectError(error.LimitExceeded, metadata(a, face, .hangul, 0, 0));
        }
    }.run, .{});
}

test "HWP5 font metadata preserves absent empty invalid and unknown kind values" {
    const a = std.testing.allocator;
    const face: info.FaceName = .{ .attributes = 0xa1, .name_utf16 = &.{}, .substitute = .{ .kind = 0, .name_utf16 = &.{ 0, 0xd8 } }, .type_info = null, .default_utf16 = &.{}, .extra = &.{} };
    var row = try metadata(a, face, .latin, 0, 4096);
    defer row.deinit(a);
    try std.testing.expect(row.substitute.?.name == null);
    try std.testing.expectEqual(@as(u8, 0), row.substitute.?.kind);
    try std.testing.expectEqualStrings("", row.defaultName.?);
    try std.testing.expect(row.typeInfo == null);
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
