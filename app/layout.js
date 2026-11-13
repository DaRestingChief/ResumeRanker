import "./globals.css";
 
export const metadata = {
  title: "Resume review",
  description: "Ranks resumes against the LCA Consultant and UI/UX Intern job posts",
};
 
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}