use crate::paragraph::SubList;
use crate::shape::ShapeCommon;
use crate::types::*;

#[derive(Debug, Clone, Default)]
pub struct Table {
    pub common: ShapeCommon,
    pub page_break: TablePageBreak,
    pub repeat_header: bool,
    pub row_count: u16,
    pub col_count: u16,
    pub cell_spacing: HwpUnit,
    pub border_fill_id: u16,
    pub no_adjust: Option<bool>,
    pub in_margin: Margin,
    pub cell_zones: Vec<CellZone>,
    pub rows: Vec<TableRow>,
}

#[derive(Debug, Clone, Default)]
pub struct CellZone {
    pub start_row: u16,
    pub start_col: u16,
    pub end_row: u16,
    pub end_col: u16,
    pub border_fill_id: u16,
}

#[derive(Debug, Clone, Default)]
pub struct TableRow {
    pub cells: Vec<TableCell>,
}

#[derive(Debug, Clone, Default)]
pub struct TableCell {
    pub name: Option<String>,
    pub header: bool,
    pub has_margin: Option<bool>,
    pub protect: bool,
    pub editable: bool,
    pub dirty: Option<bool>,
    pub border_fill_id: u16,

    pub col: u16,
    pub row: u16,
    pub col_span: u16,
    pub row_span: u16,
    pub width: HwpUnit,
    pub height: HwpUnit,
    pub cell_margin: Margin,
    pub content: SubList,
}
