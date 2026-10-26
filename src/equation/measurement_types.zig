const std = @import("std");
pub const Request = struct {
    node: usize,
    text: []const u8,
    source_start: usize,
    source_end: usize,
    size: f64,
    style: @import("font.zig").Style,
    role: enum { identifier, text, number, quoted, function, symbol },
};
pub const Blocker = struct {
    node: ?usize,
    source_start: ?usize = null,
    source_end: ?usize = null,
    command_family: ?@import("commands.zig").Family = null,
    kind: enum { unsupported_command, unresolved_identifier, multiline, unmatched_delimiter, unclosed_group, unresolved_context, radical_layout, compatibility_symbol, grid_layout, delimiter_layout },
};
pub const Plan = struct {
    allocator: std.mem.Allocator,
    size: f64,
    script_scale: f64,
    fraction_scale: f64,
    source: []u8,
    requests: []Request,
    blockers: []Blocker,
    allow_unclosed_groups: bool = false,
    recovered_open_groups: usize = 0,
    pub fn ready(self: *const Plan) bool {
        return self.blockers.len == 0;
    }
    pub fn deinit(self: *Plan) void {
        self.allocator.free(self.requests);
        self.allocator.free(self.blockers);
        self.allocator.free(self.source);
        self.* = undefined;
    }
};
