import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PortalProvider } from "./components/PortalProvider";
import GovHeader from "./components/GovHeader";
import GovFooter from "./components/GovFooter";

export const metadata: Metadata = {
  title: "GovLens — Citizen Document Assistance Platform",
  description:
    "Understand Indian government documents in simple language. English, Telugu and Hindi. Powered by local AI.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123B63",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PortalProvider>
          <GovHeader />
          <div id="main-content">{children}</div>
          <GovFooter />
        </PortalProvider>
      </body>
    </html>
  );
}
