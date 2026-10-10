//! 그림의 현재 위치와 미지원 상태를 호출자 소유 스칼라 목록으로 반환합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const host = @import("picture_display_host.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const State = enum { located, conditional, unsupported_anchor, missing_host, ambiguous_host };
pub const Site = struct {
    picture_node: usize,
    paragraph: ?usize = null,
    anchor_unit: ?usize = null,
    state: State,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Site {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var output: std.ArrayList(Site) = .empty;
    defer output.deinit(a);
    for (section.tree.elements, 0..) |element, node| {
        if (!element.is(uri, "pic")) continue;
        if (output.items.len >= session.options.max_sites) return error.LimitExceeded;
        const ordinal = host.currentOrdinal(&section.tree, current.paragraphs, section.first_paragraph, node) catch |err| {
            const state: State = switch (err) {
                error.UnsupportedPictureSwitchHost => .conditional,
                error.MissingPictureDisplayParagraph, error.MissingCurrentParagraphDisplayHost => .missing_host,
                error.AmbiguousParagraphDisplayHost => .ambiguous_host,
                else => return err,
            };
            try output.append(a, .{ .picture_node = node, .state = state });
            continue;
        };
        const unit = host.anchorUnit(a, &section.tree, &current.paragraphs[ordinal - section.first_paragraph], node) catch |err| switch (err) {
            error.UnsupportedPictureAnchor, error.UnsupportedJoinedParagraphLocations, error.UnsupportedInlineControl, error.UnsupportedTextPositionProjection, error.MissingTextSite => {
                try output.append(a, .{ .picture_node = node, .paragraph = ordinal, .state = .unsupported_anchor });
                continue;
            },
            else => return err,
        };
        try output.append(a, .{ .picture_node = node, .paragraph = ordinal, .anchor_unit = unit, .state = .located });
    }
    return output.toOwnedSlice(a);
}

test "HWPX picture display sites return detached current scalar locations" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    const sites = block: {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, session.sections.len));
        const limit = session.options.max_sites;
        session.options.max_sites = 10;
        try std.testing.expectError(error.LimitExceeded, read(a, &session, 0));
        session.options.max_sites = limit;
        break :block try read(a, &session, 0);
    };
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 11), sites.len);
    for (sites) |site| {
        try std.testing.expectEqual(State.located, site.state);
        try std.testing.expect(site.paragraph != null);
        try std.testing.expect(site.anchor_unit != null);
    }
}
