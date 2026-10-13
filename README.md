# AK PACK FITNESS Attendance

Responsive attendance terminal and Google Sheets-backed attendance history for AK PACK FITNESS.

## What is included

- Numeric-only membership ID lookup with no four-digit cap, or lookup by registered mobile number.
- Member active/expiry validation before clock-in.
- Duplicate active clock-ins are blocked.
- Clock-out is rejected unless an active clock-in exists; a rejected clock-out does not write a successful record.
- Successful clock-in/out entries are written to the Google Sheet's `ATTENDANCE` tab.
- Admin-PIN-protected attendance search by date, month, time, member name, membership ID, or mobile.
- Member profile history view from attendance search.
- Responsive dark charcoal/orange UI.

## Google Sheets and Apps Script setup

1. Create or choose a Google Spreadsheet. Keep a copy of the spreadsheet ID from its URL.
2. Create a tab named `MEMBERS` with these headers in row 1 (spelling is important):
   `Membership ID | Name | Mobile | Status | Expiry`
3. Import your real member list under those headers. Membership IDs should remain numeric identifiers stored as text or numbers; the app does not limit them to four digits. Use `active` in Status for active memberships and `inactive` or `expired` for blocked memberships. Expiry is optional; when supplied as a date, members past the expiry date are blocked from clock-in.
4. Open [script.google.com](https://script.google.com/) and create a standalone Apps Script project.
5. Copy the contents of `Code.gs` in this repository into the Apps Script editor and save.
6. In **Project Settings → Script Properties**, add:
   - `SPREADSHEET_ID`: your Google Spreadsheet ID
   - `ADMIN_PIN`: a strong PIN for record searches and client history
7. In the Apps Script editor, choose `setupAttendanceSheets` and run it once. Review the authorization prompt. It creates the `ATTENDANCE` tab and headers if missing; it also creates the `MEMBERS` tab if missing.
8. Choose **Deploy → New deployment → Web app**. Set **Execute as** to your account. Set access to the level your deployment policy requires; the browser terminal needs permission to call the endpoint. Copy the deployed URL ending in `/exec`.
9. Open the published attendance site, expand **Connection settings**, paste the URL, and select **Save & test connection**.
10. Test with a test member first: lookup → Clock In → verify the row in Sheets → Clock Out → verify the row is updated. Also test clock-out without an active session and confirm it returns an error without writing a clock-out.

## GitHub Pages deployment

The `.github/workflows/static.yml` workflow publishes the static site from the `main` branch. In repository settings, make sure Pages is configured to use **GitHub Actions**. GitHub Pages hosts the front-end only; it does not host the Apps Script backend.

## Security and operational notes

- `ADMIN_PIN` protects search/history requests, but it is a lightweight access gate, not enterprise authentication. Use a strong PIN, restrict who receives it, and rotate it if exposed.
- A public Apps Script web app URL is not a secret. The kiosk clock-in/out actions are reachable by anyone who can call that URL. For a public gym kiosk, place the device in a controlled area and consider adding a server-side kiosk token or a proper authenticated backend before treating this as a hardened production system.
- This repository cannot verify a real spreadsheet or deployed Apps Script URL until the owner configures them. The UI deliberately shows an unconfigured/offline state until the URL is supplied and the API responds.
- Verify your spreadsheet timezone and Apps Script project timezone are set to the gym's local timezone (for India, `Asia/Kolkata`).
