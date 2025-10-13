# Image Configuration Summary

## Supported Image Domains

The following external image domains are configured in `next.config.ts` to support token logos from various sources:

### Search Result Images
- **dd.dexscreener.com** - DexScreener token images
- **assets.geckoterminal.com** - GeckoTerminal token images

### Fallback/Additional Sources
- **assets.coingecko.com** - CoinGecko token images
- **coin-images.coingecko.com** - CoinGecko alternative domain
- **s2.coinmarketcap.com** - CoinMarketCap token images
- **via.placeholder.com** - Placeholder images for development

## TokenImage Component Features

The `TokenImage` component (`/src/components/ui/TokenImage.tsx`) provides:

- **Graceful Fallbacks**: Shows token symbol initials if image fails to load
- **Error Handling**: Automatically switches to fallback on image load errors  
- **Unoptimized Loading**: Uses unoptimized loading for external domains to prevent caching issues
- **Consistent Styling**: Maintains consistent size and styling across the app

## Usage

```tsx
import { TokenImage } from '@/components/ui/TokenImage';

<TokenImage
  src={tokenImageUrl}
  symbol="USDC"
  size={32}
  className="rounded-full"
/>
```

## Error Prevention

All external image domains are properly configured to prevent Next.js image optimization errors. The component automatically handles:

- Missing image URLs
- Failed image loads
- Network timeouts
- Invalid image formats

## Performance Notes

- External images use `unoptimized={true}` to prevent Next.js optimization conflicts
- Fallback text uses CSS for immediate display
- Image errors are handled client-side for better UX
