//! Exact JSON kinds before typed parsing; optional does not mean nullable.
const std = @import("std");
const Value = std.json.Value;
pub fn profile(value: Value) !void {
    if (value != .object) return error.InvalidChartCreateRequest;
    const kind = value.object.get("kind") orelse return error.InvalidChartCreateRequest;
    if (kind != .string) return error.InvalidChartCreateRequest;
    var it = value.object.iterator();
    while (it.next()) |entry| {
        const key = entry.key_ptr.*;
        if (std.mem.eql(u8, key, "wireframe")) {
            if (entry.value_ptr.* != .bool) return error.InvalidChartCreateRequest;
        } else {
            var known = false;
            inline for (.{ "kind", "bar_direction", "grouping", "scatter_style", "radar_style", "of_pie_type", "stock_layout" }) |allowed| {
                if (std.mem.eql(u8, key, allowed)) known = true;
            }
            if (!known or entry.value_ptr.* != .string) return error.InvalidChartCreateRequest;
        }
    }
}
pub fn series(value: Value, extended: bool) !void {
    if (value != .object) return error.InvalidChartCreateRequest;
    var it = value.object.iterator();
    while (it.next()) |entry| {
        const key = entry.key_ptr.*;
        const item = entry.value_ptr.*;
        if (std.mem.eql(u8, key, "name")) {
            if (item != .string) return error.InvalidChartCreateRequest;
        } else if (std.mem.eql(u8, key, "values") or (extended and (std.mem.eql(u8, key, "x_values") or std.mem.eql(u8, key, "bubble_sizes")))) {
            if (item != .array or item.array.items.len > @import("chart_create_data.zig").max_categories) return error.InvalidChartCreateRequest;
            for (item.array.items) |point| if (point != .string) return error.InvalidChartCreateRequest;
        } else if (extended and std.mem.eql(u8, key, "stock_role")) {
            if (item != .string) return error.InvalidChartCreateRequest;
        } else return error.InvalidChartCreateRequest;
    }
}
