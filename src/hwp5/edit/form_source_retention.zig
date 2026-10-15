//! Observed, validated form preservation; never changes the official code table.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const linked = @import("../body/form_links.zig");

const Bound = struct { offset: usize, payload: []const u8 };
pub const Report = struct {
    forms: []Bound,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.forms);
        self.* = undefined;
    }
    pub fn allows(self: Report, offset: usize, payload: []const u8) bool {
        var low: usize = 0;
        var high = self.forms.len;
        while (low < high) {
            const middle = low + (high - low) / 2;
            if (self.forms[middle].offset < offset) low = middle + 1 else high = middle;
        }
        return low < self.forms.len and self.forms[low].offset == offset and std.mem.eql(u8, self.forms[low].payload, payload);
    }
};

pub fn collect(a: std.mem.Allocator, source: []const u8, version: Version) !Report {
    var tree = try Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    var forms = try linked.collectObservedUnits(a, tree, .{});
    defer forms.deinit(a);
    if (forms.forms.forms.len != 0 and version.raw != 0x05000300 and version.raw != 0x05010001) return error.UnsupportedFormSourceVersion;
    const result = try a.alloc(Bound, forms.forms.forms.len);
    errdefer a.free(result);
    for (forms.forms.forms, 0..) |form, index| {
        if (form.other_direct_children != 0) return error.UnsupportedFormSourceChildren;
        if (form.envelope.kind() == .unknown) return error.UnsupportedFormSourceType;
        if (form.common.extra.len != 0 or form.envelope.extra.len != 0) return error.UnsupportedFormSourceExtension;
        const record = tree.nodes[form.control_node].record.framing;
        result[index] = .{ .offset = record.offset, .payload = record.payload };
    }
    return .{ .forms = result };
}
