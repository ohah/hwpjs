//! Strict JSON -> sparse Native intent. Owns only request-lifetime allocations.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const V = std.json.Value;
pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    value: m.Apply,
    pub fn deinit(self: *Request) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    if (bytes.len > m.limits.request_bytes) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const aa = arena.allocator();
    const root = try std.json.parseFromSliceLeaky(V, aa, bytes, .{ .allocate = .alloc_always, .duplicate_field_behavior = .@"error" });
    try keys(root, &.{ "schemaVersion", "binding", "targets", "patch" });
    if (try uint(try required(root, "schemaVersion"), 1) != 1) return error.InvalidFormattingSchema;
    const binding = try decodeBinding(try required(root, "binding"), false);
    const items = try array(try required(root, "targets"));
    if (items.len == 0 or items.len > m.limits.targets) return error.LimitExceeded;
    const targets = try aa.alloc(m.Target, items.len);
    const patch = try decodePatch(try required(root, "patch"));
    var total_ranges: usize = 0;
    for (items, 0..) |item, index| {
        try keys(item, &.{ "ref", "ranges" });
        const ref = try opaqueToken(try required(item, "ref"));
        const ranges = if (get(item, "ranges")) |value| try decodeTargetRanges(aa, value, patch) else &.{};
        total_ranges = try std.math.add(usize, total_ranges, ranges.len);
        if (total_ranges > m.limits.ranges) return error.LimitExceeded;
        targets[index] = .{ .ref = ref, .ranges = ranges };
    }
    try m.requireDistinctTargets(aa, targets);
    if (patch.hasCharacter()) for (targets) |target| if (target.ranges.len == 0) return error.EmptyCharacterSelection;
    return .{ .arena = arena, .value = .{ .binding = binding, .targets = targets, .patch = patch } };
}
pub fn decodeBinding(value: V, nullable: bool) !m.Binding {
    try keys(value, &.{ "session", "revision" });
    const revision = try required(value, "revision");
    if (!nullable and revision == .null) return error.InvalidFormattingBinding;
    return .{ .session = try opaqueToken(try required(value, "session")), .revision = if (nullable and revision == .null) null else @intCast(try uint(revision, 0xfffffffe)) };
}
// apply target의 빈 배열은 글자 intent만 거부합니다. 빈 patch는 생략과 같은 no-op입니다.
// query 공용 decodeRanges 계약은 변경하지 않습니다.
fn decodeTargetRanges(a: std.mem.Allocator, value: V, patch: m.Patch) ![]const m.Range {
    if ((try array(value)).len == 0) {
        if (patch.hasCharacter()) return error.EmptyCharacterSelection;
        return &.{};
    }
    return decodeRanges(a, value);
}
pub fn decodeRanges(a: std.mem.Allocator, value: V) ![]const m.Range {
    const items = try array(value);
    if (items.len == 0 or items.len > m.limits.ranges) return error.LimitExceeded;
    const ranges = try a.alloc(m.Range, items.len);
    var previous: u32 = 0;
    for (items, 0..) |item, i| {
        try keys(item, &.{ "startUnit", "endUnit" });
        const start: u32 = @intCast(try uint(try required(item, "startUnit"), 0xffffffff));
        const end: u32 = @intCast(try uint(try required(item, "endUnit"), 0xffffffff));
        if (start >= end or (i != 0 and start < previous)) return error.InvalidTextPosition;
        ranges[i] = .{ .startUnit = start, .endUnit = end };
        previous = end;
    }
    return ranges;
}
fn decodePatch(root: V) !m.Patch {
    try keys(root, &.{ "character", "paragraph", "reset" });
    var result: m.Patch = .{};
    if (get(root, "character")) |c| {
        const resource = try @import("formatting_resource_request.zig").decode(c);
        if (@import("../model/border_fill_patch.zig").has(resource)) result.character.border_fill = resource;
        try keys(c, &.{ "size", "bold", "italic", "underline", "strike", "textColor", "shade", "outlineKind", "effects", "fonts", "ratio", "charSpacing", "relativeSize", "offset", "shadow", "border", "background" });
        inline for (.{ .{ "ratio", "ratio" }, .{ "charSpacing", "char_spacing" }, .{ "relativeSize", "relative_size" }, .{ "offset", "offset" } }) |pair| {
            if (get(c, pair[0])) |v| {
                try keys(v, &@import("../model/formatting_source_values.zig").languages);
                var values: @import("../model/character_metric_patch.zig").Values = @splat(null);
                var present = false;
                for (@import("../model/formatting_source_values.zig").languages, 0..) |language, index| if (get(v, language)) |number| {
                    values[index] = try int(number);
                    present = true;
                };
                if (present) @field(result.character, pair[1]) = values;
            }
        }
        if (get(c, "size")) |v| result.character.size = @intCast(try uint(v, 409600));
        if (get(c, "bold")) |v| result.character.bold = try boolean(v);
        if (get(c, "italic")) |v| result.character.italic = try boolean(v);
        if (get(c, "textColor")) |v| result.character.text_color = @intCast(try uint(v, 0xffffff));
        if (get(c, "underline")) |u| {
            try keys(u, &.{ "kind", "color", "style" });
            if (get(u, "style")) |v| result.character.underline_style = try enumeration(@import("../model/character_line_style.zig").Kind, v);
            if (get(u, "kind")) |v| result.character.underline_kind = try enumeration(@import("../model/document.zig").CharacterUnderlineKind, v);
            if (get(u, "color")) |v| result.character.underline_color = @intCast(try uint(v, 0xffffff));
        }
        if (get(c, "strike")) |u| {
            try keys(u, &.{ "enabled", "color", "style" });
            if (get(u, "style")) |v| result.character.strike_style = try enumeration(@import("../model/character_line_style.zig").Kind, v);
            if (get(u, "enabled")) |v| result.character.strike_enabled = try boolean(v);
            if (get(u, "color")) |v| result.character.strike_color = @intCast(try uint(v, 0xffffff));
        }
        if (get(c, "shadow")) |u| {
            try keys(u, &.{ "kind", "offsetX", "offsetY", "color" });
            var shadow: @import("../model/character_shadow.zig").Patch = .{};
            if (get(u, "kind")) |v| shadow.kind = try enumeration(@import("../model/character_shadow.zig").Kind, v);
            if (get(u, "offsetX")) |v| shadow.offset_x = try int(v);
            if (get(u, "offsetY")) |v| shadow.offset_y = try int(v);
            if (get(u, "color")) |v| shadow.color = @intCast(try uint(v, 0xffffff));
            try @import("../model/character_shadow.zig").validate(shadow);
            if (@import("../model/character_shadow.zig").has(shadow)) result.character.shadow = shadow;
        }
        if (get(c, "shade")) |u| {
            try keys(u, &.{ "kind", "color" });
            const kind = try string(try required(u, "kind"));
            if (std.mem.eql(u8, kind, "none")) {
                if (get(u, "color") != null) return error.InvalidFormattingIntent;
                result.character.shade = .none;
            } else if (std.mem.eql(u8, kind, "color")) {
                result.character.shade = .{ .color = @intCast(try uint(try required(u, "color"), 0xffffff)) };
            } else return error.InvalidFormattingIntent;
        }
        if (get(c, "outlineKind")) |v| result.character.outline_kind = try enumeration(@import("../model/character_outline_kind.zig").Kind, v);
        if (get(c, "effects")) |e| {
            try keys(e, &.{ "relief", "script" });
            if (get(e, "relief")) |v| {
                const kind = try enumeration(enum { none, emboss, engrave }, v);
                result.character.emboss = kind == .emboss;
                result.character.engrave = kind == .engrave;
            }
            if (get(e, "script")) |v| {
                const kind = try enumeration(enum { normal, superscript, subscript }, v);
                result.character.superscript = kind == .superscript;
                result.character.subscript = kind == .subscript;
            }
        }
        if (get(c, "fonts")) |fonts| {
            const languages = [_][]const u8{ "hangul", "latin", "hanja", "japanese", "other", "symbol", "user" };
            try keys(fonts, &languages);
            for (languages, 0..) |language, index| if (get(fonts, language)) |font| {
                try keys(font, &.{ "id", "name" });
                const id = get(font, "id");
                const name = get(font, "name");
                if ((id == null) == (name == null)) return error.InvalidFormattingIntent;
                if (id) |v| result.fonts[index] = .{ .id = @intCast(try uint(v, 0xffffffff)) };
                if (name) |v| {
                    const text = try string(v);
                    try @import("../model/font_name.zig").validate(text, m.limits.font_name_bytes);
                    result.fonts[index] = .{ .name = text };
                }
            };
        }
    }
    if (get(root, "paragraph")) |p| {
        result.paragraph.border_fill = try @import("formatting_resource_request.zig").decode(p);
        try keys(p, &.{ "alignment", "margins", "spacing", "grid", "borderConnect", "border", "background" });
        if (get(p, "grid")) |v| result.paragraph.flags.grid = try boolean(v);
        if (get(p, "borderConnect")) |v| result.paragraph.flags.border_connect = try boolean(v);
        if (get(p, "alignment")) |v| result.paragraph.alignment = try enumeration(m.Alignment, v);
        if (get(p, "margins")) |margins| {
            try keys(margins, &.{ "left", "right", "indent", "before", "after" });
            inline for (@import("../reflection.zig").fields(@import("../model/document.zig").ParagraphMarginPatch)) |field| {
                if (get(margins, field.name)) |v| @field(result.paragraph.margins, field.name) = try int(v);
            }
        }
        if (get(p, "spacing")) |spacing| {
            try keys(spacing, &.{ "kind", "value" });
            const kind = try enumeration(enum(u32) { percent, fixed, between, at_least }, try required(spacing, "kind"));
            const value = try int(try required(spacing, "value"));
            if (kind == .percent and (value < 0 or value > 500)) return error.InvalidParagraphSpacing;
            result.paragraph.spacing = .{ .kind = @backingInt(kind), .value = value };
        }
    }
    if (get(root, "reset")) |reset| {
        try keys(reset, &.{ "basis", "scope" });
        if (!std.mem.eql(u8, try string(try required(reset, "basis")), "paragraph-style")) return error.UnsupportedFormattingReset;
        if (result.hasCharacter() or result.hasParagraph()) return error.ConflictingFormattingReset;
        result.reset = try enumeration(m.ResetScope, try required(reset, "scope"));
    }
    try @import("../model/character_properties.zig").validate(result.character);
    return result;
}
pub fn keys(value: V, allowed: []const []const u8) !void {
    if (value != .object) return error.InvalidFormattingObject;
    var iterator = value.object.iterator();
    while (iterator.next()) |entry| {
        var found = false;
        for (allowed) |key| if (std.mem.eql(u8, key, entry.key_ptr.*)) {
            found = true;
            break;
        };
        if (!found) return error.UnknownFormattingField;
    }
}
pub fn get(value: V, key: []const u8) ?V {
    return if (value == .object) value.object.get(key) else null;
}
pub fn required(value: V, key: []const u8) !V {
    return get(value, key) orelse error.MissingFormattingField;
}
pub fn string(value: V) ![]const u8 {
    return if (value == .string) value.string else error.InvalidFormattingType;
}
pub fn array(value: V) ![]V {
    return if (value == .array) value.array.items else error.InvalidFormattingType;
}
fn boolean(value: V) !bool {
    return if (value == .bool) value.bool else error.InvalidFormattingType;
}
pub fn uint(value: V, maximum: u64) !u64 {
    if (value != .integer or value.integer < 0) return error.InvalidFormattingInteger;
    const number: u64 = @intCast(value.integer);
    if (number > maximum) return error.InvalidFormattingInteger;
    return number;
}
fn int(value: V) !i32 {
    if (value != .integer or value.integer < std.math.minInt(i32) or value.integer > std.math.maxInt(i32)) return error.InvalidFormattingInteger;
    return @intCast(value.integer);
}
pub fn opaqueToken(value: V) ![]const u8 {
    const text = try string(value);
    if (text.len == 0 or text.len > 256) return error.InvalidFormattingBinding;
    for (text) |c| if (!std.ascii.isAlphanumeric(c) and c != '.' and c != '_' and c != ':' and c != '-') return error.InvalidFormattingBinding;
    return text;
}
pub fn enumeration(comptime T: type, value: V) !T {
    return std.meta.stringToEnum(T, try string(value)) orelse error.InvalidFormattingEnum;
}

fn unsupported(value: V, names: []const []const u8) !void {
    for (names) |name| if (get(value, name) != null) return error.UnsupportedFormattingField;
}
