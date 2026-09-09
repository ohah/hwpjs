const std = @import("std");
const structure = @import("structure.zig");
const markers = @import("markers.zig");
const frame_parser = @import("frame.zig");
const fields = @import("scan_fields.zig");
const State = @import("progressive.zig").State;
const Store = @import("table_store.zig").Store;
const scan_decoder = @import("progressive_scan.zig");
const storage = @import("coefficient_storage.zig");
const image = @import("progressive_image.zig");
const Snapshot = @import("quantization_snapshot.zig").Snapshot;
pub const Image = image.Image;
pub const Completion = image.Completion;
pub const Options = struct {
    completion: Completion,
    structure: structure.Options = .{},
    storage: storage.Options = .{},
    /// Total work over all scans, separate from persistent coefficient storage.
    max_block_visits: usize = 16000000,
};

/// Decode all received scans through EOI into owned coefficient grids. A
/// malformed scan/marker/history, budget violation or allocation failure frees
/// every grid and returns no partial image. Partial-band policy is explicit.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const boundaries = try structure.inspect(bytes, options.structure);
    var it = try markers.Iterator.init(bytes, options.structure.markers);
    var before_frame: Store = .{};
    var state: ?State = null;
    var result: ?Image = null;
    errdefer if (result) |*owned| owned.deinit(a);
    var interval: u16 = 0;
    while (try it.next()) |marker| {
        if (structure.isFrame(marker.code)) {
            const frame = try frame_parser.parse(marker.code, marker.payload, options.structure.frame);
            state = try State.init(frame, .{ .max_scans = options.structure.max_scans });
            state.?.tables = before_frame;
            result = try Image.init(a, frame, boundaries.effective_height, options.storage);
            continue;
        }
        switch (marker.code) {
            0xdb => if (state) |*s| try s.installQuantization(marker.payload, .{}) else try before_frame.installQuantization(marker.payload, .{}),
            0xc4 => if (state) |*s| try s.installHuffman(marker.payload, .{}) else try before_frame.installHuffman(marker.payload, .{}),
            0xdd => interval = try fields.restartInterval(marker.payload),
            0xda => {
                var pending = state orelse return error.MissingJpegFrame;
                const resolved = try pending.accept(marker.payload);
                const owned = &result.?;
                const start = it.reader.offset;
                var scan = try scan_decoder.Decoder.init(pending.frame, marker.payload, &pending.tables, boundaries.effective_height, interval, bytes[start..], .{ .max_bytes = options.structure.markers.max_bytes, .max_blocks = options.max_block_visits - owned.block_visits, .max_restarts = options.structure.max_restarts - owned.restarts });
                while (scan.position()) |position| {
                    const prior = owned.planes[position.frame_component].grid.at(position.x, position.y) orelse return error.InvalidJpegBlockPosition;
                    const block = (try scan.next(prior.*)).?;
                    prior.* = block.values;
                    owned.block_visits += 1;
                }
                if (try scan.next(@splat(0)) != null) return error.UnfinishedJpegScan;
                it.reader.offset = start + scan.reader.offset;
                owned.restarts += scan.restarts.count;
                for (resolved.components[0..resolved.count]) |c| for (owned.planes) |*plane| {
                    if (plane.component.id == c.id) plane.quantization = Snapshot.from(c.quantization.?);
                };
                state = pending;
            },
            0xd9 => {
                const s = state orelse return error.MissingJpegFrame;
                const owned = &result.?;
                for (owned.planes, 0..) |*plane, i| plane.levels = s.history.levels[i];
                owned.progression = s.report();
                owned.trailing_bytes = boundaries.trailing_bytes;
                try owned.checkCompletion(options.completion);
                return owned.*;
            },
            // The complete structural pass owns marker ordering and DNL.
            // APP/COM metadata and colour interpretation are still separate.
            else => {},
        }
    }
    return error.MissingJpegEoi;
}
