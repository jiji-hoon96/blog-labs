import { inter, notoSans, notoSerif, mono } from './fonts';
import './style.css';

export const metadata = { title: 'next-font' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={[inter, notoSans, notoSerif, mono].map((f) => f.variable).join(' ')}>
      <body>{children}</body>
    </html>
  );
}
