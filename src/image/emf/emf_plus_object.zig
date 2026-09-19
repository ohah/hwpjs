const std = @import("std");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const ObjectType = enum(u7) {
    brush = 1,
    pen = 2,
    path = 3,
    region = 4,
    image = 5,
    font = 6,
    string_format = 7,
    image_attributes = 8,
    custom_line_cap = 9,
};

pub const Fragment = struct {
    object_id: u6,
    object_type: ObjectType,
    continues: bool,
    total_object_size: ?u32,
    object_data: []const u8,
};

pub fn parse(value: record.Record, multipart: bool) !Fragment {
    if (value.kind != .object) return error.NotEmfPlusObject;

    const object_id = try record_flags.objectId(value.flags);
    const raw_type: u7 = @truncate(value.flags >> 8);
    const object_type: ObjectType = switch (raw_type) {
        1...9 => @enumFromInt(raw_type),
        else => return error.InvalidEmfPlusObjectType,
    };
    const continues = value.flags & 0x8000 != 0;
    const has_total = continues or multipart;
    if (has_total and value.data.len < 4) return error.MissingEmfPlusTotalObjectSize;

    return .{
        .object_id = object_id,
        .object_type = object_type,
        .continues = continues,
        .total_object_size = if (has_total) std.mem.readInt(u32, value.data[0..4], .little) else null,
        .object_data = if (has_total) value.data[4..] else value.data,
    };
}

pub const Report = struct {
    records: usize = 0,
    completed: usize = 0,
    multipart_objects: usize = 0,
    multipart_fragments: usize = 0,
    object_data_bytes: usize = 0,
    replacements: usize = 0,
    live_objects: usize = 0,
};

pub const Pending = struct {
    object_id: u6,
    object_type: ObjectType,
    total_object_size: u32,
    received: u64,
};

const Transition = struct {
    next_pending: ?Pending,
    semantic_bytes: usize,
    completed: bool,
    started_multipart: bool,
};

fn transition(pending: ?Pending, fragment: Fragment) !Transition {
    if (pending) |current| {
        if (fragment.object_id != current.object_id or fragment.object_type != current.object_type)
            return error.MismatchedEmfPlusObjectContinuation;
        if (fragment.total_object_size.? != current.total_object_size)
            return error.ChangedEmfPlusTotalObjectSize;
        const received = std.math.add(u64, current.received, @as(u64, @intCast(fragment.object_data.len))) catch
            return error.EmfPlusObjectSizeExceeded;
        const aligned_total = std.mem.alignForward(u64, current.total_object_size, 4);
        if (received > aligned_total) return error.EmfPlusObjectSizeExceeded;
        if (fragment.continues and received >= current.total_object_size)
            return error.RedundantEmfPlusObjectContinuation;
        if (!fragment.continues and received < current.total_object_size)
            return error.TruncatedEmfPlusObject;

        const semantic_bytes: usize = if (fragment.continues)
            fragment.object_data.len
        else
            @intCast(@as(u64, current.total_object_size) - current.received);
        return .{
            .next_pending = if (fragment.continues) .{
                .object_id = current.object_id,
                .object_type = current.object_type,
                .total_object_size = current.total_object_size,
                .received = received,
            } else null,
            .semantic_bytes = semantic_bytes,
            .completed = !fragment.continues,
            .started_multipart = false,
        };
    }

    if (fragment.continues) {
        const total = fragment.total_object_size.?;
        const received: u64 = @intCast(fragment.object_data.len);
        if (received >= total) return error.RedundantEmfPlusObjectContinuation;
        return .{
            .next_pending = .{
                .object_id = fragment.object_id,
                .object_type = fragment.object_type,
                .total_object_size = total,
                .received = received,
            },
            .semantic_bytes = fragment.object_data.len,
            .completed = false,
            .started_multipart = true,
        };
    }

    return .{
        .next_pending = null,
        .semantic_bytes = fragment.object_data.len,
        .completed = true,
        .started_multipart = false,
    };
}

