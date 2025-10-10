# 🚀 Mini App Deployment Checklist

## Before Deployment

### 1. Environment Setup
- [ ] Copy `.env.example` to `.env.local`
- [ ] Set `NEXT_PUBLIC_APP_URL` to your production domain
- [ ] Verify all other environment variables are set

### 2. Domain Configuration
- [ ] Choose your production domain (e.g., `lemonmarkets.xyz`)
- [ ] Update URLs in the following files:
  - [ ] `public/.well-known/farcaster.json` - All URLs
  - [ ] `src/app/layout.tsx` - Metadata URLs
  - [ ] `src/app/perp/metadata.ts` - Embed URLs
  - [ ] `src/app/positions/metadata.ts` - Embed URLs

### 3. Manifest Signing (CRITICAL)
- [ ] Visit https://farcaster.xyz/~/developers/mini-apps/manifest
- [ ] Enter your **exact** production domain
- [ ] Copy the signed `accountAssociation` object
- [ ] Paste into `public/.well-known/farcaster.json`
- [ ] Verify domain matches exactly (including subdomain)

## Testing

### Local Testing
```bash
# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Test as website
# Open: http://localhost:3000

# 4. Test as Mini App (requires tunnel)
# Install ngrok: brew install ngrok
ngrok http 3000

# 5. Test with preview tool
# https://farcaster.xyz/~/developers/mini-apps/preview?url=YOUR_NGROK_URL
```

### Testing Checklist
- [ ] Website mode works (all existing features)
- [ ] Mini App detection works
- [ ] Header safe area insets work on mobile
- [ ] Wallet connection works
- [ ] Share button appears in Mini App mode
- [ ] Share button hidden in website mode
- [ ] All trading features work
- [ ] Position viewing works

## Deployment

### 1. Deploy Application
```bash
# Build and test locally first
npm run build
npm start

# Deploy to your platform (Vercel, etc.)
git push origin main
```

### 2. Verify Deployment
- [ ] App loads at production domain
- [ ] Manifest accessible at `yourdomain.com/.well-known/farcaster.json`
- [ ] Images load correctly
- [ ] No console errors

### 3. Test Mini App Features

#### Preview Tool Test
- [ ] Visit: https://farcaster.xyz/~/developers/mini-apps/preview
- [ ] Enter your domain URL
- [ ] Verify app loads correctly
- [ ] Check splash screen appears
- [ ] Confirm app becomes interactive

#### Embed Test
- [ ] Visit: https://farcaster.xyz/~/developers/mini-apps/embed
- [ ] Test each page URL:
  - [ ] `yourdomain.com` (home)
  - [ ] `yourdomain.com/perp` (trading)
  - [ ] `yourdomain.com/positions` (positions)
- [ ] Verify images display (3:2 ratio)
- [ ] Check button text is correct

#### Manifest Validation
- [ ] Visit: https://farcaster.xyz/~/developers/mini-apps/manifest?domain=YOURDOMAIN
- [ ] Verify manifest is valid
- [ ] Check all fields are populated
- [ ] Confirm signature is correct

## Post-Deployment

### 1. Share & Test
- [ ] Share a link in Farcaster cast
- [ ] Verify rich embed appears
- [ ] Click "Start Trading" button
- [ ] Confirm Mini App opens
- [ ] Test wallet connection
- [ ] Try sharing a trade

### 2. Add App Feature
- [ ] Open your Mini App
- [ ] Click "Add App" button
- [ ] Verify prompt appears
- [ ] Add app to collection
- [ ] Check app appears in your apps list

### 3. Monitor & Optimize
- [ ] Check developer console for errors
- [ ] Monitor Mini App analytics (when available)
- [ ] Test on multiple devices/clients
- [ ] Gather user feedback

## Common Issues & Solutions

### Issue: Infinite Loading Screen
**Solution:** 
- SDK should auto-call `ready()` via MiniAppProvider
- Check browser console for errors
- Verify no JavaScript errors blocking execution

### Issue: Manifest Not Valid
**Solutions:**
- [ ] Domain in manifest matches hosting domain exactly
- [ ] All URLs use HTTPS
- [ ] Images are accessible and correct format
- [ ] Signature is for correct domain

### Issue: App Not in Search
**Solutions:**
- [ ] Manifest must be signed
- [ ] App needs minimum usage
- [ ] Wait 24-48 hours for indexing
- [ ] Ensure not using tunnel domain

### Issue: Wallet Not Connecting
**Solutions:**
- [ ] Verify `@farcaster/miniapp-wagmi-connector` installed
- [ ] Check wallet connection in Farcaster client
- [ ] Test on different devices

### Issue: Share Button Not Working
**Solutions:**
- [ ] Check `useMiniAppActions` import
- [ ] Verify SDK initialized
- [ ] Check `isMiniApp` is true
- [ ] Look for errors in console

## Resources

- [Mini Apps Docs](https://miniapps.farcaster.xyz)
- [SDK Reference](https://miniapps.farcaster.xyz/docs/sdk)
- [Developer Tools](https://farcaster.xyz/~/developers)
- [Dev Support](https://farcaster.xyz/~/group/X2P7HNc4PHTriCssYHNcmQ)

## Success Criteria

Your Mini App is successfully deployed when:

✅ Manifest is signed and valid
✅ App loads in preview tool
✅ Embeds render correctly when shared
✅ Users can add app to collection
✅ Wallet connection works
✅ Share functionality works
✅ Website mode still functions
✅ App appears in Farcaster search (after indexing)

---

**Ready to deploy? Follow this checklist step by step! 🚀**
