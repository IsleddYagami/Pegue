"use client";

import dynamic from "next/dynamic";

const PegueRunner = dynamic(() => import("@/components/pegue-runner"), { ssr: false });

export default function JogoPage() {
  return (
    <div className="fixed inset-0 bg-black">
      <PegueRunner onClose={() => window.close()} />
    </div>
  );
}