pub const State = struct {
    table: [64]?ObjectType = .{null} ** 64,
    pending: ?Pending = null,
    report: Report = .{},

    pub fn consume(self: *State, value: record.Record) !bool {
        if (value.kind != .object) return false;
        var next = self.*;
        const fragment = try parse(value, next.pending != null);
        next.report.records = try add(next.report.records, 1);

        const decision = try transition(next.pending, fragment);
        if (next.pending != null) {
            next.report.multipart_fragments = try add(next.report.multipart_fragments, 1);
            next.report.object_data_bytes = try add(next.report.object_data_bytes, decision.semantic_bytes);
            next.pending = decision.next_pending;
            if (decision.completed) {
                try next.complete(fragment.object_id, fragment.object_type);
            }
        } else if (decision.started_multipart) {
            next.pending = decision.next_pending;
            next.report.multipart_objects = try add(next.report.multipart_objects, 1);
            next.report.multipart_fragments = try add(next.report.multipart_fragments, 1);
            next.report.object_data_bytes = try add(next.report.object_data_bytes, decision.semantic_bytes);
        } else {
            next.report.object_data_bytes = try add(next.report.object_data_bytes, decision.semantic_bytes);
            try next.complete(fragment.object_id, fragment.object_type);
        }

        self.* = next;
        return true;
    }

    pub fn finish(self: State) !void {
        if (self.pending != null) return error.TruncatedEmfPlusObject;
    }

    fn complete(self: *State, object_id: u6, object_type: ObjectType) !void {
        const slot = @as(usize, object_id);
        if (self.table[slot] != null) {
            self.report.replacements = try add(self.report.replacements, 1);
        } else {
            self.report.live_objects = try add(self.report.live_objects, 1);
        }
        self.table[slot] = object_type;
        self.report.completed = try add(self.report.completed, 1);
    }
};

pub const AssembleOptions = struct {
    max_object_bytes: usize = 64 * 1024 * 1024,
};

pub const Completed = struct {
    object_id: u6,
    object_type: ObjectType,
    object_data: []const u8,
    multipart: bool,
};

pub const Assembler = struct {
    allocator: std.mem.Allocator,
    options: AssembleOptions,
    pending: ?Pending = null,
    storage: std.ArrayListUnmanaged(u8) = .empty,

    pub fn init(allocator: std.mem.Allocator, options: AssembleOptions) Assembler {
        return .{ .allocator = allocator, .options = options };
    }

    pub fn deinit(self: *Assembler) void {
        self.storage.deinit(self.allocator);
        self.* = undefined;
    }

    pub fn consume(self: *Assembler, value: record.Record) !?Completed {
        if (value.kind != .object) return null;
        const fragment = try parse(value, self.pending != null);
        const decision = try transition(self.pending, fragment);

        if (decision.started_multipart and fragment.total_object_size.? > self.options.max_object_bytes)
            return error.LimitExceeded;

        if (self.pending == null and !decision.started_multipart) {
            if (fragment.object_data.len > self.options.max_object_bytes) return error.LimitExceeded;
            self.storage.clearRetainingCapacity();
            return .{
                .object_id = fragment.object_id,
                .object_type = fragment.object_type,
                .object_data = fragment.object_data,
                .multipart = false,
            };
        }

        const current_len: usize = if (decision.started_multipart) 0 else self.storage.items.len;
        const target_len = std.math.add(usize, current_len, decision.semantic_bytes) catch
            return error.LimitExceeded;
        if (target_len > self.options.max_object_bytes) return error.LimitExceeded;
        if (decision.started_multipart) self.storage.clearRetainingCapacity();
        try self.storage.appendSlice(self.allocator, fragment.object_data[0..decision.semantic_bytes]);
        self.pending = decision.next_pending;
        if (!decision.completed) return null;

        return .{
            .object_id = fragment.object_id,
            .object_type = fragment.object_type,
            .object_data = self.storage.items,
            .multipart = true,
        };
    }

    pub fn reset(self: *Assembler) void {
        self.pending = null;
        self.storage.clearRetainingCapacity();
    }

    pub fn finish(self: Assembler) !void {
        if (self.pending != null) return error.TruncatedEmfPlusObject;
    }
};

