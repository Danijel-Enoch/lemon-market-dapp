# 🎉 Lemon Markets - Now a Farcaster Mini App!

## ✨ What Changed

Your Lemon Markets trading platform is now **fully integrated as a Farcaster Mini App** while maintaining 100% backward compatibility as a regular website.

## 📦 New Files Added

### Core Infrastructure
- ✅ `src/components/providers/MiniAppProvider.tsx` - Detects and initializes Mini App
- ✅ `src/hooks/useMiniAppActions.ts` - Helper hook for SDK actions
- ✅ `src/lib/miniapp-utils.ts` - Utility functions for embeds

### UI Components
- ✅ `src/components/ui/ShareTradeButton.tsx` - Share trades to Farcaster

### Configuration
- ✅ `public/.well-known/farcaster.json` - Mini App manifest
- ✅ `src/app/perp/metadata.ts` - Trading page embed
- ✅ `src/app/positions/metadata.ts` - Positions page embed

### Documentation
- ✅ `QUICKSTART.md` - 5-minute quick start guide
- ✅ `MINIAPP_INTEGRATION.md` - Complete setup guide  
- ✅ `MINIAPP_SETUP.md` - Technical documentation
- ✅ `MINIAPP_SUMMARY.md` - Summary of changes
- ✅ `DEPLOYMENT_CHECKLIST.md` - Pre-deployment checklist
- ✅ `README_MINIAPP.md` - This file

## 🔄 Modified Files

- ✅ `src/app/layout.tsx` - Added MiniAppProvider, embeds, metadata
- ✅ `src/app/page.tsx` - Updated to use useMiniApp hook
- ✅ `src/components/layout/Header.tsx` - Added safe area insets
- ✅ `src/lib/wagmi.ts` - Added Mini App connector support
- ✅ `.env.example` - Added NEXT_PUBLIC_APP_URL

## 🚀 Features Added

### For Mini App Users
1. **Rich Embeds** - Pages shared in Farcaster show beautiful cards
2. **Easy Sharing** - Share trades directly to feed with one click
3. **Add to Collection** - Users can add app to their Farcaster apps
4. **Seamless UX** - No wallet popups, smooth integration
5. **Safe Area Support** - Perfect rendering on mobile devices

### For Regular Website
**Nothing changed!** All existing functionality works exactly as before.

## 🎯 How to Use

### Development
```bash
# Install dependencies
npm install

# Run development server  
npm run dev

# Build for production
npm run build
```

### Testing Mini App Locally
```bash
# 1. Run dev server
npm run dev

# 2. Expose localhost (install ngrok first)
ngrok http 3000

# 3. Test at:
# https://farcaster.xyz/~/developers/mini-apps/preview?url=YOUR_NGROK_URL
```

### Using Mini App Features in Code

#### Check if in Mini App
```tsx
import { useMiniApp } from '@/components/providers/MiniAppProvider'

const { isMiniApp, context } = useMiniApp()

if (isMiniApp) {
  console.log('User FID:', context?.user.fid)
}
```

#### Share to Farcaster
```tsx
import { useMiniAppActions } from '@/hooks/useMiniAppActions'

const { composeCast } = useMiniAppActions()

await composeCast({
  text: "Check out my trade! 🚀",
  embeds: [window.location.href]
})
```

#### Use Share Button
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

## ⚙️ Configuration

### Environment Variables
```bash
# .env.local
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Before Deploying

1. **Sign Manifest** (REQUIRED)
   - Visit: https://farcaster.xyz/~/developers/mini-apps/manifest
   - Enter your domain
   - Copy signed data to `public/.well-known/farcaster.json`

2. **Update URLs** (REQUIRED)
   - Set `NEXT_PUBLIC_APP_URL` environment variable
   - OR manually update in all metadata files

3. **Test**
   - Use preview tool
   - Test embeds
   - Verify wallet connection

## 📊 Architecture

```
┌─────────────────────────────────────┐
│         Your Application            │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────────────────┐  │
│  │   MiniAppProvider            │  │
│  │   - Auto-detects environment │  │
│  │   - Initializes SDK          │  │
│  │   - Provides context         │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Your Components            │  │
│  │   - Use useMiniApp()         │  │
│  │   - Use useMiniAppActions()  │  │
│  │   - Work in both modes       │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

## 🔐 Security

- ✅ Manifest signing verifies ownership
- ✅ SDK validates all actions
- ✅ Wallet integration through trusted providers
- ✅ No user data stored by Mini App infrastructure

## 📈 Benefits

### Discoverability
- Listed in Farcaster app directory
- Searchable by users
- Appears in recommendations

### User Engagement  
- Easy to share trades
- Viral growth through social feeds
- Users can add to collection

### Developer Experience
- Works as regular website
- No breaking changes
- Optional enhancements
- Well-documented

## 🐛 Troubleshooting

### Issue: Infinite loading screen
**Fix:** MiniAppProvider handles this automatically. Check console for errors.

### Issue: Manifest not valid
**Fix:** Ensure domain matches exactly and manifest is signed.

### Issue: Not appearing in search
**Fix:** Sign manifest, wait 24-48 hours for indexing.

### Issue: Wallet not connecting
**Fix:** Verify `@farcaster/miniapp-wagmi-connector` is installed.

## 📚 Documentation

- **QUICKSTART.md** - Get started in 5 minutes
- **MINIAPP_INTEGRATION.md** - Complete setup guide
- **DEPLOYMENT_CHECKLIST.md** - Pre-flight checklist
- **MINIAPP_SETUP.md** - Technical documentation

## 🔗 Resources

- [Mini Apps Docs](https://miniapps.farcaster.xyz)
- [SDK Reference](https://miniapps.farcaster.xyz/docs/sdk)
- [Developer Tools](https://farcaster.xyz/~/developers)
- [Dev Chat](https://farcaster.xyz/~/group/X2P7HNc4PHTriCssYHNcmQ)

## ✅ Next Steps

1. Read `QUICKSTART.md` for immediate actions
2. Sign your manifest
3. Update URLs
4. Deploy
5. Test with preview tool
6. Share your first embed!

---

**Built with ❤️ for Lemon Markets and the Farcaster ecosystem**

Your app is now ready to reach millions of Farcaster users! 🚀🍋
