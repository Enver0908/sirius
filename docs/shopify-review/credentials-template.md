# Sirius - Credentials and Submission Packet

| Field | Value |
| --- | --- |
| App Name | Sirius |
| Review Store | sirius-se8mmhcq.myshopify.com |
| Reviewer Account | TODO: create/provide reviewer login if Shopify review page asks for one |
| Support Email | TODO: enter the public support email used in the listing |
| Emergency Contact | TODO: enter emergency developer email and phone in Partner Dashboard |
| Production URL | https://app.siriusai.store |
| Privacy Policy URL | https://app.siriusai.store/privacy-policy |
| Terms of Service URL | https://app.siriusai.store/terms-of-service |

## Final local submission status - 2026-05-13

- Shopify CLI config released: `sirius-review-2026-05-13-final`
- Deploy archive prepared: `C:\Users\Dell\OneDrive\Masaüstü\ide\sirius-review-deploy-20260513-final.tar.gz`
- Backend tests passed: `npm run test:context-routing`, `npm run test:token-optimization`
- Backend production audit passed: `npm audit --omit=dev`
- Frontend production build passed: `npm run build`
- Frontend production audit passed: `npm audit --omit=dev`
- Local production readiness guard passed with `NODE_ENV=production` and `APP_URL=https://app.siriusai.store`
- Local multi-tenant integrity guard passed
- Live health passed: `https://app.siriusai.store/health`
- Live legal pages passed: privacy policy and terms pages return 200
- Live CSP passed: `frame-ancestors https://*.myshopify.com https://admin.shopify.com;`
- Live protected endpoint passed: sessionless `/api/shops/me` returns 401

## Manual Partner Dashboard items

- Fill the TODO fields above.
- Upload a 1200 x 1200 PNG/JPEG app icon if not already present.
- Complete the Shopify App Store review page automated checks.
- Submit from the Partner Dashboard status banner after all mandatory fields are green.
