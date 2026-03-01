# Tennis Booking Application

A lightweight tennis lesson booking app for student management, lesson packages, and payment tracking.

## Features

- Book tennis lessons by lesson type: private, semi-private, and group
- Separate options for kids and adults
- Track students and their lesson balances
- Store each client contact number
- Record payments and purchased lesson counts
- Prevent booking when a student has no remaining paid lessons
- Admin login and protected admin panel
- WhatsApp booking alerts and reminders (Twilio)

## Run

```bash
cd /home/arbab/booking-app
npm start
```

Open:

- http://localhost:3000/
- http://localhost:3000/login

Default admin password:

- `admin1234`

Set your own password:

```bash
ADMIN_PASSWORD='your-secure-password' npm start
```

Enable WhatsApp reminders to your number (Twilio):

```bash
TWILIO_ACCOUNT_SID='ACxxxx' \
TWILIO_AUTH_TOKEN='xxxx' \
TWILIO_WHATSAPP_FROM='whatsapp:+14155238886' \
ADMIN_WHATSAPP_TO='whatsapp:+9715XXXXXXXX' \
REMINDER_MINUTES_BEFORE='180' \
APP_TIMEZONE='Asia/Dubai' \
npm start
```

## Data model

Stored in `data/db.json`:

- `services`: lesson catalog (private/semi-private/group + kids/adults)
- `students`: student profiles
- `students.contactNo`: client contact number
- `payments`: amount paid in AED + lessons purchased
- `slots`: available lesson time slots
- `bookings`: confirmed bookings

## Mobile install and deployment

- Responsive UI is enabled for phones and tablets.
- PWA install support is enabled via `manifest.webmanifest` and `sw.js`.
- Capacitor native projects are included in `android/` and `ios/`.

Native minimum OS versions configured in this repo:

- Android min SDK `22` (Android 5.1+), target SDK `34`
- iOS deployment target `13.0+`

### Build prerequisites

- Node.js `18+`
- Android Studio + JDK 17 (for APK/AAB)
- Xcode + CocoaPods on macOS (for IPA)

### Capacitor workflow

1. Put your deployed HTTPS URL in `capacitor.config.json`:

```json
{
  "appId": "com.aatech.tennisbook",
  "appName": "Tennis Book App",
  "webDir": "public",
  "server": {
    "url": "https://your-domain.com",
    "cleartext": false
  }
}
```

2. Sync native projects:

```bash
npm run cap:sync
```

### Android APK / AAB

Debug APK:

```bash
npm run android:build:debug
```

Output:

- `android/app/build/outputs/apk/debug/app-debug.apk`

Release AAB (Play Store):

```bash
npm run android:build:release
```

Output:

- `android/app/build/outputs/bundle/release/app-release.aab`

### iOS IPA

1. Open Xcode project:

```bash
npm run cap:open:ios
```

2. In Xcode: Product -> Archive -> Distribute App (`.ipa`).

Note:

- iOS does not support APK; Android uses APK/AAB.

## Free deployment (Render)

1. Push this project to a GitHub repository.
2. In Render dashboard: `New +` -> `Blueprint`.
3. Connect your GitHub repo and deploy using [render.yaml](/home/arbab/booking-app/render.yaml).
4. Set `ADMIN_PASSWORD` in Render environment variables.
5. Optional: set Twilio vars for WhatsApp reminders.

After deployment, your app URL will look like:

- `https://tennis-book-app.onrender.com`

Important:

- This app currently stores data in `data/db.json` on local disk.
- On free cloud instances, disk can reset on redeploy/restart, so data may be lost.
