//! 초기 본문을 소유한 분리 표를 준비합니다. 게시와 이력은 기존 표 반영 명령이 맡습니다.
const std = @import("std");
const model = @import("../model/created_table.zig");
const editor = @import("editor_session.zig");
const budget = @import("../model/cell_edit_budget.zig");

pub const max_request_bytes: usize = 4 * 1024 * 1024;
pub const Request = struct {
    version: u32,
    section: u32,
    paragraph: u32,
    unit: u32,
    rows: u32,
    columns: u32,
    width: u32,
    row_height: u32,
    resources: model.Resources,
    cell_texts: []const []const []const u8,
};
pub const Prepared = struct {
    parsed: std.json.Parsed(Request),
    table: model.Table,

    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.table.deinit(a);
        self.parsed.deinit();
    }

    pub fn command(self: *const Prepared) @import("editor_history.zig").Command {
        const r = self.parsed.value;
        return .{ .kind = .created_table_stage, .section = r.section, .paragraph = r.paragraph, .start = r.unit, .deleted = 0, .inserted = "", .created_table = &self.table };
    }
};

pub fn validateTexts(rows: u32, columns: u32, texts: []const []const []const u8, max_bytes: usize) !void {
    if (rows == 0 or columns == 0 or try std.math.mul(usize, rows, columns) > budget.max_cells) return error.LimitExceeded;
    if (texts.len != rows) return error.InvalidTableCellTexts;
    var total: usize = 0;
    for (texts) |row| {
        if (row.len != columns) return error.InvalidTableCellTexts;
        for (row) |text| {
            total = std.math.add(usize, total, text.len) catch return error.LimitExceeded;
            if (total > @min(max_bytes, max_request_bytes)) return error.LimitExceeded;
            if (!std.unicode.utf8ValidateSlice(text)) return error.InvalidTableCellText;
            // 초기 본문은 한 문단입니다. 기존 구조 제어를 문자열로 주입하지 않습니다.
            for (text) |byte| if (byte < 0x20 or byte == 0x7f) return error.InvalidTableCellText;
        }
    }
}

pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Request) {
    if (bytes.len > max_request_bytes) return error.LimitExceeded;
    try @import("../model/created_table_initial_text_json.zig").validate(a, bytes, true);
    const parsed = std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always }) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => return error.InvalidTableCreationRequest,
    };
    errdefer parsed.deinit();
    const r = parsed.value;
    if (r.version != 1) return error.UnsupportedTableCreationRequest;
    _ = try @import("../model/table_creation_plan.zig").create(r.rows, r.columns, r.width, r.row_height, budget.max_cells);
    try validateTexts(r.rows, r.columns, r.cell_texts, max_request_bytes);
    return parsed;
}

pub fn prepare(session: *const editor.Session, bytes: []const u8) !Prepared {
    const a = session.allocator;
    const parsed = try parse(a, bytes);
    errdefer parsed.deinit();
    const r = parsed.value;
    try validateTexts(r.rows, r.columns, r.cell_texts, session.options.max_text_bytes);
    // 기존 준비기가 원본 소유권, 위치, 자원, 식별자 선택을 그대로 검증합니다.
    var table = try @import("created_table_prepare.zig").prepare(session, r.section, r.paragraph, r.unit, r.rows, r.columns, r.width, r.row_height, r.resources);
    errdefer table.deinit(a);
    for (r.cell_texts, 0..) |row, row_index| {
        for (row, 0..) |text, column_index| {
            _ = try table.replaceText(a, @intCast(row_index), @intCast(column_index), text, session.options.max_text_bytes);
        }
    }
    return .{ .parsed = parsed, .table = table };
}
