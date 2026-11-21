//! Own new-document output only; two real sections, no fabricated Session state.
const std = @import("std");
fn replaceOnce(a: std.mem.Allocator, input: []const u8, from: []const u8, to: []const u8) ![]u8 {
    const at = std.mem.indexOf(u8, input, from) orelse return error.MissingOwnFixtureField;
    if (std.mem.indexOf(u8, input[at + from.len ..], from) != null) return error.DuplicateOwnFixtureField;
    return std.mem.concat(a, u8, &.{ input[0..at], to, input[at + from.len ..] });
}
pub fn create(a: std.mem.Allocator, comptime h5: bool) ![]u8 {
    const seed = if (h5) try @import("new_document/root.zig").hwp5(a) else try @import("new_document/root.zig").hwpx(a);
    defer a.free(seed);
    if (h5) {
        var source = try @import("hwp5/text_source.zig").Source.open(a, seed);
        defer source.deinit();
        const info = try source.decodeDocInfo(a, 1000000);
        defer a.free(info);
        const site = try @import("hwp5/docinfo/section_count.zig").locate(info, source.header.version());
        std.mem.writeInt(u16, info[site.payload_offset..][0..2], 2, .little);
        const section = try source.decodeSection(a, 0);
        defer a.free(section);
        return @import("cfb/writer.zig").write(a, &.{
            .{ .name = "Root Entry", .kind = 5 },                                             .{ .name = "FileHeader", .parent = 0, .content = &source.header.raw },
            .{ .name = "DocInfo", .parent = 0, .content = info },                             .{ .name = "BodyText", .parent = 0, .kind = 1 },
            .{ .name = "Section0", .parent = 3, .content = section },                         .{ .name = "Section1", .parent = 3, .content = section },
            .{ .name = "OwnOpaque", .parent = 0, .content = "projection fixture retention" },
        }, .{});
    }
    var session = try @import("hwpx/editor_session.zig").open(a, seed, .{});
    defer session.deinit();
    const header = try replaceOnce(a, (session.original_header orelse return error.MissingHeader).source, "secCnt=\"1\"", "secCnt=\"2\"");
    defer a.free(header);
    const second = try replaceOnce(a, session.sections[0].tree.source, "<hp:p id=\"0\"", "<hp:p id=\"100\"");
    defer a.free(second);
    const hpf = "<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>" ++
        "<p:item id='header' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<p:item id='s0' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<p:item id='s1' href='Contents/section1.xml' media-type='application/xml'/>" ++
        "</p:manifest><p:spine><p:itemref idref='header'/><p:itemref idref='s0'/><p:itemref idref='s1'/></p:spine></p:package>";
    var seed_document = try @import("hwpx/package.zig").inspectDocument(a, seed, .{});
    defer seed_document.deinit(a);
    const version_entry = seed_document.archive.find("version.xml") orelse return error.MissingOwnVersion;
    const version = try seed_document.archive.decode(version_entry, 1000000);
    defer a.free(version);
    const fixture = @import("hwpx/test_package_fixture.zig");
    const output = try fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("hwpx/package.zig").mime },
        .{ .name = "version.xml", .data = version },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = session.sections[0].tree.source },
        .{ .name = "Contents/section1.xml", .data = second },
        .{ .name = "OwnOpaque.bin", .data = "projection fixture retention" },
    });
    errdefer a.free(output);
    // Preserve exact own factory bytes; never synthesize identity or set verified.
    var packaged = try @import("hwpx/package.zig").inspectDocument(a, output, .{});
    defer packaged.deinit(a);
    const copied = try packaged.archive.decode(packaged.archive.find("version.xml") orelse return error.MissingOwnVersion, 1000000);
    defer a.free(copied);
    try std.testing.expectEqualSlices(u8, version, copied);
    const profile = try @import("hwpx/border_fill_profile.zig").read(a, output);
    try std.testing.expect(profile.verified);
    try std.testing.expectEqualStrings("hwpjs-authored-v1-rgb24", profile.id);
    return output;
}
