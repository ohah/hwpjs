//! Scalar/control point checks for an ordered metadata inventory. The ordinary
//! single-boundary validator remains the semantic oracle; this cursor avoids
//! scanning all sites again for every retained field/page/title marker.
const std = @import("std");
const Sites = @import("text_sites.zig").Sites;
const Segment = @import("paragraph_text_positions.zig").Segment;
const Utf8Cursor = @import("../text/utf8_utf16_splice.zig").Cursor;
pub const Cursor = struct {
    sites: *const Sites,
    segments: []const Segment,
    index: usize = 0,
    text: ?Utf8Cursor = null,
    previous: usize = 0,
    total: usize,
    decoded_bytes: usize = 0,
    pub fn init(sites: *const Sites, segments: []const Segment) !Cursor {
        var unit: usize = 0;
        for (segments) |segment| {
            if (segment.start_unit != unit or segment.end_unit < unit) return error.InvalidTextSites;
            const length = segment.end_unit - unit;
            if (segment.kind == .text) {
                if (segment.index >= sites.items.len) return error.InvalidTextSites;
                if (try @import("../model/independent_text_edits.zig").utf16Units(sites.items[segment.index].text) != length) return error.InvalidTextSites;
            } else if (length != 1) return error.InvalidTextSites;
            unit = segment.end_unit;
        }
        return .{ .sites = sites, .segments = segments, .total = unit };
    }
    pub fn validate(self: *Cursor, point: usize) !void {
        if (point < self.previous or point > self.total or self.segments.len == 0) return error.InvalidTextPosition;
        while (self.index < self.segments.len and self.segments[self.index].end_unit < point) {
            self.index += 1;
            self.text = null;
        }
        if (self.index == self.segments.len) return error.InvalidTextPosition;
        const segment = self.segments[self.index];
        if (point < segment.start_unit) return error.InvalidTextPosition;
        if (segment.kind == .text) {
            if (self.text == null) self.text = .{ .text = self.sites.items[segment.index].text };
            const old_offset = self.text.?.offset;
            defer self.decoded_bytes += self.text.?.offset - old_offset;
            _ = try self.text.?.seek(std.math.cast(u32, point - segment.start_unit) orelse return error.LimitExceeded);
        }
        self.previous = point;
    }
};

test "document text HX ordered boundary cursor matches scalar oracle and avoids repeated scans" {
    const a = std.testing.allocator;
    const items = block: {
        const rows = try a.alloc(@import("text_sites.zig").Site, 2);
        errdefer a.free(rows);
        rows[0] = .{ .element_index = 0, .start = 0, .end = 1, .text = try a.dupe(u8, "한😀") };
        errdefer a.free(rows[0].text);
        rows[1] = .{ .element_index = 1, .start = 2, .end = 3, .text = try a.dupe(u8, "끝😀a") };
        break :block rows;
    };
    var sites: Sites = .{ .items = items };
    defer sites.deinit(a);
    const positions = [_]Segment{
        .{ .kind = .text, .index = 0, .source_start = 0, .start_unit = 0, .end_unit = 3 },
        .{ .kind = .anchor, .index = 50, .source_start = 1, .start_unit = 3, .end_unit = 4 },
        .{ .kind = .text, .index = 1, .source_start = 2, .start_unit = 4, .end_unit = 8 },
    };
    var cursor = try Cursor.init(&sites, &positions);
    for (0..9) |point| {
        if (@import("paragraph_text_positions.zig").validateBoundary(&sites, &positions, point)) |_| {
            try cursor.validate(point);
        } else |err| {
            try std.testing.expectError(err, cursor.validate(point));
        }
    }
    try std.testing.expect(cursor.decoded_bytes <= items[0].text.len + items[1].text.len);
    try std.testing.expectError(error.InvalidTextPosition, cursor.validate(0));
    try std.testing.expectError(error.InvalidTextPosition, cursor.validate(0xfffffffe));
    var gap = positions;
    gap[2].start_unit = 5;
    try std.testing.expectError(error.InvalidTextSites, Cursor.init(&sites, &gap));
}
