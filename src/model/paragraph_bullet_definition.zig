//! Shared typed resource DTOs and scalar policy; no format ownership or I/O.
const std = @import("std");
pub const Definition = struct {
    marker: u32,
    alignment: enum { LEFT, CENTER, RIGHT },
    useInstanceWidth: bool,
    autoIndent: bool,
    widthAdjust: i32,
    textOffsetType: enum { PERCENT, HWPUNIT },
    textOffset: i32,
    charShapeId: u32,
};
pub const Request = struct {
    mode: enum { create, update },
    id: ?u32 = null,
    definition: Definition,
    apply: bool = false,
    section: usize = 0,
    paragraph: usize = 0,
};
pub fn validate(d: Definition) !void {
    if (d.marker <= 0x20 or d.marker > 0x10ffff or (d.marker >= 0x7f and d.marker <= 0x9f) or (d.marker >= 0xd800 and d.marker <= 0xdfff) or d.marker == 0xfffe or d.marker == 0xffff) return error.InvalidBulletMarker;
    // Explicit writer policy, kept inside the bounded renderer's useful range.
    if (d.widthAdjust < -1000000 or d.widthAdjust > 1000000 or d.textOffset < -1000000 or d.textOffset > 1000000) return error.InvalidBulletGeometry;
}
pub const Reason = enum { InvalidBulletId, DuplicateBulletId, UnsupportedBulletDeclaration };
pub const Declaration = struct {
    ordinal: u32,
    id: ?u32,
    marker: ?u21,
    canApply: bool,
    reason: ?Reason,
    definition: ?Definition = null,
};
pub const Snapshot = struct {
    schemaVersion: u32 = 1,
    state: enum { available } = .available,
    scope: enum { @"current-header" } = .@"current-header",
    coverage: enum { complete } = .complete,
    declarations: []Declaration,
    definitionWriter: enum { @"character-definitions-v1" } = .@"character-definitions-v1",
};

pub const ResourceIntent = struct { id: u16, created: bool, definition: Definition };
