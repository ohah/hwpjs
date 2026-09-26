const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const fields = @import("shape_xml_fields.zig");

pub const Kind = enum { size, position, out_margin, caption, shape_comment, parameter_set, meta_tag, label };
pub const names = [_][]const u8{ "sz", "pos", "outMargin", "caption", "shapeComment", "parameterset", "metaTag", "label" };
pub const common_count = @intFromEnum(Kind.label);
pub const Profile = enum { common, table };

comptime {
    if (names.len != @typeInfo(Kind).@"enum".fields.len) @compileError("shape child/name mismatch");
}

pub fn kindOf(tree: *const tree_mod.Tree, index: usize, profile: Profile) ?Kind {
    for (names, 0..) |name, slot| {
        if (profile == .common and slot == @intFromEnum(Kind.label)) continue;
        if (tree.elements[index].is(document_xml.paragraph_uri, name)) return @enumFromInt(slot);
    }
    return null;
}

pub fn specs(kind: Kind) []const fields.Spec {
    return switch (kind) {
        .size => &fields.size_specs,
        .position => &fields.position_specs,
        .out_margin => &fields.margin_specs,
        .caption => &fields.caption_specs,
        .label => &fields.label_specs,
        .shape_comment, .parameter_set, .meta_tag => &.{},
    };
}
