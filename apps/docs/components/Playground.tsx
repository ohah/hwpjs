import { useRef, useState } from "react";
import { withBase } from "@rspress/core/runtime";
import "./playground.css";

/** The editor and its worker/WASM are served from this site's own static assets. */
export default function Playground() {
  const root = useRef<HTMLElement>(null);
  const [fullscreenError, setFullscreenError] = useState("");
  async function enterFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
      setFullscreenError("");
    } catch {
      setFullscreenError(
        "브라우저 전체화면을 사용할 수 없습니다. 현재 화면에서도 편집할 수 있습니다.",
      );
    }
  }
  return (
    <section ref={root} className="hwpjs-playground" aria-label="HWPJS 전체화면 편집 데모">
      <header className="hwpjs-playground-bar">
        <a href={withBase("/")} aria-label="HWPJS 문서로 돌아가기">
          HWPJS <span>문서로 돌아가기</span>
        </a>
        <p>파일은 이 브라우저에서 처리됩니다.</p>
        <button type="button" onClick={enterFullscreen}>
          전체화면 전환
        </button>
      </header>
      {fullscreenError && (
        <p className="hwpjs-playground-notice" role="status">
          {fullscreenError}
        </p>
      )}
      <iframe
        title="HWP5·HWPX Canvas 편집기"
        src={withBase("/editor/index.html")}
        allow="clipboard-read; clipboard-write; fullscreen"
        allowFullScreen
      />
    </section>
  );
}
