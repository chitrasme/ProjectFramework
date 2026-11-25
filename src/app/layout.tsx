import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ProjectTrack", template: "%s · ProjectTrack" },
  description: "Final year project management for college departments",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
