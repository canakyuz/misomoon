# Track apps and servers with the SDK

`@misomoon/sdk` sends events from places a script tag can't reach: React Native and
Expo apps, and your own server. It also has a typed wrapper for the browser tracker, for
React, Next.js and other bundled apps.

| Import | Use it for |
| --- | --- |
| `@misomoon/sdk/web` | Any bundled browser app. Loads `m.js` and gives you typed `track()` and `pageview()`. |
| `@misomoon/sdk/react` | React and Next.js: a `<Misomoon>` component and a `useMisomoon()` hook. |
| `@misomoon/sdk/next` | Next.js config: `withMisomoon()` serves the tracker from your own domain. |
| `@misomoon/sdk/react-native` | React Native and Expo: screens, engaged time, custom events, and revenue. |
| `@misomoon/sdk/node` | Server-side events in Node, Bun, Deno, and Workers: signups, payments, webhooks. |

Install it:

```sh
npm install @misomoon/sdk
```

The package ships ESM and CommonJS. It has no dependencies. React and React Native are optional peer
dependencies.

Each entry point is free of side effects, so your bundler keeps only the functions you
call. `track()` alone adds about 0.6 KB gzipped to a browser bundle, `init()` with
`track()` about 1.2 KB, and `<Misomoon>` about 0.8 KB. An import you don't use adds
nothing. The tracker features themselves load with `m.js` from your misomoon server,
which adds only the features ticked in the site settings.

