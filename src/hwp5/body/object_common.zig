const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
const rules = @import("control_rules.zig");

pub const PageBreakPolicy = enum { required, observed_absent };

/// Only the observed drawing-control variant may omit the final field.
pub fn parseControl(header: @import("control_header.zig").Header) !Properties {
    return Properties.parseWithPolicy(header.properties, if (header.id == rules.drawing_id) .observed_absent else .required);
}

/// Table 70: width reference4 and height reference2 encode absolute dimensions.
pub fn hasAbsoluteDimensions(flags: u32) bool {
    return (flags >> 15) & 7 == 4 and (flags >> 18) & 3 == 2;
}

test "HWP5 object absolute dimensions share one flag policy and ignore unrelated bits" {
    const std = @import("std");
    const mask: u32 = (7 << 15) | (3 << 18);
    for (0..8) |width| for (0..4) |height| {
        const flags = @as(u32, @intCast(width)) << 15 | @as(u32, @intCast(height)) << 18;
        try std.testing.expectEqual(width == 4 and height == 2, hasAbsoluteDimensions(flags));
        try std.testing.expectEqual(width == 4 and height == 2, hasAbsoluteDimensions(flags | ~mask));
    };
}

pub fn supports(control_id: u32) bool {
    return control_id == rules.table_id or control_id == rules.drawing_id or control_id == rules.equation_id;
}

/// Table 69, excluding the control ID. All slices borrow the input.
/// Description absence is observed in 5.0.1.7; no unproven version cutoff.
pub const Properties = struct {
    flags: u32,
    offset_y: i32,
    offset_x: i32,
    size_offset: usize,
    width: u32,
    height: u32,
    z_order: i32,
    margins: [4]i16,
    instance_id: u32,
    prevent_page_break: i32,
    prevent_page_break_present: bool = true,
    description_utf16: ?[]const u8,
    extra: []const u8,

    /// Table 70: bit20 applies only to paragraph-relative vertical placement.
    pub fn sizeProtected(self: Properties) bool {
        return ((self.flags >> 3) & 3) == 2 and self.flags & (@as(u32, 1) << 20) != 0;
    }

    pub fn parse(bytes: []const u8) !Properties {
        return parseWithPolicy(bytes, .required);
    }

    pub fn parseWithPolicy(bytes: []const u8, policy: PageBreakPolicy) !Properties {
        var r: Reader = .{ .bytes = bytes };
        var p: Properties = undefined;
        p.flags = try r.readInt(u32);
        p.offset_y = try r.readInt(i32);
        p.offset_x = try r.readInt(i32);
        p.size_offset = r.offset;
        p.width = try r.readInt(u32);
        p.height = try r.readInt(u32);
        p.z_order = try r.readInt(i32);
        for (&p.margins) |*m| m.* = try r.readInt(i16);
        p.instance_id = try r.readInt(u32);
        p.prevent_page_break_present = !(policy == .observed_absent and r.offset == bytes.len);
        p.prevent_page_break = if (p.prevent_page_break_present) try r.readInt(i32) else 0;
        p.description_utf16 = if (r.offset < bytes.len) try string.read(&r) else null;
        p.extra = bytes[r.offset..];
        return p;
    }
};
