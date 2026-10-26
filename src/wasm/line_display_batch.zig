//! Optional line batch envelope. Section is a separate ABI argument.
//! The caller owns decoded nodes and encoded JSON; no report/session is retained.
const std = @import("std");
const Reader = @import("../binary/reader.zig").Reader;
const Batch = @import("../hwpx/line_display_snapshots.zig");
const display = @import("hwpx_line_display_wire.zig");
pub const max_nodes = 1024;
pub const max_bytes = 4 + max_nodes * 4;

pub fn decode(a: std.mem.Allocator, bytes: []const u8) ![]usize {
    if (bytes.len > max_bytes) return error.LimitExceeded;
    var reader: Reader = .{ .bytes = bytes };
    const count = try reader.readInt(u32);
    if (count > max_nodes) return error.LimitExceeded;
    const payload = std.math.mul(usize, count, 4) catch return error.LimitExceeded;
    const size = std.math.add(usize, 4, payload) catch return error.LimitExceeded;
    if (bytes.len < size) return error.UnexpectedEnd;
    if (bytes.len != size) return error.InvalidLineDisplayBatch;
    const nodes = try a.alloc(usize, count);
    errdefer a.free(nodes);
    for (nodes) |*node| node.* = try reader.readInt(u32);
    return nodes;
}

const Json = struct {
    allocator: std.mem.Allocator,
    report: *const Batch.Report,

    fn write(self: Json, writer: *std.json.Stringify) !void {
        if (self.report.entries.len > max_nodes) return error.LimitExceeded;
        try writer.beginArray();
        for (self.report.entries) |entry| {
            try writer.beginObject();
            try writer.objectField("node");
            try writer.write(entry.node);
            switch (entry.result) {
                .value => |value| try self.writeValue(writer, value),
                .unavailable => |err| {
                    if (err == error.OutOfMemory) return err;
                    try writer.objectField("error");
                    try writer.write(@errorName(err));
                },
            }
            try writer.endObject();
        }
        try writer.endArray();
    }

    fn writeValue(self: Json, writer: anytype, value: Batch.Value) !void {
        try writer.objectField("geometry");
        // Exact single hwpx_edit_line_geometry wrapper, including paintable=false.
        try writer.write(.{ .current = true, .coordinateSpace = "renderingInfo", .paintable = false, .geometry = value.geometry });
        switch (value.paint) {
            .unavailable => |err| try displayError(writer, err),
            .value => |stroke| {
                const g = value.geometry;
                const bytes = display.encode(self.allocator, .{ .node = g.node, .paragraph = g.paragraph, .anchor_node = g.anchor_node, .anchor_unit = g.anchor_unit, .endpoints = g.endpoints, .stroke = stroke }) catch |err| {
                    try displayError(writer, err);
                    return;
                };
                // Release on success and writer failure; never retain bytes in Json.
                defer self.allocator.free(bytes);
                try writer.objectField("display");
                // []u8 normally stringifies as text; the ABI requires byte numbers.
                try writer.beginArray();
                for (bytes) |byte| try writer.write(byte);
                try writer.endArray();
            },
        }
    }
};

fn displayError(writer: anytype, err: anyerror) !void {
    if (err == error.OutOfMemory) return err;
    try writer.objectField("displayError");
    try writer.write(@errorName(err));
}

pub fn encode(a: std.mem.Allocator, report: *const Batch.Report) ![]u8 {
    // std.json custom callbacks only permit WriteFailed. Invoke our projection
    // directly so domain errors are preserved; only this allocating writer's
    // WriteFailed means OOM. All partial output is released before returning.
    var output: std.Io.Writer.Allocating = .init(a);
    defer output.deinit();
    var writer: std.json.Stringify = .{ .writer = &output.writer };
    (Json{ .allocator = a, .report = report }).write(&writer) catch |err| {
        if (err == error.WriteFailed) return error.OutOfMemory;
        return err;
    };
    return output.toOwnedSlice();
}