fn add(a: usize, b: usize) !usize {
    return std.math.add(usize, a, b) catch error.LimitExceeded;
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .object,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ object flags preserve type ID and noncontinued data" {
    const data = [_]u8{ 1, 2, 3, 4 };
    const value = try parse(makeRecord(0x0903, &data), false);
    try std.testing.expectEqual(ObjectType.custom_line_cap, value.object_type);
    try std.testing.expectEqual(@as(u6, 3), value.object_id);
    try std.testing.expect(!value.continues);
    try std.testing.expect(value.total_object_size == null);
    try std.testing.expectEqualSlices(u8, &data, value.object_data);

    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(0x0140, &data), false));
    try std.testing.expectError(error.InvalidEmfPlusObjectType, parse(makeRecord(0x0000, &data), false));
    try std.testing.expectError(error.InvalidEmfPlusObjectType, parse(makeRecord(0x0a00, &data), false));

    for (1..10) |raw_type| {
        const low = try parse(makeRecord(@intCast(raw_type << 8), &data), false);
        try std.testing.expectEqual(@as(u6, 0), low.object_id);
        try std.testing.expectEqual(@as(u7, @intCast(raw_type)), @intFromEnum(low.object_type));
        const high = try parse(makeRecord(@intCast((raw_type << 8) | 63), &data), false);
        try std.testing.expectEqual(@as(u6, 63), high.object_id);
    }
}

test "EMF+ object state validates multipart data and replaces slots" {
    const first = [_]u8{ 12, 0, 0, 0, 1, 2, 3, 4 };
    const middle = [_]u8{ 12, 0, 0, 0, 5, 6, 7, 8 };
    const last = [_]u8{ 12, 0, 0, 0, 9, 10, 11, 12 };
    var state: State = .{};
    try std.testing.expect(try state.consume(makeRecord(0x8302, &first)));
    try std.testing.expect(try state.consume(makeRecord(0x8302, &middle)));
    try std.testing.expect(try state.consume(makeRecord(0x0302, &last)));
    try state.finish();
    try std.testing.expectEqual(ObjectType.path, state.table[2].?);
    try std.testing.expectEqual(@as(usize, 3), state.report.records);
    try std.testing.expectEqual(@as(usize, 1), state.report.completed);
    try std.testing.expectEqual(@as(usize, 1), state.report.multipart_objects);
    try std.testing.expectEqual(@as(usize, 3), state.report.multipart_fragments);
    try std.testing.expectEqual(@as(usize, 12), state.report.object_data_bytes);
    try std.testing.expectEqual(@as(usize, 0), state.report.replacements);
    try std.testing.expectEqual(@as(usize, 1), state.report.live_objects);

    const replacement = [_]u8{ 0, 0, 0, 0 };
    try std.testing.expect(try state.consume(makeRecord(0x0102, &replacement)));
    try std.testing.expectEqual(ObjectType.brush, state.table[2].?);
    try std.testing.expectEqual(@as(usize, 1), state.report.replacements);
    try std.testing.expectEqual(@as(usize, 1), state.report.live_objects);
}

test "EMF+ multipart failures are atomic" {
    const first = [_]u8{ 8, 0, 0, 0, 1, 2, 3, 4 };
    var state: State = .{};
    try std.testing.expect(try state.consume(makeRecord(0x8501, &first)));
    const before = state;

    const changed = [_]u8{ 12, 0, 0, 0, 5, 6, 7, 8 };
    try std.testing.expectError(error.ChangedEmfPlusTotalObjectSize, state.consume(makeRecord(0x0501, &changed)));
    try std.testing.expectEqualDeep(before, state);
    try std.testing.expectError(error.MismatchedEmfPlusObjectContinuation, state.consume(makeRecord(0x0502, &first)));
    try std.testing.expectEqualDeep(before, state);
    try std.testing.expectError(error.TruncatedEmfPlusObject, state.finish());

    const short = [_]u8{ 8, 0, 0, 0 };
    try std.testing.expectError(error.TruncatedEmfPlusObject, state.consume(makeRecord(0x0501, &short)));
    try std.testing.expectEqualDeep(before, state);
    const too_long = [_]u8{ 8, 0, 0, 0, 5, 6, 7, 8, 9, 10, 11, 12 };
    try std.testing.expectError(error.EmfPlusObjectSizeExceeded, state.consume(makeRecord(0x0501, &too_long)));
    try std.testing.expectEqualDeep(before, state);
}

test "EMF+ multipart continuation marker must agree with total size" {
    const complete_but_continued = [_]u8{ 4, 0, 0, 0, 1, 2, 3, 4 };
    var state: State = .{};
    try std.testing.expectError(error.RedundantEmfPlusObjectContinuation, state.consume(makeRecord(0x8100, &complete_but_continued)));
    try std.testing.expectEqualDeep(State{}, state);

    const missing_total = [_]u8{ 1, 2, 3 };
    try std.testing.expectError(error.MissingEmfPlusTotalObjectSize, state.consume(makeRecord(0x8100, &missing_total)));
    try std.testing.expectEqualDeep(State{}, state);

    const first = [_]u8{ 8, 0, 0, 0, 1, 2, 3, 4 };
    const exact_but_continued = [_]u8{ 8, 0, 0, 0, 5, 6, 7, 8 };
    try std.testing.expect(try state.consume(makeRecord(0x8100, &first)));
    const before = state;
    try std.testing.expectError(
        error.RedundantEmfPlusObjectContinuation,
        state.consume(makeRecord(0x8100, &exact_but_continued)),
    );
    try std.testing.expectEqualDeep(before, state);
}

