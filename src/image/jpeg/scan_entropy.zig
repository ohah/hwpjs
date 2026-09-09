const Reader = @import("../../binary/reader.zig").Reader;
const Bits = @import("entropy_bits.zig").Bits;
const entropy = @import("entropy.zig");
const markers = @import("markers.zig");
const Restart = @import("restarts.zig").State;

pub const Options = struct { max_bytes: usize = 64 * 1024 * 1024, max_blocks: usize = 4000000, max_restarts: usize = 65536 };

// These helpers operate on a scan decoder's transaction-local state. They do
// not own coefficient predictors or certify a complete frame's marker order.
pub fn begin(reader: *Reader, maximum: usize) !Bits {
    const segment = try entropy.takeUntilMarker(reader, maximum);
    return Bits.init(segment.raw, maximum);
}

fn marker(reader: Reader, maximum: usize) !struct { value: markers.Marker, end: usize } {
    var it = try markers.Iterator.init(reader.bytes, .{ .max_bytes = maximum });
    it.reader.offset = reader.offset;
    return .{ .value = (try it.next()) orelse return error.UnexpectedEnd, .end = it.reader.offset };
}

pub fn due(emitted: u64, per_mcu: usize, interval: u16) bool {
    return emitted != 0 and emitted % per_mcu == 0 and interval != 0 and (emitted / per_mcu) % interval == 0;
}

pub fn restart(reader: *Reader, bits: *Bits, state: *Restart, options: Options) !void {
    try bits.finish();
    const next = try marker(reader.*, options.max_bytes);
    try state.accept(next.value.code, options.max_restarts);
    reader.offset = next.end;
    bits.* = try begin(reader, options.max_bytes);
}

pub fn finish(reader: Reader, bits: *Bits, state: *Restart, options: Options) !void {
    try bits.finish();
    const terminal = try marker(reader, options.max_bytes);
    if (terminal.value.code >= 0xd0 and terminal.value.code <= 0xd7) return error.InvalidJpegRestartPosition;
    state.endScan();
}
