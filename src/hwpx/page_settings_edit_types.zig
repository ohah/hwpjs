//! Full explicit writer values. Query absence is never replaced by an implicit default.
const std = @import("std");
const geometry = @import("page_geometry.zig");
pub const Values = struct {
    orientation: geometry.Orientation,
    width: u32,
    height: u32,
    gutter_type: geometry.GutterType,
    margin: struct { header: u32, footer: u32, gutter: u32, left: u32, right: u32, top: u32, bottom: u32 },
};
pub const Target = struct {
    section: usize,
    owner_node: usize,
    page_node: usize,
    margin_node: ?usize,
    expected: geometry.Page,
};
pub const Owner = struct {
    section: usize,
    target: ?Target = null,
    reason: ?enum { MissingPageSettings, AmbiguousPageSettings, DuplicatePageMargin, UnsupportedPageSettingsOwner } = null,
};
pub const Binding = struct { session: []const u8, revision: u32, serial: []const u8 };
pub const Request = struct { binding: Binding, scope: enum { section, document }, targets: []const Target, values: Values };
pub fn validate(value: Values) !void {
    const w: u64 = if (value.orientation == .narrowly) value.height else value.width;
    const h: u64 = if (value.orientation == .narrowly) value.width else value.height;
    const m = value.margin;
    const horizontal = @as(u64, m.left) + m.right + if (value.gutter_type == .top_bottom) @as(u64, 0) else m.gutter;
    const vertical = @as(u64, m.top) + m.bottom + m.header + m.footer + if (value.gutter_type == .top_bottom) @as(u64, m.gutter) else 0;
    if (w == 0 or h == 0 or horizontal >= w or vertical >= h) return error.InvalidPageSettingsGeometry;
}
pub fn equals(page: geometry.Page, values: Values) bool {
    const m = page.margin orelse return false;
    const v = values.margin;
    return page.orientation == values.orientation and page.width == values.width and page.height == values.height and page.gutter_type == values.gutter_type and m.header == v.header and m.footer == v.footer and m.gutter == v.gutter and m.left == v.left and m.right == v.right and m.top == v.top and m.bottom == v.bottom;
}
