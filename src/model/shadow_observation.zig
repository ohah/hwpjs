//! shadow의 typed read만 소유합니다. 원본 값 부재를0/none으로 만들지 않습니다.
const std = @import("std");
const p = @import("formatting_projection.zig");
pub const Value = struct { kind: ?@import("character_shadow.zig").Kind = null, x: ?i32 = null, y: ?i32 = null, color: ?u32 = null, present: bool = true, @"opaque": bool = false };
pub fn field(a: std.mem.Allocator, value: Value, name: []const u8) !p.Observation {
    if (!value.present) return p.unknown("MissingShadow", "MissingSourceField");
    if (value.@"opaque" or value.kind == null) return p.unknown("UnsupportedCharacterShadowSource", "UnsupportedCharacterShadowSource");
    if (std.mem.eql(u8, name, "character.shadow.kind")) return p.known(try p.text(a, @tagName(value.kind.?)), true, null, null);
    if (std.mem.eql(u8, name, "character.shadow.offsetX")) return if (value.x) |v| p.known(p.integer(v), true, null, "percent") else p.replaceableUnknown("MissingShadowOffsetX", "percent");
    if (std.mem.eql(u8, name, "character.shadow.offsetY")) return if (value.y) |v| p.known(p.integer(v), true, null, "percent") else p.replaceableUnknown("MissingShadowOffsetY", "percent");
    if (std.mem.eql(u8, name, "character.shadow.color")) return if (value.color) |v| p.known(p.integer(v), true, null, "RGB24") else p.replaceableUnknown("UnknownOrMissingShadowColor", "RGB24");
    if (!std.mem.eql(u8, name, "character.shadow")) return error.UnknownFormattingField;
    if (value.x == null or value.y == null or value.color == null) return p.replaceableUnknown("IncompleteShadowObservation", null);
    var result = p.map(a);
    try p.put(a, &result, "kind", try p.text(a, @tagName(value.kind.?)));
    try p.put(a, &result, "offsetX", p.integer(value.x.?));
    try p.put(a, &result, "offsetY", p.integer(value.y.?));
    try p.put(a, &result, "color", p.integer(value.color.?));
    return p.known(result, true, null, null);
}
