const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const values = @import("value_object.zig");
pub const String = values.String;

/// Borrows payload. Failure preserves reader; caller discards the type table.
pub fn readObservedV1(reader: *Reader, table: *Table, max_bytes: usize) !String {
    return values.readStringObservedV1(reader, table, max_bytes);
}
