# Sign in with Google

The sign-in screen shows **Continue with Google** above the email form. The button
appears only when the server has a Google client. On misomoon Cloud, it is on.

## Sign in or sign up

1. On the sign-in screen, select **Continue with Google**.
2. Choose your Google account, and allow misomoon to read your name and email address.
3. Google sends you back to the dashboard, signed in.

The first time, misomoon creates your account with the email address Google has verified
and your name, plus a team named after you, the same as an email sign-up. A Google account
without a verified address can't create an account this way.

After that, misomoon recognizes the Google account by its own id, so changing your email
address at Google doesn't change which misomoon account opens. Another Google account that
later gets the same address doesn't open it.

An account made this way has no password. To sign in with your email too, go to
**Settings** > **Account**, type a password of at least 10 characters in **Set a
password**, and select **Save**.

## Connect Google to an account with a password

misomoon doesn't confirm email addresses at sign-up, so a Google account never opens an
existing account just because the email addresses match. Connect it yourself:

1. Sign in with your email and password.
2. Go to **Settings** > **Account**. Under **Sign in with**, select **Connect** next to
   Google.
3. Choose your Google account.

The Google account can have any email address. Each misomoon account connects one Google
account. Connecting another replaces the first.

To disconnect Google, select **Disconnect** next to it. An account without a password
can't disconnect its only way to sign in: instead of **Disconnect**, the dashboard says
to set a password first.

## Accept an invitation

Open the invitation link, and select **Continue with Google**. The Google account's
verified email address must be the invited one. Without a misomoon account, the sign-in
creates it and joins the team or site. It doesn't create a team of your own. This works
on servers where sign-up is by invitation too.

## Who can sign up

Sign-up follows `SIGNUPS` ([Variables](configuration.md#variables)), the same as the email
form: anyone when it is unset or `open`, only the first account when it is `invite`, and
no one when it is `closed`. An invitation works in every mode.

## Set it up on your own server

Sign-in needs a Google OAuth client, and its id and secret as Worker secrets. Use the
address you open the dashboard on in the redirect URI: misomoon builds it from the
request's own origin, not from `PUBLIC_URL`.

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), open
   or create an **OAuth client ID** of type **Web application**. The Google import uses the
   same client ([Bring your history](import.md)).
2. Under **Authorized redirect URIs**, add
   `https://<your misomoon address>/api/v1/auth/oauth/google/callback`. For local
   development with `wrangler dev`, add `http://localhost:8787/api/v1/auth/oauth/google/callback`
   too.
3. Under **Data access**, add the scopes `openid`, `email`, and `profile`. While the app is
   in **Testing** under **Audience**, only its test users can sign in, so publish it to
   production before others use it.
4. In `apps/api`, set the secrets:

   ```sh
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   ```

## When sign-in fails

The dashboard shows why on the sign-in screen, or under **Settings** > **Account** when
you were connecting Google. The reason is also in the address as `login_error`:

| `login_error` | Why | What to do |
| --- | --- | --- |
| `expired` | The sign-in took more than 10 minutes, or came back in another browser than the one it started in. | Start again in one browser. |
| `denied` | You canceled on Google's page. | Start again. |
| `provider` | Google refused the code, or didn't say who signed in. | Start again. If it keeps failing, check the client secret. |
| `unverified` | The Google account has no verified email address. | Verify an address with Google. |
| `password` | An account with this email address has a password. | Sign in with the password, then connect Google. |
| `another_google` | An account with this email address signs in with another Google account, for example one that had the address before your organization gave it to you. | Sign in with that Google account, or reset the password by email and connect yours. |
| `closed` | Sign-up is closed, or by invitation, on this server. | Ask for an invitation. |
| `invite` | The invitation expired or was withdrawn. | Ask for a new one. |
| `invite_email` | The invitation is for another email address. | Use the Google account with the invited address. |
| `taken` | The Google account already belongs to another misomoon account. | Disconnect it there first. |

Any other `login_error` shows "The sign-in failed. Try again." The dashboard never shows
the value itself, since anyone can put one in a link.

The trip to Google can take up to 10 minutes. If your saved session expires meanwhile,
the sign-in still finishes and starts a new one.

A server without a Google client answers `501` with the secrets it needs.
