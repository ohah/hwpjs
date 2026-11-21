const std = @import("std");
pub const Prepared = struct {
    input: @import("literal_edit_resource.zig").Input,
    patch: @import("literal_edit_xml.zig").Prepared,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.patch.deinit(a);
        self.input.deinit();
        self.* = undefined;
    }
};
