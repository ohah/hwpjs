/** Decorative, independently drawn document diagram; no vendor assets or product screenshot. */
export function DocumentGraphic() {
  return (
    <div className="hwpjs-document-graphic" aria-hidden="true">
      <div className="hwpjs-graphic-grid" />
      <div className="hwpjs-graphic-label hwpjs-graphic-label--source">HWP5 / HWPX</div>
      <svg className="hwpjs-document-sheet" viewBox="0 0 400 420" fill="none">
        <rect
          className="hwpjs-sheet-back"
          x="73"
          y="39"
          width="266"
          height="340"
          rx="14"
          transform="rotate(8 73 39)"
        />
        <rect className="hwpjs-sheet-front" x="47" y="35" width="268" height="342" rx="14" />
        <path className="hwpjs-sheet-accent" d="M78 76H117" strokeWidth="5" strokeLinecap="round" />
        <path
          className="hwpjs-sheet-text"
          d="M78 110H254M78 128H227"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          className="hwpjs-sheet-line"
          d="M78 164H280M78 180H280M78 196H247"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <rect className="hwpjs-sheet-selection" x="74" y="220" width="208" height="28" rx="4" />
        <path className="hwpjs-sheet-line" d="M83 234H237" strokeWidth="4" strokeLinecap="round" />
        <path className="hwpjs-sheet-accent" d="M260 225V243" strokeWidth="2" />
        <rect className="hwpjs-sheet-table" x="78" y="273" width="202" height="68" rx="4" />
        <path
          className="hwpjs-sheet-line"
          d="M78 296H280M78 319H280M145 273V341M213 273V341"
          strokeWidth="1"
        />
      </svg>
      <div className="hwpjs-graphic-label hwpjs-graphic-label--command">
        <span />
        선택 → 편집 → 저장
      </div>
    </div>
  );
}
