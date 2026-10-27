export type CloudCatalogKey = 'nasheed' | 'love_chill' | 'jtec_main' | 'jamendo' | 'archive_nasheed';

export interface CloudCatalogConfig {
  key: CloudCatalogKey;
  title: string;
  subtitle: string;
  badge: string;
  tag: string;
  description: string;
  actionText: string;
  themeColor: string;
  accentBg: string;
  borderColor: string;
  glowColor: string;
  /**
   * Optional background image for the card tile and hero banner.
   * Add a file in public/images/cards/ and reference it here.
   * If omitted or undefined, the card keeps its default gradient styling.
   */
  image?: string;
}

export const CLOUD_CATALOGS: CloudCatalogConfig[] = [
  {
    key: 'nasheed',
    title: 'NASHEED',
    subtitle: 'Nasheed & Spiritual Audio',
    badge: 'Spiritual & Vocals',
    tag: 'Curated Catalog',
    description: 'Acoustic vocals, spiritual anthems, calming recitations and peaceful melodies.',
    actionText: 'Explore Catalog',
    themeColor: '#10b981',
    accentBg: 'from-emerald-950/80 via-slate-900/90 to-slate-950',
    borderColor: 'border-emerald-500/30 hover:border-emerald-400/60',
    glowColor: 'shadow-emerald-500/10 hover:shadow-emerald-500/30',
    image: './images/cards/nasheed.webp',
  },
  {
    key: 'love_chill',
    title: 'LOVE & CHILL',
    subtitle: 'Love Songs, Melodic & Chill Beats',
    badge: 'Melodic & Chill',
    tag: 'Curated Catalog',
    description: 'Romantic acoustics, lofi vibes, warm melodic ballads and late-night relaxation.',
    actionText: 'Explore Catalog',
    themeColor: '#ec4899',
    accentBg: 'from-pink-950/80 via-slate-900/90 to-slate-950',
    borderColor: 'border-pink-500/30 hover:border-pink-400/60',
    glowColor: 'shadow-pink-500/10 hover:shadow-pink-500/30',
    image: './images/cards/love_chill.webp',
  },
  {
    key: 'jtec_main',
    title: 'JTEC MUSIC',
    subtitle: 'Mainstream Music, Super Bass & Other Genres',
    badge: 'Super Bass & Mainstream',
    tag: 'Curated Catalog',
    description: 'Deep super bass, electronic energy, hip-hop, club mixes and mainstream hits.',
    actionText: 'Explore Catalog',
    themeColor: '#00f0ff',
    accentBg: 'from-cyan-950/80 via-slate-900/90 to-slate-950',
    borderColor: 'border-cyan-500/30 hover:border-cyan-400/60',
    glowColor: 'shadow-cyan-500/10 hover:shadow-cyan-500/30',
    image: './images/cards/jtec_main.webp',
  },
  {
    key: 'jamendo',
    title: 'JAMENDO',
    subtitle: 'Independent Music Catalog',
    badge: 'Free & Legal',
    tag: 'Jamendo Catalog',
    description: 'Explore and download independent music across multiple genres directly from Jamendo.',
    actionText: 'Explore Jamendo',
    themeColor: '#06b6d4',
    accentBg: 'from-cyan-950/80 via-purple-950/40 to-slate-950',
    borderColor: 'border-cyan-500/30 hover:border-cyan-400/60',
    glowColor: 'shadow-cyan-500/10 hover:shadow-cyan-500/30',
    image: './images/cards/jamendo.webp',
  },
  {
    key: 'archive_nasheed',
    title: 'ARCHIVE NASHEEDS',
    subtitle: 'Preserved Audio from Internet Archive',
    badge: 'Internet Archive',
    tag: 'Free Audio',
    description: 'Thousands of historical and modern nasheeds preserved on archive.org. Stream or download offline.',
    actionText: 'Explore Archive',
    themeColor: '#8b5cf6',
    accentBg: 'from-purple-950/80 via-cyan-950/40 to-slate-950',
    borderColor: 'border-cyan-500/30 hover:border-cyan-400/60',
    glowColor: 'shadow-cyan-500/10 hover:shadow-cyan-500/30',
    image: './images/cards/archive_nasheed.webp',
  },
];
