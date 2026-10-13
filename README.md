# AK PACK FITNESS Attendance

Responsive attendance terminal and dynamic Google Sheets-backed member management.

## Features

- Variable-length numeric Membership ID lookup and registered mobile lookup.
- Clock-in blocked for inactive/expired members and duplicate active sessions.
- Clock-out requires a matching active clock-in; failed clock-outs do not write a success record.
- Attendance history in Google Sheets, filterable by date, month, time, name, membership ID and mobile.
- Member profile attendance history.
- Admin-PIN-protected member directory: fetch/pull, create, edit, and archive.
- New member IDs are assigned as max existing numeric ID + 1; existing IDs are preserved on edit and archive.
- Responsive dark charcoal/orange terminal.
- Header connection-status button opens the Google Apps Script URL settings.

## Set up Google Sheets

1. Create or choose a Google Spreadsheet and copy its ID from the URL.
2. Create a tab named `MEMBERS` with row-1 headers:
   `Membership ID | Name | Mobile | Status | Expiry`
3. Your existing tab can be named `members` in lowercase; the script locates the tab case-insensitively and does not rename it. It reads the header row dynamically and maps common column names such as Membership ID / Member ID, Name / Client Name, Mobile / Phone Number, Status, and Expiry / Valid Till. No fixed column order is required. After connecting, the app displays the detected column names and which fields were mapped. Membership ID and Name (or supported equivalents) are required for member lookup and edits. Use `active` for active members; use `inactive`, `expired`, `suspended`, or `archived` to block clock-in. Expiry is optional; when present as a valid date, expiry dates before today block clock-in.
4. Set the spreadsheet and Apps Script project time zone to `Asia/Kolkata` for India.

## Deploy the Apps Script backend

1. Open [Google Apps Script](https://script.google.com/) and create a standalone project.
2. Replace the editor contents with the full source from [Code.gs](https://github.com/jarvisbyak-pack/Figma-attendance-ui/blob/main/Code.gs). Save.
3. Open **Project Settings → Script Properties** and add:
   - `SPREADSHEET_ID`: your Google Spreadsheet ID
   - `ADMIN_PIN`: a strong PIN used to authorize member management and attendance history
4. In the editor, run `setupAttendanceSheets` once and approve the requested Google authorization. This creates missing sheet tabs and headers; it does not import or replace your existing member rows.
5. Select **Deploy → New deployment → Web app**. Choose **Execute as: Me** and set access to a level compatible with your kiosk/browser usage. Deploy and copy the URL ending in `/exec`.
6. Open the published attendance app. Click the top-right backend status button, paste the Apps Script URL, and choose **Save & test connection**. The app fetches the actual spreadsheet name, member-tab name, column headers, row count, and field mappings from the backend. The status changes to Google Sheets connected only after a successful ping.
7. Enter your admin PIN in the Attendance filters panel. Use **Pull members from Sheets** to fetch the directory. You can create members, edit fields, and archive members without deleting their attendance history or changing their IDs.
8. Test with a test member: clock in and verify a new row in `ATTENDANCE`; clock out and verify the same row is updated. Then test clock-out without an active clock-in and confirm it is rejected.

## API actions

- Public kiosk actions: `ping`, `lookup`, `clockIn`, `clockOut`
- Admin PIN required: `attendanceSearch`, `memberHistory`, `memberList`, `memberCreate`, `memberUpdate`, `memberArchive`

## GitHub Pages

The `.github/workflows/static.yml` workflow deploys the static frontend from `main`. Confirm the repository's **Settings → Pages → Build and deployment → Source** is set to **GitHub Actions**. The Google Apps Script backend is deployed separately and is not hosted by GitHub Pages.

## Security limitations

- The admin PIN is a lightweight access gate, not enterprise authentication. Use a strong PIN and rotate it if exposed.
- A deployed Apps Script URL is not a secret. The kiosk actions (lookup and attendance writes) can be called by anyone who can reach that endpoint. For production use with sensitive attendance records, consider adding a server-side kiosk token or moving the API behind a properly authenticated backend.
- The repository code cannot verify the spreadsheet or Apps Script deployment until you configure the project and enter its URL. The UI reports connection state based on an actual API ping; it does not fake a connected status.
