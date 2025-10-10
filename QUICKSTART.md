# ⚡ Quick Start - Farcaster Mini App

## TL;DR - Get Running in 5 Minutes

### 1. Understand What Happened
Your app now works as BOTH:
- ✅ Regular website (unchanged)
- ✅ Farcaster Mini App (enhanced)

**Nothing broke. Everything still works.**

### 2. Required Actions (Before Production)

#### A. Sign Your Manifest (2 minutes)
1. Go to: https://farcaster.xyz/~/developers/mini-apps/manifest
2. Enter your domain
3. Copy the signed data
4. Paste into `public/.well-known/farcaster.json`

#### B. Update URLs (1 minute)
Set environment variable:
```bash
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

Or manually replace `lemon-loopa-ui.vercel.app` in:
- `public/.well-known/farcaster.json`
- `src/app/layout.tsx`
- `src/app/perp/metadata.ts`
- `src/app/positions/metadata.ts`

#### C. Deploy
```bash
git add .
git commit -m "Add Farcaster Mini App support"
git push
```

### 3. Test It

#### Test as Website
```bash
npm run dev
# Visit: http://localhost:3000
```

#### Test as Mini App
```bash
# 1. Run dev server
npm run dev

# 2. Expose with ngrok
ngrok http 3000

# 3. Test with preview tool
# https://farcaster.xyz/~/developers/mini-apps/preview?url=YOUR_NGROK_URL
```

### 4. That's It! 🎉

Your app now:
- ✅ Works on web (unchanged)
- ✅ Works in Farcaster (enhanced)
- ✅ Can be shared with rich embeds
- ✅ Users can add to their collection
- ✅ Supports sharing trades

## How to Use New Features

### Share a Trade
```tsx
import { useMiniAppActions } from '@/hooks/useMiniAppActions'

function TradeSuccess() {
  const { composeCast } = useMiniAppActions()
  
  const share = () => composeCast({
    text: "Just made a trade! 🚀",
    embeds: [window.location.href]
  })
  
  return <button onClick={share}>Share</button>
}
```

### Check if in Mini App
```tsx
import { useMiniApp } from '@/components/providers/MiniAppProvider'

function Component() {
  const { isMiniApp, context } = useMiniApp()
  
  if (isMiniApp) {
    return <div>Hello {context?.user.username}!</div>
  }
  
  return <div>Regular website</div>
}
```

### Use Share Button
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

## Files You Can Customize

### App Metadata
`public/.well-known/farcaster.json` - App name, description, icons

### Page Embeds
- `src/app/layout.tsx` - Home page embed
- `src/app/perp/metadata.ts` - Trading page embed
- `src/app/positions/metadata.ts` - Positions page embed

### Mini App Behavior
- `src/components/providers/MiniAppProvider.tsx` - Detection & init
- `src/hooks/useMiniAppActions.ts` - SDK action wrappers

## Need More Details?

- **Complete Guide**: Read `MINIAPP_INTEGRATION.md`
- **Deployment Steps**: Read `DEPLOYMENT_CHECKLIST.md`
- **Technical Docs**: Read `MINIAPP_SETUP.md`

## Common Questions

**Q: Will my website still work?**
A: Yes! 100%. Nothing changes for web users.

**Q: Do I need to change my code?**
A: No. Mini App features are optional enhancements.

**Q: What if I want to remove Mini App features?**
A: Just delete the MiniAppProvider and hooks. Website keeps working.

**Q: How do I test without deploying?**
A: Use ngrok + preview tool (see above).

**Q: When will my app appear in Farcaster?**
A: After signing manifest, it's indexed within 24-48 hours.

## Help & Support

- 📖 [Docs](https://miniapps.farcaster.xyz)
- 💬 [Dev Chat](https://farcaster.xyz/~/group/X2P7HNc4PHTriCssYHNcmQ)
- 🐛 Issues? Check `DEPLOYMENT_CHECKLIST.md`

---

**You're ready! Just sign your manifest and deploy! 🚀**
