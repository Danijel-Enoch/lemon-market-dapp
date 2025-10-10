# 🍋 Lemon Markets - Farcaster Mini App Integration

## ✅ What Has Been Done

Your Lemon Markets app has been successfully converted to work as both a **regular website** and a **Farcaster Mini App**. Here's what was implemented:

### 1. Core Mini App Infrastructure

✅ **Mini App Provider** (`src/components/providers/MiniAppProvider.tsx`)
- Automatically detects if running in Mini App environment
- Initializes SDK and signals ready state
- Provides context to all components

✅ **Mini App Context Hook** (`useMiniApp`)
- Access Mini App state: `isMiniApp`, `isLoading`, `context`
- Get user info, client details, and location context

✅ **Mini App Actions Hook** (`src/hooks/useMiniAppActions.ts`)
- Wrapper for SDK actions with fallbacks
- `composeCast()` - Share to feed
- `addMiniApp()` - Add app to user's collection
- `openUrl()` - Open external URLs

### 2. Manifest & Embeds

✅ **Manifest File** (`public/.well-known/farcaster.json`)
- Configured with app metadata
- Ready for domain signing
- Includes all required fields

✅ **Page Embeds**
- Home page (`/`) - Landing page embed
- Perpetuals (`/perp`) - Trading page embed  
- Positions (`/positions`) - Portfolio embed

✅ **Metadata Configuration**
- OpenGraph tags for social sharing
- Mini App embed metadata on all pages
- Optimized images and descriptions

### 3. UI Enhancements

✅ **Safe Area Insets**
- Header respects device safe areas
- Properly renders on mobile Mini Apps

✅ **Share Trade Button** (`src/components/ui/ShareTradeButton.tsx`)
- Share trades to Farcaster
- Add app to collection
- Only visible in Mini App mode

### 4. Dual-Mode Support

✅ The app works seamlessly in both modes:
- **Regular Website**: Full functionality, no changes needed
- **Mini App**: Enhanced with SDK features, safe areas, sharing

## 🚀 Next Steps

### Step 1: Sign Your Manifest

1. Visit https://farcaster.xyz/~/developers/mini-apps/manifest
2. Enter your domain (e.g., `lemon-loopa-ui.vercel.app` or `yourdomain.com`)
3. Copy the signed `accountAssociation` object
4. Update `public/.well-known/farcaster.json`:

```json
{
  "accountAssociation": {
    "header": "PASTE_HERE",
    "payload": "PASTE_HERE", 
    "signature": "PASTE_HERE"
  },
  // ... rest stays the same
}
```

### Step 2: Update Domain URLs

Replace `lemon-loopa-ui.vercel.app` with your actual domain in:

1. `public/.well-known/farcaster.json`
2. `src/app/layout.tsx` (line ~35-45)
3. `src/app/perp/metadata.ts`
4. `src/app/positions/metadata.ts`

### Step 3: Test Locally

```bash
# Install dependencies (if not done)
npm install

# Run dev server
npm run dev

# Expose with ngrok
ngrok http 3000
```

Then test at: https://farcaster.xyz/~/developers/mini-apps/preview

### Step 4: Deploy & Publish

1. Deploy to your hosting platform
2. Sign manifest with production domain
3. Test with preview tool
4. Your app will be automatically indexed!

## 📖 How to Use

### Check if in Mini App

```tsx
import { useMiniApp } from '@/components/providers/MiniAppProvider'

function MyComponent() {
  const { isMiniApp, context } = useMiniApp()
  
  if (isMiniApp) {
    console.log('User FID:', context?.user.fid)
  }
}
```

### Use Mini App Actions

```tsx
import { useMiniAppActions } from '@/hooks/useMiniAppActions'

function TradeComponent() {
  const { composeCast, addMiniApp } = useMiniAppActions()
  
  const shareWin = async () => {
    await composeCast({
      text: "Just made a profitable trade on @lemonmarkets! 🍋",
      embeds: [window.location.href]
    })
  }
}
```

### Add Share Button

```tsx
import { ShareTradeButton } from '@/components/ui/ShareTradeButton'

<ShareTradeButton 
  tradeDetails={{
    pair: "BTC/USDT",
    type: "long",
    leverage: 10,
    amount: "100"
  }}
/>
```

## 🎯 Features Available

### In Mini App Mode
- ✅ Share trades to Farcaster feed
- ✅ Add app to user's collection
- ✅ Access user's Farcaster profile
- ✅ Safe area insets for mobile
- ✅ Wallet integration via SDK
- ✅ Rich embeds when shared

### In Website Mode
- ✅ All existing functionality
- ✅ Regular wallet connections
- ✅ No Mini App UI elements

## 🔍 Testing

### Local Testing
```bash
npm run dev
# Then use ngrok and preview tool
```

### Preview Tool
https://farcaster.xyz/~/developers/mini-apps/preview?url=YOUR_URL

### Embed Testing
https://farcaster.xyz/~/developers/mini-apps/embed

## 📚 Resources

- [Mini Apps Documentation](https://miniapps.farcaster.xyz)
- [SDK Reference](https://miniapps.farcaster.xyz/docs/sdk)
- [Publishing Guide](https://miniapps.farcaster.xyz/docs/guides/publishing)
- [Example Apps](https://farcaster.xyz/miniapps)

## ❓ Troubleshooting

### Infinite Loading Screen
- Make sure `sdk.actions.ready()` is called (handled by MiniAppProvider)

### Manifest Not Valid
- Ensure domain exactly matches hosting domain
- Sign manifest with correct domain
- Check all URLs are HTTPS

### Wallet Not Connecting
- Install `@farcaster/miniapp-wagmi-connector`
- User needs to connect wallet in Mini App

### Not Appearing in Search
- Manifest must be signed
- App needs minimum usage
- Images must be valid
- Domain must be production (not ngrok)

## 🤝 Support

- [Developer Chat](https://farcaster.xyz/~/group/X2P7HNc4PHTriCssYHNcmQ)
- [Farcaster Team](https://farcaster.xyz/~/channel/dev)

---

Built with ❤️ for the Farcaster ecosystem
