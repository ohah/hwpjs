//! Exact owned values comparison; ArrayList capacity/backing slack are not document state.
const std = @import("std");
pub fn equal(comptime T: type, a: T, b: T) bool {
    switch (@typeInfo(T)) {
        .@"struct" => {
            // ArrayList owns only items; capacity bytes may be uninitialized.
            if (@hasField(T, "items") and @hasField(T, "capacity")) return equal(@TypeOf(a.items), a.items, b.items);
            inline for (@typeInfo(T).@"struct".field_names, @typeInfo(T).@"struct".field_types) |name, F| if (!equal(F, @field(a, name), @field(b, name))) return false;
            return true;
        },
        .pointer => |p| switch (p.size) {
            .slice => {
                if (a.len != b.len) return false;
                for (a, b) |x, y| if (!equal(p.child, x, y)) return false;
                return true;
            },
            .one => return equal(p.child, a.*, b.*),
            else => return a == b,
        },
        .optional => |o| {
            if (a) |v| return if (b) |w| equal(o.child, v, w) else false;
            return b == null;
        },
        .array => |v| {
            for (a, b) |x, y| if (!equal(v.child, x, y)) return false;
            return true;
        },
        .@"union" => |u| {
            if (u.tag_type == null) @compileError("untagged history value");
            if (@as(u.tag_type.?, a) != @as(u.tag_type.?, b)) return false;
            inline for (u.field_names, u.field_types) |name, F| if (@as(u.tag_type.?, a) == @field(u.tag_type.?, name)) return equal(F, @field(a, name), @field(b, name));
            unreachable;
        },
        .void => return true,
        else => return a == b,
    }
}
