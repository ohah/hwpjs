//! Own generated-cell boundary. No original table/list address is accepted.
const std = @import("std");
const values = @import("../model/created_cell_properties_values.zig");
const Ticket = @import("../model/history_mutation_epoch.zig").Ticket;
pub const max_request_bytes = 16 * 1024;
const Witness = struct { document: []const u8, generation: []const u8, owner: []const u8, epoch: []const u8 };
const Wire = struct {
    section: u32,
    identity: []const u8,
    row: u32,
    column: u32,
    expected: values.Frame,
    witness: Witness,
    size: values.Size = .{},
    appearance: @import("../model/border_fill_patch.zig").Patch = .{},
};
fn decimal(text: []const u8) !u64 {
    if (text.len == 0 or text.len > 20 or (text.len > 1 and text[0] == '0')) return error.InvalidCreatedCellWitness;
    for (text) |c| if (c < '0' or c > '9') return error.InvalidCreatedCellWitness;
    return std.fmt.parseInt(u64, text, 10) catch error.InvalidCreatedCellWitness;
}
pub fn decode(a: std.mem.Allocator, bytes: []const u8) !values.Request {
    if (bytes.len > max_request_bytes) return error.LimitExceeded;
    var parsed = try std.json.parseFromSlice(Wire, a, bytes, .{});
    defer parsed.deinit();
    const w = parsed.value;
    const identity = try decimal(w.identity);
    if (identity == 0) return error.InvalidCreatedTableIdentity;
    return .{ .address = .{ .section = w.section, .identity = identity, .row = w.row, .column = w.column }, .expected_ticket = .{ .binding = .{ .document = try decimal(w.witness.document), .generation = try decimal(w.witness.generation), .owner = try decimal(w.witness.owner) }, .epoch = try decimal(w.witness.epoch) }, .expected = w.expected, .size = w.size, .appearance = w.appearance };
}
pub fn ticketJSON(a: std.mem.Allocator, ticket: Ticket) ![]u8 {
    const document = try std.fmt.allocPrint(a, "{d}", .{ticket.binding.document});
    defer a.free(document);
    const generation = try std.fmt.allocPrint(a, "{d}", .{ticket.binding.generation});
    defer a.free(generation);
    const owner = try std.fmt.allocPrint(a, "{d}", .{ticket.binding.owner});
    defer a.free(owner);
    const epoch = try std.fmt.allocPrint(a, "{d}", .{ticket.epoch});
    defer a.free(epoch);
    return std.json.Stringify.valueAlloc(a, Witness{ .document = document, .generation = generation, .owner = owner, .epoch = epoch }, .{});
}
