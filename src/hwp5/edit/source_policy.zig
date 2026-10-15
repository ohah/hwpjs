//! Whole-section preservation policy for isolated plain-text edits.
//! Payload retention is not a claim that object layout is still current.
const std = @import("std");
const body = @import("../body/reader.zig");
const framing = @import("../record.zig");
const controls = @import("../body/control_rules.zig");

/// Routing only; does not grant source eligibility or editing permission.
pub fn hasNamedFields(source: []const u8) !bool {
    var found = false;
    var it = framing.Iterator.init(source, .{});
    while (try it.next()) |entry| {
        if (entry.tag == @intFromEnum(body.Tag.control_header)) {
            const id = (try body.ControlHeader.parse(entry.payload)).id;
            if (id == controls.id("%clk") or id == controls.id("%bmk") or id == controls.id("%xrf")) found = true;
        }
    }
    return found;
}

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

pub fn validate(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    _ = try inspect(a, source, version, false, false);
}

/// Formula-aware text/format callers and isolated body structure retain known fields.
pub fn hasFormulas(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !bool {
    return inspect(a, source, version, true, false);
}

/// Only for section transactions that separately validate mixed field bindings.
pub fn validateFieldTransaction(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    _ = try inspect(a, source, version, true, true);
}

fn inspect(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, allow_formulas: bool, allow_named_fields: bool) !bool {
    var formulas = false;
    var forms: ?@import("form_source_retention.zig").Report = null;
    defer if (forms) |*value| value.deinit(a);
    var tree: ?@import("../body/tree.zig").Tree = null;
    defer if (tree) |*value| value.deinit(a);
    var it = framing.Iterator.init(source, .{});
    while (try it.next()) |entry| {
        const tag = std.enums.fromInt(body.Tag, entry.tag) orelse {
            if (entry.tag == 87) {
                if (tree == null) tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
                var found = false;
                for (tree.?.nodes, 0..) |node, index| {
                    if (node.record.framing.offset != entry.offset) continue;
                    _ = try @import("control_data_policy.zig").validateRetainedNode(a, tree.?, index);
                    found = true;
                    break;
                }
                if (!found) return error.SourceBindingMismatch;
                continue;
            }
            if (objectRecord(entry.tag)) continue;
            return error.UnsupportedSectionRecord;
        };
        switch (tag) {
            .control_header => {
                const header = try body.ControlHeader.parse(entry.payload);
                if (header.id == controls.form_id) {
                    if (forms == null) forms = try @import("form_source_retention.zig").collect(a, source, version);
                    if (!forms.?.allows(entry.offset, entry.payload)) return error.SourceBindingMismatch;
                    continue;
                }
                const code = controls.expectedCode(header.id) orelse return error.UnsupportedSectionControl;
                // Cross-reference/custom fields can carry unresolved external
                // text positions. A local hyperlink alone is not that policy.
                if (header.id == controls.id("%fmu") and allow_formulas) {
                    formulas = true;
                } else if ((header.id == controls.id("%clk") or header.id == controls.id("%bmk")) and allow_named_fields) {
                    _ = try @import("../body/field_start.zig").Properties.parse(header.properties);
                } else if (header.id == controls.id("%xrf") and allow_named_fields) {
                    const properties = try @import("../body/field_start.zig").Properties.parse(header.properties);
                    const view = try @import("../body/cross_reference_command.zig").View.parse(properties.command);
                    if (!(try @import("../body/cross_reference_name_result.zig").supports(view))) return error.UnsupportedSectionControl;
                } else if (code == 3 and header.id != controls.id("%hlk")) return error.UnsupportedSectionControl;
            },
            .memo_list => return error.UnsupportedSectionStructure,
            else => {},
        }
    }
    return formulas;
}
