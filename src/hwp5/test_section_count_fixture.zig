//! Synthetic CFB source shared by section-count preview/copy tests only.
const std = @import("std");
const fixture = @import("document/test_fixture.zig");

pub fn make(a: std.mem.Allocator, declared: u16, names: []const []const u8) ![]u8 {
    const header = fixture.header();
    const info = try fixture.docInfo(a, declared);
    defer a.free(info);
    const section = try fixture.section(a);
    defer a.free(section);
    return build(a, &header, info, section, names);
}

pub fn build(a: std.mem.Allocator, header: []const u8, info: []const u8, section: []const u8, names: []const []const u8) ![]u8 {
    const writer = @import("../cfb/writer.zig");
    var nodes: std.ArrayList(writer.Node) = .empty;
    defer nodes.deinit(a);
    try nodes.appendSlice(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = header },
        .{ .name = "DocInfo", .parent = 0, .content = info },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
    });
    for (names) |name| try nodes.append(a, .{ .name = name, .parent = 3, .content = section });
    try nodes.append(a, .{ .name = "Opaque", .parent = 0, .content = &.{ 0, 255, 0, 127 } });
    return writer.write(a, nodes.items, .{});
}
