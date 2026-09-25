const std = @import("std");
const values = @import("xml_values.zig");

pub const Field = enum(u8) { effect, sound_id_ref, invert_text, autoshow, showtime, applyto };
pub const field_names = [_][]const u8{ "effect", "soundIDRef", "invertText", "autoshow", "showtime", "applyto" };
comptime {
    if (field_names.len != @typeInfo(Field).@"enum".fields.len) @compileError("presentation field/name mismatch");
}

const effects = [_][]const u8{
    "none",         "overLeft",   "overRight", "overUp",    "overDown",      "rectOut",      "rectIn",
    "blindLeft",    "blindRight", "blindUp",   "blindDown", "cuttonHorzOut", "cuttonHorzIn", "cuttonVertOut",
    "cuttonVertIn", "moveLeft",   "moveRight", "moveUp",    "moveDown",      "random",
};

fn known(raw: []const u8, allowed: []const []const u8) bool {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    for (allowed) |candidate| if (std.mem.eql(u8, value, candidate)) return true;
    return false;
}

/// Returns true only for an unfamiliar enum spelling; its raw value is kept.
pub fn validate(field: Field, raw: []const u8) !bool {
    switch (field) {
        .effect => return !known(raw, &effects),
        .sound_id_ref => return false,
        .invert_text, .autoshow => {
            _ = try values.boolean(raw);
            return false;
        },
        .showtime => {
            _ = try values.unsigned32(raw);
            return false;
        },
        .applyto => return !known(raw, &.{ "WholeDoc", "NewSection" }),
    }
}
