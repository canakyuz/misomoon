# Install misomoon on React Native and Expo

Count screens, engaged time, and events in a React Native or Expo app. No script tag is needed.

## Install the SDK

```sh
npm install @misomoon/sdk
```

## Wrap the app

Add your app's domain as a site in misomoon first. Then wrap the app in
`MisomoonProvider`:

```tsx
import { MisomoonProvider } from '@misomoon/sdk/react-native'

export default function App() {
	return (
		<MisomoonProvider site="recipes-app" host="https://analytics.example.com" domain="recipes.app" app={{ name: 'Recipes', version: '2.3.0' }}>
			<RootNavigator />
		</MisomoonProvider>
	)
}
```

Each screen becomes a page, such as `https://recipes.app/settings`. To count screens with
Expo Router or React Navigation, follow
[Count screens](sdk.md#count-screens).

## Check it works

Run the app and open a few screens. They appear in **Live** within a few seconds. If
they don't, [Troubleshooting](troubleshooting.md) lists the causes.

## Next steps

- Send events and revenue from the app: [the SDK guide](sdk.md#track-a-react-native-or-expo-app).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Credit sales to the visit that brought the buyer: [Connect payments](revenue.md).
