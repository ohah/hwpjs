const Header = @import("header.zig").Header;
const Chunk = @import("chunks.zig").Chunk;
const transparency = @import("transparency.zig");
const background = @import("background.zig");
const histogram = @import("histogram.zig");
const physical = @import("physical.zig");
const significant_bits = @import("significant_bits.zig");
const timestamp = @import("timestamp.zig");
const text = @import("text.zig");
const std = @import("std");
const compressed_text = @import("compressed_text.zig");

/// Selected ancillary semantics only. Other chunks stay deferred in structure.
pub const State = struct {
    transparency: ?transparency.Value = null,
    background: ?background.Value = null,
    histogram: ?histogram.Value = null,
    physical: ?physical.Value = null,
    significant_bits: ?significant_bits.Value = null,
    timestamp: ?timestamp.Value = null,
    text_chunks: usize = 0,
    text_keyword_bytes: usize = 0,
    text_bytes: usize = 0,
    compressed_text_chunks: usize = 0,
    compressed_text_keyword_bytes: usize = 0,
    compressed_text_bytes: usize = 0,
    validated_chunks: usize = 0,
    validated_bytes: usize = 0,
    palette_seen: bool = false,
    data_seen: bool = false,
    /// Full path including allocating text. The aggregate limit covers tEXt and zTXt bodies.
    pub fn consumeBounded(self: *State, a: std.mem.Allocator, h: Header, palette_entries: usize, chunk: Chunk, max_text_bytes: usize) !void {
        if (!chunk.is("tEXt") and !chunk.is("zTXt")) return self.consume(h, palette_entries, chunk);
        if (self.text_bytes > max_text_bytes or self.compressed_text_bytes > max_text_bytes - self.text_bytes) return error.LimitExceeded;
        const remaining = max_text_bytes - self.text_bytes - self.compressed_text_bytes;
        if (chunk.is("tEXt")) {
            const value = try text.parse(chunk.payload);
            if (value.text.len > remaining) return error.LimitExceeded;
            self.recordText(value, chunk.payload.len);
        } else {
            var value = try compressed_text.decode(a, chunk.payload, remaining);
            defer value.deinit(a);
            self.compressed_text_chunks += 1;
            self.compressed_text_keyword_bytes += value.keyword.len;
            self.compressed_text_bytes += value.text.len;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        }
    }
    fn recordText(self: *State, value: text.Value, payload_bytes: usize) void {
        self.text_chunks += 1;
        self.text_keyword_bytes += value.keyword.len;
        self.text_bytes += value.text.len;
        self.validated_chunks += 1;
        self.validated_bytes += payload_bytes;
    }
    /// Non-allocating subset only; zTXt is deliberately not consumed here.
    /// Atomic on failure; caller has already validated the critical envelope.
    pub fn consume(self: *State, h: Header, palette_entries: usize, chunk: Chunk) !void {
        if (chunk.is("PLTE")) {
            if (self.transparency != null) return error.InvalidPngTransparencyOrder;
            if (self.background != null) return error.InvalidPngBackgroundOrder;
            if (self.histogram != null) return error.InvalidPngHistogramOrder;
            self.palette_seen = true;
        } else if (chunk.is("IDAT")) {
            self.data_seen = true;
        } else if (chunk.is("tRNS")) {
            if (self.transparency != null) return error.DuplicatePngTransparency;
            if (self.data_seen or (h.color_type == 3 and !self.palette_seen)) return error.InvalidPngTransparencyOrder;
            const value = try transparency.parse(h, palette_entries, chunk.payload);
            self.transparency = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("bKGD")) {
            if (self.background != null) return error.DuplicatePngBackground;
            if (self.data_seen or (h.color_type == 3 and !self.palette_seen)) return error.InvalidPngBackgroundOrder;
            const value = try background.parse(h, palette_entries, chunk.payload);
            self.background = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("hIST")) {
            if (self.histogram != null) return error.DuplicatePngHistogram;
            if (self.data_seen or !self.palette_seen) return error.InvalidPngHistogramOrder;
            const value = try histogram.parse(h, palette_entries, chunk.payload);
            self.histogram = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("pHYs")) {
            if (self.physical != null) return error.DuplicatePngPhysical;
            if (self.data_seen) return error.InvalidPngPhysicalOrder;
            const value = try physical.parse(chunk.payload);
            self.physical = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("tEXt")) {
            self.recordText(try text.parse(chunk.payload), chunk.payload.len);
        } else if (chunk.is("tIME")) {
            if (self.timestamp != null) return error.DuplicatePngTimestamp;
            const value = try timestamp.parse(chunk.payload);
            self.timestamp = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("sBIT")) {
            if (self.significant_bits != null) return error.DuplicatePngSignificantBits;
            if (self.palette_seen or self.data_seen) return error.InvalidPngSignificantBitsOrder;
            const value = try significant_bits.parse(h, chunk.payload);
            self.significant_bits = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        }
    }
};
