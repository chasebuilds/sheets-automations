# Limitations

- **Not run against live Google services.** The Apps Script glue in `src/gas/main.ts` (menu, triggers, Drive/Docs calls, `PropertiesService`) compiles and bundles but has not been executed in a real Google account. The logic underneath is unit-tested with fakes. Expect to fix small things on the first real deploy, and test with a throwaway sheet first.
- **Fakes are my model of Apps Script.** If a real service behaves differently from the fake (for example a rounding or type difference in `getValues`), a test can pass while production differs.
- **Time zones.** Date logic uses UTC calendar days plus an optional `TZ_OFFSET_MINUTES`. It does not follow daylight saving changes by itself, so a business in a DST region should update the offset twice a year or accept a one-hour drift near midnight.
- **Gmail quotas.** Consumer Gmail allows roughly 100 recipients a day through Apps Script, and Workspace more. `REMINDER_MAX_PER_RUN` limits one run but does not track the daily total.
- **Reminder opt-out is a column you fill in.** "Reply STOP" is in the email text, but nothing reads replies. Someone has to mark the `Opt Out` cell. This is a courtesy feature, not legal advice on email consent rules.
- **Dedupe is by email, then phone.** Two people sharing one email count as one. `john@x.com` and `j.ohn@x.com` are treated as different addresses.
- **Name cleanup is conservative.** It only fixes names typed fully in one case. It will not repair `mcdonald` into `McDonald`, and non-Latin names are left as typed.
- **Phone formatting is US-only.** Ten-digit and `+1` numbers are formatted. Other numbers are kept as typed.
- **Invoice template text replacement.** Docs `replaceText` treats the replacement as a pattern replacement, so client text containing `$1` style sequences may not appear literally. Invoices are single line item (one row, one description, qty and unit price). There is no multi-line invoice or invoice numbering service.
- **Invoice sheet column order.** Sheet-to-code matching is by header name, so renaming a header breaks that automation with an error naming the missing column.
- **Form cleanup edits.** If someone edits or deletes rows in `Form Responses 1` after they were processed, those changes are not synced to `Master`.
- **OAuth scopes.** The manifest leaves scopes to Apps Script's auto-detection. The Drive and Docs access it requests is broader than strictly needed for one folder.
- **Screenshots are rendered, not captured from Google Sheets.** They are HTML renderings of the sample data after running the real code, to show the layout. They are not screenshots of the Google Sheets interface.
