# AK PACK FITNESS Attendance

Responsive attendance terminal with a shared Google Sheets backend and an Admin Panel for attendance records and member history.

## Features

- Variable-length numeric Membership ID lookup and registered mobile lookup.
- Clock-in photo verification: the kiosk explains the purpose before requesting camera permission; the captured JPEG is sent with the clock-in request and linked to the attendance record when the compatible Apps Script backend is deployed. No photo preview is shown.
- Clock-in is denied for explicitly inactive, blocked, cancelled or suspended members and duplicate active sessions. Expired members may still be recorded for attendance verification; the UI shows the expiry alert.
- Clock-out requires a matching active clock-in; failed clock-outs do not write a success record.
- Attendance history in Google Sheets, filterable by date, month, time, name, membership ID and mobile, with membership expiry shown in the results.
- Member profile attendance history.
- A member directory with search by name, membership ID and mobile, plus membership status and expiry details; access is protected by the configured admin PIN.
- Admin Panel contains attendance search and member attendance history, protected by the configured admin PIN.
- Live Feed polling is active only while the Live Feed view is selected.
- Responsive dark charcoal/orange terminal.
- Header connection-status button opens the Google Apps Script URL settings.

## Set up Google Sheets

1. Create or choose a Google Spreadsheet and copy its ID from the URL.
2. Create a tab named `MEMBERS` with row-1 headers:
   `Membership ID | Name | Mobile | Status | Expiry`
3. Your existing tab can be named `members` in lowercase; the script locates the tab case-insensitively and does not rename it. It reads the header row dynamically and maps common column names such as Membership ID / Member ID, Name / Client Name, Mobile / Phone Number, Status, and Expiry / Valid Till. No fixed column order is required. After connecting, the app displays the detected column names and which fields were mapped. Membership ID and Name (or supported equivalents) are required for member lookup and edits. Use `active` for active members; `inactive`, `blocked`, `cancelled`, or `suspended` explicitly block clock-in. An expiry date before today is shown as expired, but the current attendance policy still allows the clock-in to be recorded for verification.
4. Set the spreadsheet and Apps Script project time zone to `Asia/Kolkata` for India.

## Deploy the Apps Script backend

1. Open your Google Sheet and choose **Extensions → Apps Script** (or open [Google Apps Script](https://script.google.com/)).
2. Paste the latest **Attendance API with Photo Verification** Apps Script source supplied separately into the Apps Script editor and save it. The backend source is intentionally maintained separately from this frontend repository. The backend must include `photoBase64` handling and the `Photo URL` attendance column for photo verification to work.
3. Open **Project Settings → Script Properties** and set `ADMIN_PIN` to a strong PIN used to authorize member management and attendance history. The script is bound to the Google Sheet, so it uses the active spreadsheet rather than a `SPREADSHEET_ID` property.
4. In the editor, run `setupAttendanceSheets` once and approve the requested Google Sheets and Drive permissions. This creates/verifies the attendance headers and a private photo folder without replacing existing member rows.

5. Select **Deploy → New deployment → Web app**. Choose **Execute as: Me** and set access to a level compatible with your kiosk/browser usage. Deploy and copy the URL ending in `/exec`.
6. Open the published attendance app. Click the top-right backend status button, paste the Apps Script URL, and choose **Save & test connection**. The app tests the URL through a GET ping (with a POST fallback), then fetches the actual spreadsheet name, member-tab name, column headers, row count, and field mappings. The status changes to Google Sheets connected only after a successful ping. The URL is saved in that browser on that device; configure the same URL once on each new device. Member records and attendance are shared centrally through the same spreadsheet, but the static GitHub Pages app cannot automatically synchronize a URL setting between devices without an additional central configuration service.
7. Open **Admin Panel**, enter your admin PIN, and use the records filters to search attendance. Click a record to load that member's attendance history.
8. Test with a test member: clock in and verify a new row in `ATTENDANCE`; clock out and verify the same row is updated. Then test clock-out without an active clock-in and confirm it is rejected.

## API actions

- Public kiosk actions: `ping`, `lookup`, `clockIn`, `clockOut`
- Admin PIN required: `attendanceSearch`, `memberHistory`, `memberList`

## GitHub Pages

The `.github/workflows/pages.yml` workflow runs the built-in Node.js regression tests before deploying the static frontend from `main`. Tests validate JavaScript syntax, unique/mapped HTML IDs, sidebar views, expiry UI, member-directory wiring, responsive breakpoints, Live Feed polling guards, and the consent-based photo-capture wiring. Confirm the repository's **Settings → Pages → Build and deployment → Source** is set to **GitHub Actions**. The Google Apps Script backend is deployed separately and is not hosted by GitHub Pages.

## Security limitations

- The admin PIN is a lightweight access gate, not enterprise authentication. Use a strong PIN and rotate it if exposed.
- A deployed Apps Script URL is not a secret. The kiosk actions (lookup and attendance writes) can be called by anyone who can reach that endpoint. For production use with sensitive attendance records, consider adding a server-side kiosk token or moving the API behind a properly authenticated backend.
- The repository code cannot verify the spreadsheet or Apps Script deployment until you configure the project and enter its URL. The UI reports connection state based on an actual API ping; it does not fake a connected status.
