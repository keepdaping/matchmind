import './globals.css'

export const metadata = {
  title: 'MatchMind — AI Football Predictions',
  description: 'AI-powered match predictions. Your edge before kickoff. Every single day.',
  keywords: 'football predictions, AI sports betting, match tips Uganda, Kenya football tips',
  openGraph: {
    title: 'MatchMind — AI Football Predictions',
    description: 'Your edge before kickoff. Every single day.',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0f0d] text-[#e8f0ec] antialiased">
        {children}
      </body>
    </html>
  )
}