test "EMF+ multipart final fragment separates alignment padding from object bytes" {
    const first = [_]u8{ 7, 0, 0, 0, 1, 2, 3, 4 };
    const final = [_]u8{ 7, 0, 0, 0, 5, 6, 7, 0xaa };
    var state: State = .{};
    try std.testing.expect(try state.consume(makeRecord(0x8201, &first)));
    try std.testing.expect(try state.consume(makeRecord(0x0201, &final)));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 7), state.report.object_data_bytes);

    var excessive: State = .{};
    try std.testing.expect(try excessive.consume(makeRecord(0x8201, &first)));
    const too_much = [_]u8{ 7, 0, 0, 0, 5, 6, 7, 8, 9, 10, 11, 12 };
    try std.testing.expectError(error.EmfPlusObjectSizeExceeded, excessive.consume(makeRecord(0x0201, &too_much)));
}

test "EMF+ multipart arithmetic accepts the u32 maximum plus final padding" {
    var state: State = .{};
    state.pending = .{
        .object_id = 0,
        .object_type = .brush,
        .total_object_size = std.math.maxInt(u32),
        .received = std.math.maxInt(u32) - 3,
    };
    state.report.object_data_bytes = std.math.maxInt(u32) - 3;
    const final = [_]u8{ 0xff, 0xff, 0xff, 0xff, 1, 2, 3, 0xaa };
    try std.testing.expect(try state.consume(makeRecord(0x0100, &final)));
    try state.finish();
    try std.testing.expectEqual(@as(usize, std.math.maxInt(u32)), state.report.object_data_bytes);
}

test "EMF+ object report overflow leaves table and counters unchanged" {
    const data = [_]u8{ 1, 2, 3, 4 };
    var state: State = .{};
    state.report.completed = std.math.maxInt(usize);
    const before = state;
    try std.testing.expectError(error.LimitExceeded, state.consume(makeRecord(0x0100, &data)));
    try std.testing.expectEqualDeep(before, state);
}

test "EMF+ object assembler returns direct and exact multipart payloads" {
    var assembler = Assembler.init(std.testing.allocator, .{});
    defer assembler.deinit();

    const direct_data = [_]u8{ 9, 8, 7, 6 };
    const direct = (try assembler.consume(makeRecord(0x0103, &direct_data))).?;
    try std.testing.expectEqual(@as(u6, 3), direct.object_id);
    try std.testing.expectEqual(ObjectType.brush, direct.object_type);
    try std.testing.expect(!direct.multipart);
    try std.testing.expectEqualSlices(u8, &direct_data, direct.object_data);

    const first = [_]u8{ 7, 0, 0, 0, 1, 2, 3, 4 };
    const final = [_]u8{ 7, 0, 0, 0, 5, 6, 7, 0xaa };
    try std.testing.expect((try assembler.consume(makeRecord(0x8205, &first))) == null);
    const completed = (try assembler.consume(makeRecord(0x0205, &final))).?;
    try std.testing.expectEqual(@as(u6, 5), completed.object_id);
    try std.testing.expectEqual(ObjectType.pen, completed.object_type);
    try std.testing.expect(completed.multipart);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4, 5, 6, 7 }, completed.object_data);
    try assembler.finish();

    const next_first = [_]u8{ 4, 0, 0, 0, 10, 11 };
    const next_final = [_]u8{ 4, 0, 0, 0, 12, 13 };
    try std.testing.expect((try assembler.consume(makeRecord(0x8301, &next_first))) == null);
    const next = (try assembler.consume(makeRecord(0x0301, &next_final))).?;
    try std.testing.expectEqualSlices(u8, &.{ 10, 11, 12, 13 }, next.object_data);
}

