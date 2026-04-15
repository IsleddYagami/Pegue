import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
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
          backgroundColor: "#000000",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Logo symbol */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://pegue-eta.vercel.app/logo-pegue.png"
            width={280}
            height={280}
            alt="Pegue"
            style={{ objectFit: "contain" }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <p
              style={{
                fontSize: "28px",
                color: "#C9A84C",
                margin: 0,
                letterSpacing: "2px",
              }}
            >
              SOLUÇÕES EM TRANSPORTES E FRETES
            </p>
            <div
              style={{
                width: "300px",
                height: "2px",
                backgroundColor: "#C9A84C",
                marginTop: "8px",
              }}
            />
            <p
              style={{
                fontSize: "22px",
                color: "#888",
                margin: 0,
                marginTop: "12px",
              }}
            >
              A Pegue Resolve. 🚚
            </p>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
