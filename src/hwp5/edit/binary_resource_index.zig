//! Request-local batch view. Base DocInfo/name indexing happens once, never per OLE.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
const BinData = @import("../docinfo/bin_data.zig").BinData;
const Name = @import("../../cfb/name_order.zig").Name;
const Key = struct { units: [31]u16, len: u8 };
fn key(name: []const u8) !Key {
    const value = try Name.init(name);
    var result: Key = .{ .units = @splat(0), .len = @intCast(value.len) };
    for (value.units[0..value.len], 0..) |unit, i| result.units[i] = @import("../../cfb/simple_uppercase.zig").upper(unit);
    return result;
}
pub const Index = struct {
    source: *const Source,
    docinfo: []u8,
    records: []BinData,
    storage: ?usize,
    entries: std.AutoHashMapUnmanaged(Key, usize),
    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        self.entries.deinit(a);
        a.free(self.records);
        a.free(self.docinfo);
        self.* = undefined;
    }
    pub fn init(a: std.mem.Allocator, source: *const Source) !Index {
        const info = try source.decodeDocInfo(a, 32 * 1024 * 1024);
        errdefer a.free(info);
        var records: std.ArrayList(BinData) = .empty;
        errdefer records.deinit(a);
        var iterator = try @import("../docinfo/reader.zig").Iterator.init(info, source.header.version(), .{});
        while (try iterator.next()) |record| {
            if (record.value == .bin_data) try records.append(a, record.value.bin_data);
        }
        const storage = try source.file.findExact("/BinData");
        var entries: std.AutoHashMapUnmanaged(Key, usize) = .empty;
        errdefer entries.deinit(a);
        if (storage) |parent| if (source.file.entries[parent].kind == 1) {
            for (source.file.entries, 0..) |entry, i| {
                if (entry.kind == 0 or entry.parent != parent) continue;
                const found = try entries.getOrPut(a, try key(entry.name));
                if (found.found_existing) return error.DuplicateDirectoryName;
                found.value_ptr.* = i;
            }
        };
        return .{ .source = source, .docinfo = info, .records = try records.toOwnedSlice(a), .storage = storage, .entries = entries };
    }
    pub fn physicalId(self: *const Index, ordinal: u16) !u16 {
        if (ordinal == 0) return error.AbsentBinaryResource;
        return (try self.originalTarget(ordinal)).target.id;
    }
    fn originalTarget(self: *const Index, ordinal: u16) !struct { item: BinData, target: @import("../docinfo/bin_data.zig").Target } {
        if (@import("../docinfo/reference_rules.zig").resolve(.optional_one_based, ordinal, self.records.len) != .ordinal) return error.InvalidBinaryResourceOrdinal;
        const item = self.records[@as(usize, ordinal) - 1];
        switch (item.data) {
            .link => return error.ExternalLink,
            .unknown => return error.UnsupportedBinDataType,
            else => {},
        }
        return .{ .item = item, .target = (try item.target(.observed_optional_extension)) orelse return error.InvalidBinaryResourceOrdinal };
    }
    pub fn read(self: *const Index, a: std.mem.Allocator, ordinal: u16, limit: usize) ![]u8 {
        if (ordinal == 0) return error.AbsentBinaryResource;
        if (limit > 32 * 1024 * 1024) return error.LimitExceeded;
        const resolved = try self.originalTarget(ordinal);
        const item = resolved.item;
        const target = resolved.target;
        const path = try @import("../container/paths.zig").binary(a, target.id, target.extension_utf16 orelse &.{});
        defer a.free(path);
        const parent = self.storage orelse return error.MissingHwpEntry;
        if (self.source.file.entries[parent].kind != 1) return error.InvalidHwpEntryKind;
        const index = self.entries.get(try key(path["/BinData/".len..])) orelse return error.MissingHwpEntry;
        if (self.source.file.entries[index].kind != 2) return error.InvalidHwpEntryKind;
        return @import("../bin_data_stream.zig").decodeWithPolicy(a, &self.source.header, item, self.source.file.entries[index].content, limit, if (self.source.header.has(.distribution)) .observed_viewtext else .reject);
    }
};

test "H5 batch binary index name keys preserve CFB case and UTF16 length equivalence" {
    for ([_][2][]const u8{ .{ "BIN00af.OLE", "bin00AF.ole" }, .{ "é", "É" }, .{ "ß", "SS" }, .{ "A", "AA" } }) |pair| {
        const left = try Name.init(pair[0]);
        const right = try Name.init(pair[1]);
        try std.testing.expectEqual(@import("../../cfb/name_order.zig").order(left, right) == .eq, std.meta.eql(try key(pair[0]), try key(pair[1])));
    }
    try std.testing.expectError(error.InvalidName, key("BIN0001/alias"));
}
