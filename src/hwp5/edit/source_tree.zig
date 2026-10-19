//! Typed current-source queries share the editor's observed table policy.
//! Strict document validation continues to use body.Tree.parse.
const std = @import("std");
const tree = @import("../body/tree.zig");

pub fn parse(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, options: @import("../record.zig").Options) !tree.Tree {
    return tree.Tree.parseWithTableZoneCountPolicy(a, bytes, version, options, .observed_absent);
}
