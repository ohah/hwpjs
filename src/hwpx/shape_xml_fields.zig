const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");
const values = @import("xml_values.zig");

pub const Kind = enum { unsigned, signed_or_unsigned, boolean, enumeration };
pub const Spec = struct {
    name: []const u8,
    kind: Kind,
    model_values: []const []const u8 = &.{},
    known_extensions: []const []const u8 = &.{},
};

pub const Counts = struct {
    absent: usize = 0,
    present: usize = 0,
    zero: usize = 0,
    negative: usize = 0,
    highbit: usize = 0,
    sum: i64 = 0,
    true_value: usize = 0,
    false_value: usize = 0,
    unknown_enum: usize = 0,
    extension_enum: usize = 0,
};

pub const table_specs = [_]Spec{
    .{ .name = "id", .kind = .unsigned },
    .{ .name = "zOrder", .kind = .signed_or_unsigned },
    .{ .name = "numberingType", .kind = .enumeration, .model_values = &.{ "NONE", "PICTURE", "TABLE", "EQUATION" } },
    .{ .name = "textWrap", .kind = .enumeration, .model_values = &.{ "SQUARE", "TOP_AND_BOTTOM", "BEHIND_TEXT", "IN_FRONT_OF_TEXT" }, .known_extensions = &.{ "TIGHT", "THROUGH" } },
    .{ .name = "textFlow", .kind = .enumeration, .model_values = &.{ "BOTH_SIDES", "LEFT_ONLY", "RIGHT_ONLY", "LARGEST_ONLY" } },
    .{ .name = "lock", .kind = .boolean },
    .{ .name = "dropcapstyle", .kind = .enumeration, .model_values = &.{ "None", "DoubleLine", "TripleLine", "Margin" } },
};

pub const size_specs = [_]Spec{
    .{ .name = "width", .kind = .unsigned },
    .{ .name = "widthRelTo", .kind = .enumeration, .model_values = &.{ "PAPER", "PAGE", "COLUMN", "PARA", "ABSOLUTE" } },
    .{ .name = "height", .kind = .unsigned },
    .{ .name = "heightRelTo", .kind = .enumeration, .model_values = &.{ "PAPER", "PAGE", "ABSOLUTE" } },
    .{ .name = "protect", .kind = .boolean },
};

pub const position_specs = [_]Spec{
    .{ .name = "treatAsChar", .kind = .boolean },
    .{ .name = "affectLSpacing", .kind = .boolean },
    .{ .name = "flowWithText", .kind = .boolean },
    .{ .name = "allowOverlap", .kind = .boolean },
    .{ .name = "holdAnchorAndSO", .kind = .boolean },
    .{ .name = "vertRelTo", .kind = .enumeration, .model_values = &.{ "PAPER", "PAGE", "PARA" } },
    .{ .name = "horzRelTo", .kind = .enumeration, .model_values = &.{ "PAPER", "PAGE", "COLUMN", "PARA" } },
    .{ .name = "vertAlign", .kind = .enumeration, .model_values = &.{ "TOP", "CENTER", "BOTTOM", "INSIDE", "OUTSIDE" } },
    .{ .name = "horzAlign", .kind = .enumeration, .model_values = &.{ "LEFT", "CENTER", "RIGHT", "INSIDE", "OUTSIDE" } },
    .{ .name = "vertOffset", .kind = .signed_or_unsigned },
    .{ .name = "horzOffset", .kind = .signed_or_unsigned },
};

pub const margin_specs = [_]Spec{
    .{ .name = table_xml.margin_names[0], .kind = .signed_or_unsigned },
    .{ .name = table_xml.margin_names[1], .kind = .signed_or_unsigned },
    .{ .name = table_xml.margin_names[2], .kind = .signed_or_unsigned },
    .{ .name = table_xml.margin_names[3], .kind = .signed_or_unsigned },
};

pub const caption_specs = [_]Spec{
    .{ .name = "side", .kind = .enumeration, .model_values = &.{ "LEFT", "RIGHT", "TOP", "BOTTOM" } },
    .{ .name = "fullSz", .kind = .boolean },
    .{ .name = "width", .kind = .signed_or_unsigned },
    .{ .name = "gap", .kind = .signed_or_unsigned },
    .{ .name = "lastWidth", .kind = .unsigned },
};

pub const label_specs = [_]Spec{
    .{ .name = "topmargin", .kind = .unsigned },
    .{ .name = "leftmargin", .kind = .unsigned },
    .{ .name = "boxwidth", .kind = .unsigned },
    .{ .name = "boxlength", .kind = .unsigned },
    .{ .name = "boxmarginhor", .kind = .unsigned },
    .{ .name = "boxmarginver", .kind = .unsigned },
    .{ .name = "labelcols", .kind = .unsigned },
    .{ .name = "labelrows", .kind = .unsigned },
    .{ .name = "landscape", .kind = .enumeration, .model_values = &.{ "WIDELY", "NARROWLY" } },
    .{ .name = "pagewidth", .kind = .unsigned },
    .{ .name = "pageheight", .kind = .unsigned },
};

fn contains(choices: []const []const u8, value: []const u8) bool {
    for (choices) |choice| if (std.mem.eql(u8, choice, value)) return true;
    return false;
}

/// Shared lexical rules for borrowed inspection and independently owned values.
pub fn observe(spec: Spec, raw: ?[]const u8, counts: *Counts) !void {
    const value = raw orelse {
        counts.absent += 1;
        return;
    };
    counts.present += 1;
    switch (spec.kind) {
        .unsigned, .signed_or_unsigned => {
            const numeric: i64 = if (spec.kind == .unsigned) try values.unsigned32(value) else try values.signedOrUnsigned32(value);
            counts.zero += @intFromBool(numeric == 0);
            counts.negative += @intFromBool(numeric < 0);
            counts.highbit += @intFromBool(numeric >= 0x80000000);
            counts.sum = std.math.add(i64, counts.sum, numeric) catch return error.LimitExceeded;
        },
        .boolean => {
            if (try values.boolean(value)) counts.true_value += 1 else counts.false_value += 1;
        },
        .enumeration => {
            if (contains(spec.model_values, value)) {
                // The public model recognizes this exact spelling.
            } else if (contains(spec.known_extensions, value)) {
                counts.extension_enum += 1;
            } else counts.unknown_enum += 1;
        },
    }
}

/// Values are observations. No schema-requiredness or object defaults are inferred.
pub fn inspect(comptime specs: []const Spec, a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_bytes: usize, counts: *[specs.len]Counts) !void {
    var names: [specs.len][]const u8 = undefined;
    inline for (specs, 0..) |spec, field| names[field] = spec.name;
    var raw: [specs.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &names, &raw);
    inline for (specs, 0..) |spec, field| {
        if (raw[field]) |present| {
            const decoded = try present.toUtf8(a, max_bytes);
            defer a.free(decoded);
            try observe(spec, decoded, &counts[field]);
        } else try observe(spec, null, &counts[field]);
    }
}
