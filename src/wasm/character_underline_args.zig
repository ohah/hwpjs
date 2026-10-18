//! Explicit public semantic enum, not HWP5 raw bit interpretation.
const std = @import("std");
const Kind = @import("../model/document.zig").CharacterUnderlineKind;
pub fn decode(value: u32) !Kind {
    if (value >= @import("../reflection.zig").fields(Kind).len) return error.InvalidCharacterUnderlineKind;
    return @fromBackingInt(@intCast(value));
}
