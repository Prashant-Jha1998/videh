/** Inline HTML for WebView PDF.js first-page render. */
export function buildPdfPreviewHtml(base64Data: string, heightPx: number): string {
  const safe = base64Data.replace(/'/g, "");
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #fff; overflow: hidden; }
  #wrap { width: 100%; height: ${heightPx}px; display: flex; align-items: center; justify-content: center; background: #fff; }
  canvas { max-width: 100%; max-height: 100%; display: block; }
  #err { color: #8696a0; font: 13px sans-serif; padding: 12px; text-align: center; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
<div id="wrap"><div id="err">Loading preview…</div></div>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const raw = atob('${safe}');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
    return pdf.getPage(1);
  }).then(function(page) {
    const wrap = document.getElementById('wrap');
    wrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    const viewport = page.getViewport({ scale: 1 });
    const maxW = wrap.clientWidth || ${heightPx * 0.72};
    const maxH = ${heightPx};
    const scale = Math.min(maxW / viewport.width, maxH / viewport.height, 2);
    const scaled = page.getViewport({ scale: scale });
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    wrap.appendChild(canvas);
    return page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
  }).catch(function() {
    document.getElementById('wrap').innerHTML = '<div id="err">Preview unavailable</div>';
  });
</script>
</body>
</html>`;
}