Like the script tag, the SDK sets no cookies and stores nothing on the device. The
server derives the visitor id from the address, the user agent, and a salt that changes
daily, as [Architecture](ARCHITECTURE.md#ingest) explains. An app therefore needs no
AsyncStorage and no consent prompt for an identifier.

## Add the tracker to a React or Next.js app

Put `<Misomoon>` once in your root layout. It renders nothing and adds `m.js` when the
page loads:

```tsx
// app/layout.tsx
import { Misomoon } from '@misomoon/sdk/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				{children}
				<Misomoon site="your-site" host="https://analytics.example.com" />
			</body>
		</html>
	)
}
```

The App Router and React Router change routes with `history.pushState`, and `m.js`
counts each change as a pageview, so routing needs nothing more.

Send events from any component:

```tsx
'use client'
import { useMisomoon } from '@misomoon/sdk/react'

export function UpgradeButton() {
	const { track } = useMisomoon()
	return <button onClick={() => track('Upgrade', { props: { plan: 'pro' } })}>Upgrade</button>
}
```

### Serve the tracker from your Next.js app

Ad blockers drop requests to analytics hosts. `withMisomoon()` adds rewrites to your
Next.js config, so the tracker and its events go through your own domain:

```js
// next.config.mjs
import { withMisomoon } from '@misomoon/sdk/next'

export default withMisomoon({ reactStrictMode: true }, { host: 'https://analytics.example.com' })
```

Then set `host` to the proxy path:

```tsx
<Misomoon site="your-site" host="/relay" />
```

`withMisomoon()` maps `/relay/m.js`, `/relay/api/event`, and `/relay/overlay.js` to
`host`, before your own pages and files, and keeps any rewrites your config already has.
It also wraps a config that you export as a function. To use another path, pass
`prefix: '/pulse'`. Pick a neutral word: `analytics`, `tracking`, and `stats` are on
filter lists. `host` must be a full URL, or the build fails with an error.

misomoon counts each visitor by the address that a rewrite forwards in
`X-Forwarded-For`. Vercel and Netlify set it. A self-hosted Next.js server passes on the
header it receives, so put it behind a proxy that sets the header, such as Nginx with
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`. A bare `next start` that
faces the internet sets no such header, so every visitor arrives with the server's
address.
[Serve the tracker from your own domain](PROXY.md#visitor-ip-and-location) explains which visitor locations survive
the proxy on each platform.

### Type your events

Pass your events and their props to `useMisomoon()`. A misspelled name or a prop value
that isn't in the type then fails the type check:

```tsx
type Events = { Signup: { plan: 'pro' | 'team' }; Logout: undefined }

const { track } = useMisomoon<Events>()
track('Signup', { props: { plan: 'pro' } })
```

Declare the events with `type`, not `interface`: TypeScript doesn't match an interface to
the props type. Outside React, `typed<Events>()` from `@misomoon/sdk/web` returns the
same typed functions.

### Turn tracking off in development

`enabled: false` adds no tracker and sends nothing. Calls to `track()` still run their
`callback`:

```tsx
<Misomoon site="your-site" host="/relay" enabled={process.env.NODE_ENV === 'production'} />
```

To leave your own browser out of the counts, call `ignore()` from
`@misomoon/sdk/web`, for example from an admin page. It takes effect on the next page
load. `ignore(false)` counts the browser again. It sets the same `misomoon_ignore` key as
the [console command](tracking.md#exclude-yourself). `ignored()` returns `true` while the
browser is left out, so an opt-out toggle can show the current choice:

```tsx
import { ignore, ignored } from '@misomoon/sdk/react'

export function OptOut() {
	const [out, setOut] = useState(ignored)
	return (
		<label>
			<input type="checkbox" checked={!out} onChange={() => (ignore(!out), setOut(!out))} /> Count my visits
		</label>
	)
}
```

Without React, call the functions from `@misomoon/sdk/web`:

```ts
import { init, track } from '@misomoon/sdk/web'

init({ site: 'your-site', host: 'https://analytics.example.com' })
track('Signup', { props: { plan: 'pro' } })
track('Purchase', { revenue: { amount: 49.9, currency: 'EUR' } })
```

The functions do nothing during server rendering, so you can import them anywhere.
Calls made before `m.js` loads wait in a queue, and `m.js` sends them after the first
pageview, so the visit keeps its referrer.
A `callback` passed to `track()` runs after the event is sent, or after one second when
an ad blocker stops `m.js` from loading, so a navigation that waits for it still happens.

`init()` takes the [script tag attributes](configuration.md#tracker-attributes) as
options:

| Option | Attribute |
| --- | --- |
| `site` | `?s=` on the script URL |
| `host` | where events go, and the script's `src` (`<host>/m.js`) unless you set `src` |
| `src` | the tracker's URL, when it isn't `<host>/m.js`; events still go to `host` |
| `api` | `data-api` |
| `manual`, `hash` | `data-manual`, `data-hash` |
| `debug` | none: logs what the SDK does |
| `disable: ['outbound', 'downloads', 'clicks']` | `data-disable` |
| `props: { plan: 'pro' }` | `data-prop-plan="pro"` |
| `downloadExtensions` | `data-download-ext` |
| `enabled` | none: `false` adds no tracker |

To serve the tracker from your own domain, set `host` to your proxy path, such as
`host: '/relay'`. [Serve the tracker from your own domain](PROXY.md) shows the proxy setups.

### Pass the visit to a checkout from the browser

To credit a payment to the visit that made it, give the checkout your server creates the
page view's ref. `ref()` waits up to 3 seconds for `m.js` to load, then resolves to the
ref:

```ts
import { ref } from '@misomoon/sdk/web'

const res = await fetch('/api/checkout', { method: 'POST', body: JSON.stringify({ plan, ref: await ref() }) })
```

In React, `ref` comes from `useMisomoon()`. `ref()` resolves to `undefined` when an ad
blocker stops `m.js`, when `enabled` is `false`, or when the site's **Payments** feature
is off. A checkout without a ref still works, but its payment counts under **Unknown**.
[Connect payments](revenue.md#pass-the-ref-to-the-checkout) shows where each provider
keeps the ref.

## Track a React Native or Expo app

Wrap the app in `MisomoonProvider`. Set `domain` to the domain you added to misomoon for
this app. Each screen becomes a pageview at `https://<domain>/<screen>`, so screens show
up as pages in the dashboard.

```tsx
import { MisomoonProvider } from '@misomoon/sdk/react-native'

export default function App() {
	return (
		<MisomoonProvider
			site="recipes-app"
			host="https://analytics.example.com"
			domain="recipes.app"
			app={{ name: 'Recipes', version: '2.3.0' }}
		>
			<RootNavigator />
		</MisomoonProvider>
	)
}
```

The `app` name and version take the place of the browser in reports. The OS, its
version, and phone or tablet come from the device.

### Count screens

With Expo Router, pass the current path to `useScreen` in the root layout:

```tsx
// app/_layout.tsx
import { Stack, usePathname } from 'expo-router'
import { useScreen } from '@misomoon/sdk/react-native'

function Screens() {
	useScreen(usePathname())
	return <Stack />
}
```

Render `<Screens />` inside `MisomoonProvider`.

With React Navigation, spread `useNavigationTracking` on the container. It returns the
`onReady` and `onStateChange` callbacks, so the first screen counts too:

```tsx
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native'
import { useNavigationTracking } from '@misomoon/sdk/react-native'

const navigationRef = createNavigationContainerRef()

function Navigation() {
	const tracking = useNavigationTracking(navigationRef)
	return <NavigationContainer ref={navigationRef} {...tracking}>{/* screens */}</NavigationContainer>
}
```

To count one screen by hand, call `useScreen('Settings')` in it. A repeat of the current
screen isn't counted twice, so re-renders and StrictMode are safe.

### Send events

```tsx
import { useMisomoon } from '@misomoon/sdk/react-native'

function BuyButton() {
	const misomoon = useMisomoon()
	return <Button title="Buy" onPress={() => misomoon.track('Purchase', { revenue: { amount: 4.99, currency: 'USD' } })} />
}
```

### Credit campaigns from links

When a link opens the app, the visit gets the link's campaign. The SDK reads the link
from React Native's `Linking` by itself, so Expo Router and React Navigation apps need no
code. The link's `utm_*`, `gclid`, `msclkid`, `ref`, and `source` parameters go on the
visit's first screen view, and other parameters are left out.

misomoon takes a visit's traffic source from its first event, so a new visit waits for
the link before it sends anything:

- On a cold start, the first screen view waits up to 1 second for
  `Linking.getInitialURL()`. Events you send meanwhile wait too, and go out after it in
  order.
- When a link brings the app back after 30 minutes or more in the background, the screen
  view that starts the new visit waits up to 1 second for the link.
- A link that opens the app while a visit is still open puts its campaign on the next
  screen view. The visit keeps the source it started with.

For a link the SDK can't see, such as one your push notification library hands you, pass
it to `misomoon.openedFrom(url)` before the screen it opens. The campaign goes on the
next screen view.

### Pass the visit to a checkout from the app

For a purchase your server starts, such as a web checkout opened from the app, send
`misomoon.ref()` to that server with the order. The server puts the ref in the
checkout's metadata ([Connect payments](revenue.md#pass-the-ref-to-the-checkout)):

```tsx
const misomoon = useMisomoon()
await api.createCheckout({ plan: 'yearly', ref: misomoon.ref() })
```

Each screen view has one ref, and the next screen gets a new one. The SDK tells misomoon
about a ref when it hands the ref out, so the payment finds the visit even if the app
never sends another event.

### Let people opt out in the app

`setEnabled(false)` stops sending and drops the events still queued. `setEnabled(true)`
starts again. The SDK stores nothing on the device, so keep the choice yourself and pass
it as `enabled` on the next launch:

```tsx
const misomoon = useMisomoon()
misomoon.setEnabled(false)
```

### What the app sends by itself

| Event | When |
| --- | --- |
| `pageview` | A new screen, and the current screen again when the app comes back after 30 minutes or more, because the server ends a visit after 30 minutes without events. |
| `engagement` | When the screen changes or the app goes to the background: the time the screen was in the foreground, if it was one second or more. It carries the screen view's key (`y`), and the server adds the time to that screen view instead of storing an event. |

Events wait in memory while the device is offline and go out in order once it's back.
The SDK drops an event that is still unsent after 5 minutes, because the server dates an
older event by its arrival and would put it in the wrong visit. When the app goes to the
background, the SDK sends what it has.

## Send events from your server

Server-side events cover what the browser never sees, such as a signup your API handles
or a payment your server confirms. Pass the visitor's address and user agent. The server
then gives the event the same visitor id as the visitor's browser. If the visit had an
event in the last 30 minutes, the server event joins that visit and its traffic source.
Otherwise it starts a new visit.

```ts
import { createMisomoon, visitorFromRequest } from '@misomoon/sdk/node'

const misomoon = createMisomoon({ site: 'your-site', host: 'https://analytics.example.com' })

// Express. visitorFromRequest also takes a Fetch API Request (Hono, Next.js route handlers, Workers).
app.post('/api/signup', async (req, res) => {
	await createAccount(req.body)
	const visitor = visitorFromRequest(req)
	if (visitor) misomoon.track('Signup', { url: 'https://example.com/signup', visitor, props: { plan: req.body.plan } })
	res.sendStatus(201)
})
```

`visitorFromRequest` reads the address your platform reports: `CF-Connecting-IP`,
`True-Client-IP`, `Fly-Client-IP`, `X-Real-IP`, the first `X-Forwarded-For`, then the
socket. It also reads Cloudflare's and Vercel's location headers when they're there. It
returns `null` when the request has no address or no user agent. Without them the event
would count your server as the visitor, so `track()` refuses an event that has none.

A payment webhook comes from the payment provider, not the visitor, so it has no
visitor to send. Send the purchase when the visitor's browser returns to your success
page instead. That request is theirs, and it arrives while their visit is still open:

```ts
// GET /checkout/success?session_id=...
const session = await stripe.checkout.sessions.retrieve(req.query.session_id)
const visitor = visitorFromRequest(req)
if (session.payment_status === 'paid' && visitor) {
	misomoon.track('Purchase', {
		url: 'https://example.com/checkout/success',
		visitor,
		revenue: { amount: session.amount_total / 100, currency: session.currency },
	})
}
```

A visitor can reload the success page, so send the purchase once per order: for example,
mark the order as tracked in your database the first time.

### Pass the visit to a checkout your server creates

When your server creates the checkout, it can make the ref itself from the visitor's
request. The browser then needs no extra code:

```ts
app.post('/api/checkout', async (req, res) => {
	const ref = misomoon.ref({ url: 'https://example.com/pricing', visitor: visitorFromRequest(req) })
	const session = await stripe.checkout.sessions.create({
		// your line items
		metadata: { misomoon_ref: ref },
		success_url: 'https://example.com/thanks?session_id={CHECKOUT_SESSION_ID}',
	})
	res.json({ url: session.url })
})
```

The ref joins the visit that the visitor's address and user agent have open, when that
visit had an event in the last 30 minutes. A checkout started from a page the tracker
counted has one. Without an open visit, the ref keeps only what the request shows: the
page and the device, and no traffic source. `ref()` returns `undefined` and sends nothing when
the visitor has no address or no user agent, or when `url` isn't absolute. In a
serverless function, `await misomoon.flush()` before it returns, or the ref may never
reach misomoon.

### Send payments from providers without a webhook

For a provider misomoon has no webhook for, send each payment with `payment()`. It posts
to the site's custom webhook ([Send payments from your own server](revenue.md#send-payments-from-your-own-server)),
signed with the secret from **Settings** > **Revenue**:

```ts
const misomoon = createMisomoon({
	site: 'your-site',
	host: 'https://analytics.example.com',
	secret: process.env.MISOMOON_WEBHOOK_SECRET,
})

await misomoon.payment({ id: order.id, amount: 49.9, currency: 'EUR', ref: order.misomoonRef, customer: order.customerId })
await misomoon.payment({ id: refund.id, type: 'refund', refundOf: order.id, amount: 10, currency: 'EUR' })
```

| Field | Meaning |
| --- | --- |
| `id` | Your payment id, unique per site. Required. A resend with the same id counts once. |
| `amount` | Positive, in major units: `49.9` for 49.90. Required. |
| `currency` | ISO 4217 code. Required. |
| `type` | `'payment'` (the default) or `'refund'`. |
| `refundOf` | For a refund, the `id` of the payment it returns. |
| `ref` | The ref from the buyer's visit: from `ref()` in the browser, the app, or here. |
| `customer`, `subscription` | Your ids. A later payment with the same customer or subscription counts toward the first payment's visit. |
| `billing` | `'new'`, `'renewal'`, or `'one_time'`. |
| `ts` | When the payment happened: a `Date`, Unix milliseconds, or an ISO 8601 string. Defaults to now. |
| `test` | `true` checks the connection without counting the payment. |

`payment()` resolves to `true` once misomoon has the payment and to `false` otherwise.
It never rejects. After a network error, a timeout, `429`, or a `5xx` answer, it tries
again, with waits that double up to 30 seconds, for up to `maxAge`. A `400` or `401`
answer stops it, and the console shows the server's reason, such as a wrong secret or a
negative amount. `payment()` isn't part of `flush()`, so await it. Set `host` to
misomoon's own address here, not a proxy: a proxy forwards only the tracker's paths.

`track()` and `pageview()` return a promise that resolves to `true` once misomoon has the
event and `false` when it was dropped. They never reject. Don't await them in a request
handler: while misomoon is unreachable, the promise waits for the retries, up to
`maxAge` (5 minutes).

In a serverless function, which can stop as soon as it responds, wait for the events
before it ends: `await misomoon.flush()`, or `ctx.waitUntil(misomoon.flush())` on
Cloudflare Workers. `flush()` resolves once every queued event is sent or dropped, or
after 11 seconds, whichever comes first. A long-running server needs neither. Call
`await misomoon.shutdown()` before the process exits.

## How the SDK handles failures

Every client refuses an event with a mistake the server would drop, with a console
warning: an event name longer than 120 characters or with `;` or `|` in it, a negative
revenue amount, or a currency that isn't an ISO 4217 code. `track()` in the browser then
still runs its `callback`. `payment()` refuses a payment without an id, an amount above
0, or a currency code, and a refund without `refundOf`, before it sends a request.
The name `engagement` belongs to engaged time, so the server drops a custom event with
that name without a warning.

The React Native and Node clients share one transport:

- An event with a relative URL is refused with a warning. Props the server would drop are
  removed with a warning.
- After a network error, a timeout (10 seconds), `429`, or a `5xx` answer, the SDK sends
  the event again. The waits double from 1 second up to 30 seconds, and each wait is
  shortened by a random amount up to half its length. Any other `4xx` answer drops the
  event.
- Each event carries a random id. When a response is lost after the server stored the
  event, the retry has the same id, and the server stores it once.
- An event over the 16 KB the server accepts is refused with a warning. String props are
  cut to the 300 characters the server keeps.
- The queue holds 500 events (200 in apps). When it is full, the oldest unsent event goes
  first.
- The SDK reads each answer to the end, so Node's `fetch` reuses its connections.

## Options

These options work in `createMisomoon()` and in `MisomoonProvider`:

| Option | Default | Meaning |
| --- | --- | --- |
| `site` | required | The site id. |
| `host` | required | Where misomoon answers, or your proxy, such as `https://example.com/relay`. Events go to `<host>/api/event`. |
| `domain` | required in apps | The site's domain. Screens become `https://<domain>/<screen>`. |
| `app` | `{ name: 'App' }` | Apps only: the name and version shown in place of a browser. |
| `timeout` | `10000` | Milliseconds before a request is abandoned and retried. |
| `concurrency` | `4` on servers, `1` in apps | Requests in flight at once. With `1`, events arrive in order. |
| `maxQueue` | `500` on servers, `200` in apps | Unsent events kept. |
| `maxAge` | `300000` | Milliseconds an event may wait before it is dropped. |
| `enabled` | `true` | `false` sends nothing, for example in tests or development. In apps, `setEnabled()` changes it later. |
| `props` | none | Props on every pageview, screen, and event, like `data-prop-*` on the script tag. An event's own props win over these. |
| `debug` | `false` | Logs every event sent, retried, and dropped. |
| `beforeSend` | none | A function that changes an event, or returns `null` to drop it. |
| `headers` | none | Headers on every request. |
| `fetch` | the global `fetch` | Your own `fetch`. |
| `secret` | none | Server only: the custom webhook's signing secret, for `payment()`. |
