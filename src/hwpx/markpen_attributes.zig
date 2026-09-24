const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");

/// Direct hp:t child census. Begin/end balance is deliberately not enforced.
pub const Report = struct {
    begins: usize = 0,
    color_present: usize = 0,
    color_valid: usize = 0,
    color_invalid: usize = 0,
    color_zero: usize = 0,
    color_rgb_sum: u64 = 0,
    begin_extra_attributes: usize = 0,
    ends: usize = 0,
    end_extra_attributes: usize = 0,

    pub fn counts(self: Report) [9]u64 {
        return .{
            self.begins,        self.color_present,          self.color_valid, self.color_invalid,        self.color_zero,
            self.color_rgb_sum, self.begin_extra_attributes, self.ends,        self.end_extra_attributes,
        };
    }
};

fn rgb(raw: []const u8) ?u32 {
    if (raw.len != 7 or raw[0] != '#') return null;
    for (raw[1..]) |byte| {
        if (!std.ascii.isHex(byte)) return null;
    }
    return std.fmt.parseInt(u32, raw[1..], 16) catch unreachable;
}

pub fn noteBegin(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, report: *Report) !void {
    const raw = try attrs.attribute(a, tag, scope, "color", max_attribute_bytes);
    defer if (raw) |value| a.free(value);
    report.begins += 1;
    if (raw) |value| {
        report.color_present += 1;
        if (rgb(value)) |color| {
            report.color_valid += 1;
            report.color_zero += @intFromBool(color == 0);
            report.color_rgb_sum = std.math.add(u64, report.color_rgb_sum, color) catch return error.LimitExceeded;
        } else report.color_invalid += 1;
    }
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try scope.expandAttribute(attribute.name);
        if (name.uri.len != 0 or !name.local.equals("color", false)) report.begin_extra_attributes += 1;
    }
}

pub fn noteEnd(tag: xml.tags.Tag, scope: *const xml.namespaces.State, report: *Report) !void {
    report.ends += 1;
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        _ = try scope.expandAttribute(attribute.name);
        report.end_extra_attributes += 1;
    }
}
