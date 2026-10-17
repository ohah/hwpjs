const std = @import("std");
const Source = @import("text_source.zig").Source;
const preview = @import("text_preview.zig");
const fixture = @import("document/test_fixture.zig");

const make = @import("test_section_count_fixture.zig").make;
const build = @import("test_section_count_fixture.zig").build;

test "available sections preview preserves metadata and strict editor refusal through every allocation failure" {
    const a = std.testing.allocator;
    const input = try make(a, 2, &.{"Section0"});
    defer a.free(input);
    const original = try a.dupe(u8, input);
    defer a.free(original);
    try std.testing.expectError(error.SectionCountMismatch, Source.openReadOnly(a, input));
    try std.testing.expectError(error.SectionCountMismatch, @import("edit/style_preservation.zig").Session.open(a, input));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(backing: std.mem.Allocator, bytes: []const u8) !void {
            const result = try preview.encodeAvailableDetailed(backing, bytes);
            defer backing.free(result.bytes);
            try std.testing.expect(!result.distribution);
            try std.testing.expectEqual(@as(u16, 2), result.declared_sections);
            try std.testing.expectEqualStrings("H5T1", result.bytes[0..4]);
            try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, result.bytes[8..12], .little));
        }
    }.run, .{input});
    try std.testing.expectEqualSlices(u8, original, input);
    try std.testing.expectError(error.SectionCountMismatch, preview.encodeDetailed(a, input));
}

test "available sections preview rejects holes malformed names zero declarations and empty bodies" {
    const a = std.testing.allocator;
    const cases = .{
        .{ @as(u16, 1), &[_][]const u8{ "Section0", "Section2" }, error.SectionCountMismatch },
        .{ @as(u16, 2), &[_][]const u8{"Section1"}, error.SectionCountMismatch },
        .{ @as(u16, 2), &[_][]const u8{"Section00"}, error.InvalidNumberedStreamName },
        .{ @as(u16, 2), &[_][]const u8{"Other"}, error.UnexpectedBodyStream },
        .{ @as(u16, 2), &[_][]const u8{"Section1024"}, error.InvalidSectionCount },
        .{ @as(u16, 0), &[_][]const u8{"Section0"}, error.InvalidSectionCount },
        .{ @as(u16, 1025), &[_][]const u8{"Section0"}, error.InvalidSectionCount },
        .{ @as(u16, 2), &[_][]const u8{}, error.SectionCountMismatch },
    };
    inline for (cases) |case| {
        const bytes = try make(a, case[0], case[1]);
        defer a.free(bytes);
        try std.testing.expectError(case[2], preview.encodeAvailableDetailed(a, bytes));
    }
    const matched = try make(a, 1, &.{"Section0"});
    defer a.free(matched);
    const strict = try preview.encodeDetailed(a, matched);
    defer a.free(strict.bytes);
    const available = try preview.encodeAvailableDetailed(a, matched);
    defer a.free(available.bytes);
    try std.testing.expectEqualSlices(u8, strict.bytes, available.bytes);
    try std.testing.expectEqual(@as(u16, 1), available.declared_sections);
    for ([_]u16{ 1, 3 }) |declared| {
        const bytes = try make(a, declared, &.{ "Section0", "Section1" });
        defer a.free(bytes);
        try std.testing.expectError(error.SectionCountMismatch, preview.encodeDetailed(a, bytes));
        const result = try preview.encodeAvailableDetailed(a, bytes);
        defer a.free(result.bytes);
        try std.testing.expectEqual(declared, result.declared_sections);
        try std.testing.expectEqual(@as(u32, 2), std.mem.readInt(u32, result.bytes[8..12], .little));
    }
}

test "available sections preview retains distribution and encrypted source policies" {
    const a = std.testing.allocator;
    const distribution = try @import("container/distribution_test_fixture.zig").make(a, false, false);
    defer a.free(distribution);
    const strict = try preview.encodeDetailed(a, distribution);
    defer a.free(strict.bytes);
    const available = try preview.encodeAvailableDetailed(a, distribution);
    defer a.free(available.bytes);
    try std.testing.expect(available.distribution);
    try std.testing.expectEqual(@as(u16, 6), available.declared_sections);
    try std.testing.expectEqualSlices(u8, strict.bytes, available.bytes);
    var header = fixture.header();
    fixture.put(&header, 36, u32, 2);
    const info = try fixture.docInfo(a, 2);
    defer a.free(info);
    const section = try fixture.section(a);
    defer a.free(section);
    const encrypted = try build(a, &header, info, section, &.{"Section0"});
    defer a.free(encrypted);
    try std.testing.expectError(error.UnsupportedEncryption, preview.encodeAvailableDetailed(a, encrypted));
}
