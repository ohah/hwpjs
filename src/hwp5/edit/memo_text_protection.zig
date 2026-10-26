//! Memo and field-disjoint body protection; never grants field-result editing.
const std = @import("std");
pub const Plan = struct { protected_paragraphs: []bool, retained_headers: usize };
pub fn read(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, current: @import("../../model/document.zig").Section) !Plan {
    try @import("source_policy.zig").validateMemoTransaction(a, source, version);
    const flows = try @import("paragraph_flow_snapshot.zig").read(a, source, version, current);
    defer a.free(flows);
    const bodies: []const u32 = @import("memo_body_retention.zig").nodes(a, source, version) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => &.{},
    };
    defer a.free(bodies);
    const protected = try a.alloc(bool, current.paragraphs.len);
    errdefer a.free(protected);
    @memset(protected, true);
    var markers: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer markers.deinit(a);
    var editable = false;
    for (flows) |flow| {
        const paragraph = current.paragraphs[flow.paragraph];
        const source_node = paragraph.source_node orelse paragraph.header_template;
        if ((flow.host == .body or flow.host == .table_cell) and source_node != null and
            std.mem.indexOfScalar(u32, bodies, source_node.?) != null)
        {
            protected[flow.paragraph] = false;
            editable = true;
        }
        const marker = flow.memo_node orelse continue;
        try markers.put(a, marker, {});
        // Resource resolution and the selected range remain command checks;
        // this snapshot only supplies extra source protection.
        _ = @import("plain_text_source.zig").validate(a, source, version, current.paragraphs[flow.paragraph], std.math.maxInt(usize)) catch |err| switch (err) {
            error.OutOfMemory => return err,
            else => continue,
        };
        protected[flow.paragraph] = false;
        editable = true;
    }
    if (!editable) return error.UnsupportedSectionControl;
    return .{ .protected_paragraphs = protected, .retained_headers = markers.count() };
}
