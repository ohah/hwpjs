//! Stable-address synthetic Session/History owner for document-text contracts.
//! Native document defaults and creation APIs provide all IDs and resources.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
pub fn inputWithSection(a: std.mem.Allocator, xml: []const u8) ![]u8 {
    const bytes = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(bytes);
    var base = try editor.open(a, bytes, .{});
    defer base.deinit();
    const header = base.original_header orelse return error.MissingHeader;
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header.source);
}
pub const Fixture = struct {
    allocator: std.mem.Allocator,
    session: editor.Session,
    history: histories.History,
    table_identity: u64,
    pub fn create(a: std.mem.Allocator, columns: u32) !*Fixture {
        if (columns == 0 or columns > 8) return error.InvalidTableCell;
        const self = try a.create(Fixture);
        errdefer a.destroy(self);
        const bytes = try @import("../new_document/root.zig").hwpx(a);
        defer a.free(bytes);
        self.allocator = a;
        self.session = try editor.open(a, bytes, .{});
        errdefer self.session.deinit();
        try std.testing.expect(try self.session.splice(0, 1, 0, 0, "needle😀"));
        try std.testing.expect(try self.session.splitParagraph(0, 1, 6, 0));
        self.session.history_delta_managed = true;
        self.history = try histories.History.initV2(&self.session, .{ .max_entries = 16 });
        errdefer self.history.deinit();
        var ids = try @import("created_table_source_ids.zig").plan(&self.session, columns);
        defer ids.deinit(a);
        self.table_identity = ids.identity;
        var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(1, columns, 21600, 3600, 8), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 8);
        defer table.deinit(a);
        for (0..columns) |column| _ = try table.replaceText(a, 0, @intCast(column), "needle", 100);
        try std.testing.expect(try self.history.apply(&self.session, .{ .kind = .created_table_stage, .section = 0, .paragraph = 2, .start = 2, .deleted = 0, .inserted = "", .created_table = &table }));
        return self;
    }
    pub fn deinit(self: *Fixture) void {
        const a = self.allocator;
        self.history.deinit();
        self.session.deinit();
        a.destroy(self);
    }
};
