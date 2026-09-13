# Dépenses famille — Android

Trusted Web Activity package for the live family expense tracker.

## Identity

- Package ID: `ma.depensesfamille.app`
- Website: `https://family-expense-tracker-gamma-five.vercel.app`
- Minimum Android version: Android 5.0 (API 21)
- Target SDK: API 36

## Build

From this directory:

```powershell
npx --yes @bubblewrap/cli build
```

The build creates:

- `app-release-signed.apk` for direct device testing
- `app-release-bundle.aab` for Google Play Console

## Signing key

`android.keystore` is intentionally ignored by Git. Keep it permanently and back it up securely; future app updates must use the same key. Its password is stored outside this repository as a Windows DPAPI-encrypted file at:

`C:\Users\Youssef\.bubblewrap\family-expense-signing-password.dpapi`

## Google Play signing

The checked-in `public/.well-known/assetlinks.json` contains the local release certificate. After enabling Play App Signing, add the Play Console app-signing SHA-256 fingerprint to that file as a second fingerprint and redeploy the website.
