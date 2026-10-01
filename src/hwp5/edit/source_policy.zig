//! Whole-section preservation policy for isolated plain-text edits.
//! Payload retention is not a claim that object layout is still current.
const std = @import("std");
const body = @import("../body/reader.zig");
const framing = @import("../record.zig");
const controls = @import("../body/control_rules.zig");

fn objectRecord(tag: u10) bool {
    const preserved = [_]u10{
        @import("../body/shape_component.zig").tag,
        @import("../body/shape_line.zig").tag,
        @import("../body/shape_rectangle.zig").tag,
        @import("../body/shape_ellipse.zig").tag,
        @import("../body/shape_arc.zig").tag,
        @import("../body/shape_polygon.zig").tag,
        @import("../body/shape_curve.zig").tag,
        @import("../body/ole.zig").tag,
        @import("../body/shape_picture.zig").tag,
        @import("../body/equation.zig").tag,
        @import("../body/form_object.zig").tag,
        @import("../body/video_data.zig").tag,
    };
    for (preserved) |known| if (tag == known) return true;
    return false;
}

pub fn validate(source: []const u8) !void {
    var it = framing.Iterator.init(source, .{});
    while (try it.next()) |entry| {
        const tag = std.enums.fromInt(body.Tag, entry.tag) orelse {
            if (objectRecord(entry.tag)) continue;
            return error.UnsupportedSectionRecord;
        };
        switch (tag) {
            .control_header => {
                const header = try body.ControlHeader.parse(entry.payload);
                const code = controls.expectedCode(header.id) orelse return error.UnsupportedSectionControl;
                // Cross-reference/custom fields can carry unresolved external
                // text positions. A local hyperlink alone is not that policy.
                if (code == 3 and header.id != controls.id("%hlk")) return error.UnsupportedSectionControl;
            },
            .memo_list => return error.UnsupportedSectionStructure,
            else => {},
        }
    }
}
