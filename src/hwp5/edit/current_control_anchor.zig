//! Resolves immutable source-link order against the current owned token sequence.
const std = @import("std");
const Link = @import("../body/control_links.zig").Link;
const Paragraph = @import("../../model/document.zig").Paragraph;

pub fn position(links: []const Link, index: usize, paragraph: Paragraph) !u32 {
    if (index >= links.len) return error.InvalidControlLinkIndex;
    const link = links[index];
    var ordinal: usize = 0;
    for (links[0..index]) |prior| {
        if (prior.paragraph_node == link.paragraph_node and prior.code == link.code and prior.id == link.id) ordinal += 1;
    }
    var matched: usize = 0;
    for (paragraph.tokens) |token| {
        if (token.kind != .control or token.raw.len != 16) continue;
        if (std.mem.readInt(u16, token.raw[0..2], .little) != link.code or std.mem.readInt(u32, token.raw[2..6], .little) != link.id) continue;
        if (matched == ordinal) return token.start_unit;
        matched += 1;
    }
    return error.MissingCurrentControlAnchor;
}
