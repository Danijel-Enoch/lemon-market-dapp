# Lemon Markets - Farcaster Mini App

This app functions both as a regular website and as a Farcaster Mini App.

## Mini App Features

- ✅ Auto-detection of Mini App environment
- ✅ Safe area insets support for mobile
- ✅ Shareable embeds for all trading pages
- ✅ Context-aware rendering
- ✅ Seamless wallet integration

## Mini App Setup

### 1. Manifest File

The Mini App manifest is located at `public/.well-known/farcaster.json`. This file needs to be signed with your Farcaster account.

**To sign the manifest:**
1. Visit https://farcaster.xyz/~/developers/mini-apps/manifest
2. Enter your domain (e.g., `lemon-loopa-ui.vercel.app`)
3. Copy the signed `accountAssociation` object
4. Update `public/.well-known/farcaster.json` with the signed data

### 2. Testing Locally

To test the Mini App locally:

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Use ngrok or similar to expose localhost
ngrok http 3000
```

Then use the [Mini App Preview Tool](https://farcaster.xyz/~/developers/mini-apps/preview) with your ngrok URL.

### 3. Deployment

1. Deploy to Vercel or your preferred hosting
2. Update all URLs in:
   - `public/.well-known/farcaster.json`
   - `src/app/layout.tsx` (metadata)
   - `src/app/perp/metadata.ts`
   - `src/app/positions/metadata.ts`

3. Sign your manifest with the production domain
4. Test using the Mini App Preview Tool

## Architecture

### Dual-Mode Support

The app automatically detects whether it's running as a Mini App or regular website:

```tsx
import { useMiniApp } from '@/components/providers/MiniAppProvider'

function MyComponent() {
  const { isMiniApp, context } = useMiniApp()
  
  if (isMiniApp) {
    // Mini App specific features
    console.log('User FID:', context?.user.fid)
  }
  
  return <div>Content works in both modes</div>
}
```

### Key Components

- **MiniAppProvider** (`src/components/providers/MiniAppProvider.tsx`): Detects and initializes Mini App environment
- **useMiniApp** hook: Access Mini App context and state
- **useMiniAppActions** hook (`src/hooks/useMiniAppActions.ts`): Wrapper for SDK actions with fallbacks

### Safe Area Insets

The Header component automatically applies safe area insets when running as a Mini App:

```tsx
const safeAreaStyle = isMiniApp && context?.client.safeAreaInsets ? {
  paddingTop: context.client.safeAreaInsets.top,
} : {};
```

## Embeds

Each page can be shared as a Mini App embed:

- **Home** (`/`): Main landing page
- **Perpetuals** (`/perp`): Trading interface
- **Positions** (`/positions`): User positions

Embeds are configured in:
- `src/app/layout.tsx` (root)
- `src/app/perp/metadata.ts`
- `src/app/positions/metadata.ts`

## Publishing

1. **Sign manifest**: Use Farcaster Developer Tools
2. **Test embeds**: Use the Preview Tool
3. **Submit for discovery**: Your app will be indexed automatically once the manifest is valid

## Resources

- [Farcaster Mini Apps Documentation](https://miniapps.farcaster.xyz)
- [SDK Reference](https://miniapps.farcaster.xyz/docs/sdk)
- [Publishing Guide](https://miniapps.farcaster.xyz/docs/guides/publishing)
