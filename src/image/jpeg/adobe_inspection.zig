const std = @import("std");
const adobe = @import("adobe.zig");
const structure = @import("structure.zig");
const markers = @import("markers.zig");

pub const Options = struct {
    structure: structure.Options = .{},
    max_adobe_markers: usize = 256,
};
pub const Report = struct {
    structure: structure.Report,
    /// Owned descriptors in physical order; extension bytes borrow input.
    headers: []adobe.Header,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.headers);
        self.* = undefined;
    }
};

/// Preserve every matching marker; no last-wins or conflict resolution policy.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    var state: State = .{ .allocator = a, .maximum = options.max_adobe_markers };
    errdefer state.headers.deinit(a);
    const report = try structure.inspectWithContext(bytes, options.structure, &state, State.accept);
    return .{ .structure = report, .headers = try state.headers.toOwnedSlice(a) };
}

const State = struct {
    allocator: std.mem.Allocator,
    maximum: usize,
    headers: std.ArrayList(adobe.Header) = .empty,

    fn accept(self: *State, marker: markers.Marker) !void {
        if (marker.code != 0xee or !std.mem.startsWith(u8, marker.payload, "Adobe")) return;
        if (self.headers.items.len >= self.maximum) return error.LimitExceeded;
        const header = try adobe.Header.parse(marker.payload);
        try self.headers.append(self.allocator, header);
    }
};
