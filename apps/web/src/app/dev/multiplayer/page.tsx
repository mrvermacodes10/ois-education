import type { Metadata } from "next";
import SyncTest from "./SyncTest";

export const metadata: Metadata = { title: "Multiplayer sync test (developer page)", robots: { index: false } };

export default function Page() {
  return <SyncTest />;
}
