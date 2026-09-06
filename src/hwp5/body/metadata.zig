const Header = @import("paragraph_header.zig").Header;
const Runs = @import("char_runs.zig").Runs;
const Segments = @import("line_segments.zig").Segments;
const Ranges = @import("range_tags.zig").Ranges;
const reference_rules = @import("../docinfo/reference_rules.zig");
/// Caller-supplied owning paragraph, not an implicit level-based association.
/// Bounds only: count itself is allowed as an endpoint; control-token boundaries
/// and range endpoint inclusion are not inferred. Success is not document validity.
pub const Metadata = struct {
    runs: ?Runs = null,
    lines: ?Segments = null,
    ranges: ?Ranges = null,
    pub fn validateCounts(self: Metadata, h: Header) !void {
        if ((if (self.runs) |r| r.count() else @as(usize, 0)) != h.char_shape_count or
            (if (self.lines) |r| r.count() else @as(usize, 0)) != h.line_segment_count or
            (if (self.ranges) |r| r.count() else @as(usize, 0)) != h.range_tag_count) return error.ParagraphMetadataCountMismatch;
    }
    pub fn validate(self: Metadata, h: Header, char_shape_count: usize) !void {
        try self.validateCounts(h);
        if (self.runs) |runs| {
            var previous: u32 = 0;
            for (0..runs.count()) |i| {
                const r = runs.get(i).?;
                if ((i == 0 and r.start != 0) or r.start < previous or r.start > h.characterUnits()) return error.InvalidCharRunPosition;
                if (reference_rules.resolve(.zero_based, r.char_shape_id, char_shape_count) == .invalid) return error.InvalidResourceReference;
                previous = r.start;
            }
        }
        if (self.lines) |lines| for (0..lines.count()) |i| {
            if (lines.get(i).?.start > h.characterUnits()) return error.InvalidLinePosition;
        };
        // Overlap, equal endpoints and arbitrary kind/data are preserved.
        if (self.ranges) |ranges| for (0..ranges.count()) |i| {
            const r = ranges.get(i).?;
            try r.validateBounds(h.characterUnits());
        };
    }
};
