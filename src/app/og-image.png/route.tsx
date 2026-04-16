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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://pegue-eta.vercel.app/logo-pegue-novo.png"
          width={320}
          height={320}
          alt="Pegue"
          style={{ objectFit: "contain" }}
        />
        <p
          style={{
            fontSize: "24px",
            color: "#C9A84C",
            margin: 0,
            marginTop: "16px",
            letterSpacing: "3px",
          }}
        >
          A PEGUE RESOLVE.
        </p>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
