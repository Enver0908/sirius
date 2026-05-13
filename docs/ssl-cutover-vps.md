# SSL Cutover For `app.siriusai.store`

Status on 2026-05-13: SSL is already live. Keep this document as the recovery/setup checklist if the VPS or certificate setup needs to be rebuilt.

This sequence keeps Shopify embedded app requirements intact.

## 1. Prepare certbot webroot on VPS

```bash
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot
```

## 2. Install the ready nginx config

Copy [nginx.siriusai.conf](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/nginx.siriusai.conf) to:

```bash
sudo cp /opt/sirius-main/nginx.siriusai.conf /etc/nginx/sites-available/siriusai.conf
sudo ln -sfn /etc/nginx/sites-available/siriusai.conf /etc/nginx/sites-enabled/siriusai.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 3. Issue the certificate

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d app.siriusai.store
```

## 4. Reload nginx with the live certificate

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Verify HTTPS

```bash
curl -I https://app.siriusai.store
curl -I http://app.siriusai.store
```

Expected result:
- HTTPS should return a real response.
- HTTP should redirect to HTTPS.

## 6. Verify the app environment on VPS

The VPS `.env` should contain:

```env
APP_URL=https://app.siriusai.store
NODE_ENV=production
SHOPIFY_APP_HANDLE=sirius-store-assistant
```

## 7. Shopify config

Production is now configured in [shopify.app.toml](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/shopify.app.toml). [shopify.app.production.toml](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/shopify.app.production.toml) is kept as a matching reference copy for:
- `application_url`
- auth callback
- compliance webhook URLs

## 8. Re-test compliance-critical flows

- embedded app launch from Shopify Admin
- OAuth install/auth callback
- billing approval callback
- `customers/data_request`
- `customers/redact`
- `shop/redact`

Do not switch Shopify production app URLs away from `https://app.siriusai.store` unless the replacement domain already has valid HTTPS and has been verified end to end.
