//! 그림의 내장 이미지 원본 바이트를 조회합니다. 픽셀 유효성 검사는 별도입니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const links = @import("picture_image_links.zig");

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, picture: usize, max_bytes: usize) ![]u8 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    _ = try @import("picture_display_host.zig").sourceTemplate(&section.tree, picture);
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (trees, session.sections) |*tree, part| tree.* = part.tree;
    var report = try links.inspectSections(a, document.manifest, trees, .{ .max_sites = session.options.max_sites });
    defer report.deinit(a);
    var selected: ?usize = null;
    for (report.sites, 0..) |site, index| {
        if (site.section_ordinal != section_index or site.picture_element_index != picture) continue;
        if (selected != null) return error.AmbiguousPictureImage;
        selected = index;
    }
    const site = report.sites[selected orelse return error.MissingPictureImage];
    switch (site.target.state) {
        .embedded => {},
        .external => return error.ExternalPictureImage,
        .absent, .empty, .missing => return error.MissingPictureImage,
    }
    const item = document.manifest.items[site.target.item_index orelse return error.InvalidImageLinkReport];
    const entry_index = item.entry_index orelse return error.InvalidImageLinkReport;
    if (entry_index >= document.archive.entries.len) return error.InvalidImageLinkReport;
    const entry = document.archive.entries[entry_index];
    if (!std.mem.eql(u8, entry.name, item.href)) return error.InvalidImageLinkReport;
    return document.archive.decode(entry, max_bytes);
}

test "HWPX picture source bytes enforce limits and detached ownership" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const sites = try @import("picture_display_sites.zig").read(a, &session, 0);
    defer a.free(sites);
    const node = sites[0].picture_node;
    try std.testing.expectError(error.LimitExceeded, read(a, &session, 0, node, 0));
    const bytes = try read(a, &session, 0, node, 64 * 1024 * 1024);
    defer a.free(bytes);
    try std.testing.expect(bytes.len > 0);
    try std.testing.expectError(error.LimitExceeded, read(a, &session, 0, node, bytes.len - 1));
    const exact = try read(a, &session, 0, node, bytes.len);
    defer a.free(exact);
    try std.testing.expectEqualSlices(u8, bytes, exact);
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, session.sections.len, node, bytes.len));
    try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &session, 0, 0, bytes.len));
}
