# @misomoon/sdk

Send events to [misomoon](https://github.com/jackzard/misomoon) from React, Next.js, React
Native, Expo, and your server. Like misomoon's script tag, it sets no cookies and stores
nothing on the device.

```sh
npm install @misomoon/sdk
```

| Import | Use it for |
| --- | --- |
| `@misomoon/sdk/web` | Any bundled browser app: loads `m.js`, typed `track()` and `pageview()` |
| `@misomoon/sdk/react` | React and Next.js: `<Misomoon>` and `useMisomoon()` |
| `@misomoon/sdk/next` | Next.js config: `withMisomoon()` serves the tracker from your own domain |
| `@misomoon/sdk/react-native` | React Native and Expo: screens, engaged time, events, revenue |
| `@misomoon/sdk/node` | Server-side events that join the visitor's visit |

## React and Next.js

```js
// next.config.mjs: serves the tracker from /relay on your own domain
import { withMisomoon } from '@misomoon/sdk/next'
export default withMisomoon({}, { host: 'https://analytics.example.com' })
```

```tsx
import { Misomoon, useMisomoon } from '@misomoon/sdk/react'

// in the root layout
<Misomoon site="your-site" host="/relay" />

// in any component
const { track, ref } = useMisomoon()
track('Signup', { props: { plan: 'pro' } })
```

## React Native and Expo

```tsx
import { MisomoonProvider, useScreen } from '@misomoon/sdk/react-native'
import { usePathname } from 'expo-router'

<MisomoonProvider site="recipes-app" host="https://analytics.example.com" domain="recipes.app" app={{ name: 'Recipes', version: '2.3.0' }}>
	<Screens />
</MisomoonProvider>

function Screens() {
	useScreen(usePathname())
	return <Stack />
}
```

## Server

```ts
import { createMisomoon, visitorFromRequest } from '@misomoon/sdk/node'

const misomoon = createMisomoon({ site: 'your-site', host: 'https://analytics.example.com' })
const visitor = visitorFromRequest(req)
if (visitor) misomoon.track('Signup', { url: 'https://example.com/signup', visitor })

// a ref for the checkout your server creates, so the payment finds the visit
const ref = misomoon.ref({ url: 'https://example.com/pricing', visitor })
```

The [SDK guide](https://github.com/jackzard/misomoon/blob/main/docs/sdk.md) covers every
option, typed events, React Navigation, campaigns from deep links, revenue, payment refs,
signed payments with `payment()`, serverless functions, and how the SDK retries.
