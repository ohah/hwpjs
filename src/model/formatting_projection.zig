//! Fresh, temporary query projection. Native sessions remain the only document SSOT.
const std = @import("std");
const m = @import("formatting_patch.zig");
const obs = @import("formatting_observation.zig");
pub const V = std.json.Value;
pub const Observation = obs.Observation(V);
pub const Span = struct { start: u32, end: u32, resource: ?u32 };
pub const fields = [_][]const u8{
    "reset.style",
    "character.size",
    "character.bold",
    "character.italic",
    "character.textColor",
    "character.underline.kind",
    "character.underline.color",
    "character.strike.enabled",
    "character.strike.color",
    "character.shade",
    "character.outlineKind",
    "character.effects.relief",
    "character.effects.script",
    "character.fonts",
    "character.fontNames",
    "character.ratio",
    "character.charSpacing",
    "character.relativeSize",
    "character.offset",
    "character.shadow.kind",
    "character.shadow.offsetX",
    "character.shadow.offsetY",
    "character.shadow.color",
    "character.underline.style",
    "character.strike.style",
    "character.shadow",
    "character.border",
    "character.background",
    "paragraph.alignment",
    "paragraph.margins.left",
    "paragraph.margins.right",
    "paragraph.margins.indent",
    "paragraph.margins.before",
    "paragraph.margins.after",
    "character.fonts.hangul.id",
    "character.fonts.hangul.name",
    "character.fonts.latin.id",
    "character.fonts.latin.name",
    "character.fonts.hanja.id",
    "character.fonts.hanja.name",
    "character.fonts.japanese.id",
    "character.fonts.japanese.name",
    "character.fonts.other.id",
    "character.fonts.other.name",
    "character.fonts.symbol.id",
    "character.fonts.symbol.name",
    "character.fonts.user.id",
    "character.fonts.user.name",
    "paragraph.spacing.kind",
    "paragraph.spacing.value",
    "paragraph.grid",
    "paragraph.borderConnect",
    "paragraph.border",
    "paragraph.background",
};
pub fn known(value: V, writable: bool, reason: ?[]const u8, unit: ?[]const u8) Observation {
    return .{ .state = .known, .value = value, .writable = writable, .writeUnavailableReason = reason, .unit = unit };
}
pub fn replaceableUnknown(reason: []const u8, unit: ?[]const u8) Observation {
    return .{ .state = .unknown, .reason = reason, .writable = true, .writeUnavailableReason = null, .unit = unit };
}
pub fn unknown(reason: []const u8, write_reason: []const u8) Observation {
    return .{ .state = .unknown, .reason = reason, .writable = false, .writeUnavailableReason = write_reason };
}
pub fn unavailable(reason: []const u8) Observation {
    return .{ .state = .unavailable, .reason = reason, .writable = false, .writeUnavailableReason = reason };
}
pub fn integer(value: anytype) V {
    return .{ .integer = @intCast(value) };
}
pub fn boolean(value: bool) V {
    return .{ .bool = value };
}
pub fn text(a: std.mem.Allocator, value: []const u8) !V {
    return .{ .string = try a.dupe(u8, value) };
}
pub fn map(a: std.mem.Allocator) V {
    _ = a;
    return .{ .object = .empty };
}
pub fn put(a: std.mem.Allocator, parent: *V, key: []const u8, value: V) !void {
    try parent.object.put(a, key, value);
}
pub fn equal(left: V, right: V) bool {
    if (std.meta.activeTag(left) != std.meta.activeTag(right)) return false;
    return switch (left) {
        .null => true,
        .bool => |v| v == right.bool,
        .integer => |v| v == right.integer,
        .float => |v| v == right.float,
        .number_string => |v| std.mem.eql(u8, v, right.number_string),
        .string => |v| std.mem.eql(u8, v, right.string),
        .array => |values| blk: {
            if (values.items.len != right.array.items.len) break :blk false;
            for (values.items, right.array.items) |one, two| if (!equal(one, two)) break :blk false;
            break :blk true;
        },
        .object => |values| blk: {
            if (values.count() != right.object.count()) break :blk false;
            var it = values.iterator();
            while (it.next()) |entry| if (!equal(entry.value_ptr.*, right.object.get(entry.key_ptr.*) orelse break :blk false)) break :blk false;
            break :blk true;
        },
    };
}
pub fn aggregate(values: []const Observation) !Observation {
    return obs.aggregate(V, values, equal);
}
/// Ranges and spans use the existing Native formatting axis. Never substitute
/// JS display offsets or XML byte offsets. Every requested unit must be covered.
pub fn character(a: std.mem.Allocator, backend: anytype, owner: m.Owner, ranges: []const m.Range, field: []const u8) !Observation {
    if (ranges.len == 0) return unavailable("CharacterRangeRequired");
    const spans = try backend.spans(a, owner);
    defer a.free(spans);
    var values: std.ArrayList(Observation) = .empty;
    defer values.deinit(a);
    for (ranges) |range| {
        try backend.validateRange(owner, range);
        var cursor = range.startUnit;
        for (spans) |span| {
            const low = @max(span.start, range.startUnit);
            const high = @min(span.end, range.endUnit);
            if (low >= high) continue;
            if (low != cursor) return unknown("IncompleteStyleCoverage", "UnprovenFormattingRange");
            cursor = high;
            const value = if (span.resource) |id| try backend.characterField(a, id, field) else unknown("MissingCharacterResource", "MissingSourceField");
            try values.append(a, value);
        }
        if (cursor != range.endUnit) return unknown("IncompleteStyleCoverage", "UnprovenFormattingRange");
    }
    if (values.items.len == 0) return unknown("MissingCharacterResource", "MissingSourceField");
    return aggregate(values.items);
}
pub fn observe(a: std.mem.Allocator, backend: anytype, owner: m.Owner, ranges: []const m.Range, field: []const u8) !Observation {
    var value = if (std.mem.startsWith(u8, field, "character."))
        try character(a, backend, owner, ranges, field)
    else
        try backend.paragraphField(a, owner, field);
    if (value.writable) {
        backend.authorize(owner, ranges, field) catch |err| {
            if (err == error.OutOfMemory) return err;
            value.writable = false;
            value.writeUnavailableReason = @errorName(err);
        };
    }
    try value.validate();
    return value;
}
/// Convert the same sparse patch to catalog keys used by query and preflight.
/// Grouped observations (fonts/shade/effects) are not a second mutation model.
pub fn requestedFields(a: std.mem.Allocator, patch: m.Patch) ![]const []const u8 {
    var output: std.ArrayList([]const u8) = .empty;
    errdefer output.deinit(a);
    const c = patch.character;
    if (patch.reset != null) try output.append(a, "reset.style");
    if (c.border_fill) |resource| {
        var border = false;
        for (resource.border.edges) |edge| if (edge) |v| {
            border = border or @import("border_fill_patch.zig").edgeHas(v);
        };
        if (border) try output.append(a, "character.border");
        if (resource.background != null) try output.append(a, "character.background");
    }
    {
        var border = false;
        for (patch.paragraph.border_fill.border.edges) |edge| if (edge) |v| {
            border = border or @import("border_fill_patch.zig").edgeHas(v);
        };
        if (border) try output.append(a, "paragraph.border");
        if (patch.paragraph.border_fill.background != null) try output.append(a, "paragraph.background");
    }

    inline for (.{ .{ "size", "size" }, .{ "bold", "bold" }, .{ "italic", "italic" }, .{ "text_color", "textColor" }, .{ "underline_kind", "underline.kind" }, .{ "underline_color", "underline.color" }, .{ "strike_enabled", "strike.enabled" }, .{ "strike_color", "strike.color" }, .{ "shade", "shade" }, .{ "outline_kind", "outlineKind" }, .{ "ratio", "ratio" }, .{ "char_spacing", "charSpacing" }, .{ "relative_size", "relativeSize" }, .{ "offset", "offset" }, .{ "underline_style", "underline.style" }, .{ "strike_style", "strike.style" } }) |pair| {
        if (@field(c, pair[0]) != null) try output.append(a, "character." ++ pair[1]);
    }
    if (c.shadow) |shadow| {
        inline for (.{ .{ "kind", "kind" }, .{ "offset_x", "offsetX" }, .{ "offset_y", "offsetY" }, .{ "color", "color" } }) |pair| if (@field(shadow, pair[0]) != null) try output.append(a, "character.shadow." ++ pair[1]);
    }
    if (patch.paragraph.flags.grid != null) try output.append(a, "paragraph.grid");
    if (patch.paragraph.flags.border_connect != null) try output.append(a, "paragraph.borderConnect");
    if (c.emboss != null or c.engrave != null) try output.append(a, "character.effects.relief");
    if (c.superscript != null or c.subscript != null) try output.append(a, "character.effects.script");
    inline for (.{ "hangul", "latin", "hanja", "japanese", "other", "symbol", "user" }, 0..) |language, index| {
        if (c.font_ids) |ids| if (ids[index] != null) try output.append(a, "character.fonts." ++ language ++ ".id");
        if (patch.fonts[index]) |font| switch (font) {
            .id => try output.append(a, "character.fonts." ++ language ++ ".id"),
            .name => try output.append(a, "character.fonts." ++ language ++ ".name"),
        };
    }
    if (patch.paragraph.alignment != null) try output.append(a, "paragraph.alignment");
    inline for (@import("../reflection.zig").fields(@import("document.zig").ParagraphMarginPatch)) |field| {
        if (@field(patch.paragraph.margins, field.name) != null) try output.append(a, "paragraph.margins." ++ field.name);
    }
    if (patch.paragraph.spacing != null) {
        try output.append(a, "paragraph.spacing.kind");
        try output.append(a, "paragraph.spacing.value");
    }
    return output.toOwnedSlice(a);
}
pub fn observationJson(a: std.mem.Allocator, value: Observation) !V {
    try value.validate();
    var output = map(a);
    try put(a, &output, "state", try text(a, @tagName(value.state)));
    try put(a, &output, "writable", boolean(value.writable));
    if (value.value) |v| try put(a, &output, "value", v);
    if (value.reason) |v| try put(a, &output, "reason", try text(a, v));
    if (value.writeUnavailableReason) |v| try put(a, &output, "writeUnavailableReason", try text(a, v));
    if (value.unit) |v| try put(a, &output, "unit", try text(a, v));
    return output;
}
