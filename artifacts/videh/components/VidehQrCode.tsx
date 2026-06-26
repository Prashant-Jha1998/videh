import { Image } from "expo-image";
import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

/** Compact QR matrix generator (byte mode, ECC level M). */
function createQrMatrix(text: string): boolean[][] | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QRCode = require("qrcode-generator") as (
      typeNumber: number,
      errorCorrectionLevel: "L" | "M" | "Q" | "H",
    ) => {
      addData: (data: string) => void;
      make: () => void;
      getModuleCount: () => number;
      isDark: (row: number, col: number) => boolean;
    };
    const qr = QRCode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const matrix: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      matrix.push(row);
    }
    return matrix;
  } catch {
    return null;
  }
}

type Props = {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
};

export function VidehQrCode({
  value,
  size = 220,
  color = "#14131F",
  backgroundColor = "#ffffff",
}: Props) {
  const cells = useMemo(() => createQrMatrix(value), [value]);

  if (!cells?.length) {
    const fallbackUri = `https://quickchart.io/qr?text=${encodeURIComponent(value)}&size=${size}&ecLevel=M&margin=1`;
    return <Image source={{ uri: fallbackUri }} style={{ width: size, height: size }} contentFit="contain" />;
  }

  const count = cells.length;
  const cell = size / count;

  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} fill={backgroundColor} />
      {cells.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <Rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill={color}
            />
          ) : null,
        ),
      )}
    </Svg>
  );
}
