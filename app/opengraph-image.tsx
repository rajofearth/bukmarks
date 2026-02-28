import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Bukmarks - Organize and manage your bookmarks with ease";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [logoData, fontData] = await Promise.all([
    readFile(
      join(process.cwd(), "public/bukmarks-icon-dark.png"),
      "base64",
    ),
    readFile(join(process.cwd(), "public/fonts/JetBrainsMono-Regular.ttf")),
  ]);

  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #0a0a0a 0%, #171717 100%)",
          gap: 24,
        }}
      >
        <img src={logoSrc} alt="" width={120} height={120} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 56,
              fontWeight: 600,
              color: "white",
              fontFamily: "JetBrains Mono",
            }}
          >
            Bukmarks
          </span>
          <span
            style={{
              fontSize: 24,
              color: "rgba(255, 255, 255, 0.7)",
              fontFamily: "JetBrains Mono",
            }}
          >
            Organize and manage your bookmarks with ease
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "JetBrains Mono",
          data: fontData,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
