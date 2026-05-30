import { guessMimeFromFilename } from "../prepareFileUpload";
import { registerWebFile } from "./webFileRegistry";

export type WebPickedFile = {
  uri: string;
  name: string;
  mime: string;
  size: number;
};

function pickViaInput(accept: string, multiple: boolean): Promise<WebPickedFile[]> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve([]);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      resolve(
        files.map((file) => ({
          uri: registerWebFile(file),
          name: file.name || `file_${Date.now()}`,
          mime: file.type || guessMimeFromFilename(file.name),
          size: file.size,
        })),
      );
    };

    input.oncancel = () => {
      cleanup();
      resolve([]);
    };

    input.click();
  });
}

export function pickWebFile(accept = "*/*"): Promise<WebPickedFile | null> {
  return pickViaInput(accept, false).then((rows) => rows[0] ?? null);
}

export function pickWebFiles(accept = "*/*"): Promise<WebPickedFile[]> {
  return pickViaInput(accept, true);
}
