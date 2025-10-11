import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/widget/header";

export const metadata: Metadata = {
  title: "2048 Duo",
  description: "Play 2048 with friends! Challenge yourself in single-player mode or compete with others in real-time multiplayer. Create rooms, join games, and experience the classic puzzle game in a whole new way.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Alan+Sans:wght@300..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`antialiased`}>
        <Header />
        {children}
      </body>
    </html>
  );
}