test "EMF+ object assembler covers every aligned split and final padding width" {
    var assembler = Assembler.init(std.testing.allocator, .{});
    defer assembler.deinit();
    var payload: [32]u8 = undefined;
    for (&payload, 0..) |*byte, i| byte.* = @intCast(i + 1);

    for (1..payload.len + 1) |semantic_len| {
        var split: usize = 0;
        while (split < semantic_len) : (split += 4) {
            var first: [36]u8 = undefined;
            std.mem.writeInt(u32, first[0..4], @intCast(semantic_len), .little);
            @memcpy(first[4 .. 4 + split], payload[0..split]);

            const remaining = semantic_len - split;
            const padded_remaining = std.mem.alignForward(usize, remaining, 4);
            var final: [36]u8 = undefined;
            std.mem.writeInt(u32, final[0..4], @intCast(semantic_len), .little);
            @memcpy(final[4 .. 4 + remaining], payload[split..semantic_len]);
            @memset(final[4 + remaining .. 4 + padded_remaining], 0xa5);

            assembler.reset();
            try std.testing.expect((try assembler.consume(makeRecord(0x8100, first[0 .. 4 + split]))) == null);
            const completed = (try assembler.consume(makeRecord(0x0100, final[0 .. 4 + padded_remaining]))).?;
            try std.testing.expectEqualSlices(u8, payload[0..semantic_len], completed.object_data);
        }
    }
}

test "EMF+ object assembler enforces limits and preserves pending state on rejection" {
    var assembler = Assembler.init(std.testing.allocator, .{ .max_object_bytes = 7 });
    defer assembler.deinit();

    const too_large_direct = [_]u8{0} ** 8;
    try std.testing.expectError(error.LimitExceeded, assembler.consume(makeRecord(0x0100, &too_large_direct)));
    try std.testing.expect(assembler.pending == null);

    const too_large_first = [_]u8{ 8, 0, 0, 0, 1, 2, 3, 4 };
    try std.testing.expectError(error.LimitExceeded, assembler.consume(makeRecord(0x8100, &too_large_first)));
    try std.testing.expect(assembler.pending == null);

    const first = [_]u8{ 7, 0, 0, 0, 1, 2, 3, 4 };
    try std.testing.expect((try assembler.consume(makeRecord(0x8100, &first))) == null);
    const before_pending = assembler.pending;
    const before_bytes = assembler.storage.items.len;
    const excessive = [_]u8{ 7, 0, 0, 0, 5, 6, 7, 8, 9, 10, 11, 12 };
    try std.testing.expectError(error.EmfPlusObjectSizeExceeded, assembler.consume(makeRecord(0x0100, &excessive)));
    try std.testing.expectEqualDeep(before_pending, assembler.pending);
    try std.testing.expectEqual(before_bytes, assembler.storage.items.len);
    try std.testing.expectError(error.TruncatedEmfPlusObject, assembler.finish());
}

fn assembleAllocationCheck(allocator: std.mem.Allocator) !void {
    var assembler = Assembler.init(allocator, .{});
    defer assembler.deinit();
    const first = [_]u8{ 8, 0, 0, 0, 1, 2, 3, 4 };
    const final = [_]u8{ 8, 0, 0, 0, 5, 6, 7, 8 };
    try std.testing.expect((try assembler.consume(makeRecord(0x8100, &first))) == null);
    const completed = (try assembler.consume(makeRecord(0x0100, &final))).?;
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4, 5, 6, 7, 8 }, completed.object_data);
}

test "EMF+ object assembler survives every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, assembleAllocationCheck, .{});
}

test "EMF+ object assembler frees allocations on success and error paths" {
    var checked = std.heap.DebugAllocator(.{ .safety = true }){};
    defer {
        const status = checked.deinit();
        std.testing.expect(status == .ok) catch @panic("object assembler leaked memory");
    }
    var assembler = Assembler.init(checked.allocator(), .{});
    defer assembler.deinit();

    const first = [_]u8{ 8, 0, 0, 0, 1, 2, 3, 4 };
    const final = [_]u8{ 8, 0, 0, 0, 5, 6, 7, 8 };
    try std.testing.expect((try assembler.consume(makeRecord(0x8100, &first))) == null);
    _ = (try assembler.consume(makeRecord(0x0100, &final))).?;

    assembler.reset();
    try std.testing.expect((try assembler.consume(makeRecord(0x8100, &first))) == null);
    const wrong = [_]u8{ 8, 0, 0, 0, 5, 6, 7, 8 };
    try std.testing.expectError(
        error.MismatchedEmfPlusObjectContinuation,
        assembler.consume(makeRecord(0x0200, &wrong)),
    );
}
