import './globals.css'

export const metadata = {
  title: 'MatchMind — AI Football Predictions',
  description: 'Dixon-Coles Poisson model predictions for 28+ football leagues. Your edge before kickoff.',
  keywords: 'football predictions, AI sports predictions, match tips, Uganda Premier League, Premier League tips, betting predictions, Dixon-Coles model',
  openGraph: {
    title: 'MatchMind — AI Football Predictions',
    description: 'Dixon-Coles Poisson model. 28 leagues. Your edge before kickoff.',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
