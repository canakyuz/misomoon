# Track a WordPress site and WooCommerce store

The misomoon plugin adds the tracker to every page of a WordPress site. It can also
serve the tracker from your own domain, and it sends WooCommerce orders and refunds to
misomoon. Each paid order then counts toward the source, country, and device of the
visit that placed it. The plugin lives in [`plugins/wordpress/misomoon`](../plugins/wordpress/misomoon)
and needs WordPress 6.0 and PHP 7.4 or later.

## Install the plugin

1. Make a zip of the plugin folder:

   ```sh
   cd plugins/wordpress && zip -r misomoon.zip misomoon -x '*.DS_Store'
   ```

2. In WordPress, open **Plugins** > **Add New Plugin** > **Upload Plugin**, choose
   `misomoon.zip`, and click **Install Now**. Then click **Activate**.
3. Open **Settings** > **misomoon**.
4. In **misomoon address**, enter the address of your dashboard, such as
   `https://analytics.example.com`.
5. In **Site id**, enter the value after `?s=` in the snippet under **Settings** >
   **Install** in misomoon.
6. Click **Save Changes**.

The settings page then shows the script tag your pages load. Open your site in a private
window: you appear in **Live** in misomoon within a few seconds.

The plugin loads no tracker for people who can edit posts while they are logged in, so
your own visits don't count. To count them, untick **Don't count people who can edit
posts**.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **misomoon address** | none | Where misomoon answers. Must be a full `http` or `https` URL. |
| **Site id** | none | The site to count visits for. Letters, digits, dots, dashes, and underscores. |
| **Don't count people who can edit posts** | on | Editors, authors, and administrators load no tracker while they are logged in. |
| **Serve the tracker from this site** | off | Loads the tracker and sends its events through the REST API of your site ([Serve the tracker from your domain](#serve-the-tracker-from-your-domain)). |
| **Count #/route changes as pages** | off | Adds `data-hash`, for a single-page app that routes with `#/`. |
| **Send orders and refunds to misomoon** | off | Appears when WooCommerce is active ([Count WooCommerce orders](#count-woocommerce-orders)). |
| **Signing secret** | none | The secret of the custom webhook. The page never shows a saved secret. Leave the field empty to keep it. |

Without an address and a site id, the plugin prints nothing. A wrong value isn't saved:
the page shows an error and keeps the value you had.

To send custom events, call `misomoon('Signup')` from JavaScript, or add
`data-misomoon-event` to an element ([Send custom events](tracking.md#send-custom-events)).

## Serve the tracker from your domain

Ad blockers drop requests to analytics hosts. With **Serve the tracker from this site**
ticked, the page loads the tracker from `/wp-json/mm-relay/v1/m.js`, and the tracker
sends its events to `/wp-json/mm-relay/v1/api/event`. WordPress forwards each event to
misomoon with the visitor's address, user agent, and language.

- The proxy fetches `m.js` from misomoon for your site id and keeps it for 5 minutes.
  It serves no other site's tracker.
- An event over 16 KB isn't forwarded, the same limit misomoon applies.
- Visitor locations survive only when the site is behind Cloudflare, which tells
  WordPress the country, and the city when Cloudflare's **Add visitor location headers**
  managed transform is on.
  Elsewhere misomoon counts the visitors and leaves their location unknown.
- The visitor's address comes from `CF-Connecting-IP`, `True-Client-IP`, `X-Real-IP`,
  the first `X-Forwarded-For`, then the connection. To trust only the header your host
  sets, filter `misomoon_visitor_ip`.
- A security plugin that turns off the REST API for visitors who aren't logged in also
  turns off the proxy. The tracker then fails to load, and nothing is counted.
- With plain permalinks (**Settings** > **Permalinks** > **Plain**), the REST API lives in
  the query string, so the click and scroll overlay that the dashboard opens on your page
  can't load through the proxy. Pick any other permalink structure to use the overlay.

## Count WooCommerce orders

1. In misomoon, open **Settings** > **Revenue**, pick **Your server**, and click **Make
   signing secret**.
2. In WordPress, open **Settings** > **misomoon**.
3. Tick **Send orders and refunds to misomoon** and paste the secret into **Signing
   secret**.
4. Click **Save Changes**.

When a shopper places an order, the plugin hands out a ref from the shopper's visit. It
finds the visit by the address and user agent that WooCommerce stores on the order, and
it keeps the ref in the order's `_misomoon_ref` meta. The classic checkout and the block
checkout both work.

When the order is paid, the plugin posts it to the custom webhook
([Send payments from your own server](revenue.md#send-payments-from-your-own-server)),
signed with the secret. The plugin treats an order as paid when the payment gateway
reports it, or when the order moves to **Processing** or **Completed**, for payments such
as bank transfers. An order is sent once, as `wc_<order id>`, in the order's currency.
Each refund is sent as `wc_refund_<refund id>` and counts against its order.

- An order made in **wp-admin** gets no ref, because it carries the address of the shop
  manager, not the buyer. Its payment still counts, under **Unknown**.
- A guest has no customer id, so a later order from the same guest finds its own visit
  and doesn't follow the first one.
- Orders of zero, and orders paid before you ticked the setting, aren't sent.
- After a network error, `429`, or a `5xx` answer, WP-Cron sends the order again after
  1, 5, and 25 minutes. The order id makes a resend count once.
- The settings page shows the last order sent, or the reason the last one failed, such as
  `status 401` for a wrong secret.

Totals count only payments in the site's currency in misomoon. Set that currency to your
store's currency under **Settings** > **Sites** ([Track revenue](tracking.md#track-revenue)).

## Hooks

| Hook | Kind | Use it to |
| --- | --- | --- |
| `misomoon_should_track` | filter, `bool` | Decide whether a page loads the tracker, for example to skip a page or a role. |
| `misomoon_script_attributes` | filter, `array` | Add attributes to the script tag, such as `data-disable` or `data-prop-plan`. |
| `misomoon_visitor_ip` | filter, `string` | Choose the visitor's address for proxied events and refs. |

```php
// never count the account pages
add_filter('misomoon_should_track', function ($track) {
	return $track && !is_account_page();
});

// turn off click tracking on checkout
add_filter('misomoon_script_attributes', function ($attrs) {
	if (is_checkout()) {
		$attrs['data-disable'] = 'clicks';
	}
	return $attrs;
});
```

## Remove the plugin

Deactivating the plugin stops the tracker, and an order retry that comes due meanwhile is
dropped. Deleting it removes its settings and any queued retries. The `_misomoon_ref` and `_misomoon_sent` meta stay on your orders.

## Test the plugin

`plugins/wordpress/test/run.mjs` runs WordPress and WooCommerce in WordPress Playground
against a fake misomoon. It checks the script tag, the proxy, the settings page, and an
order with its refund:

```sh
node plugins/wordpress/test/run.mjs --php=7.4
```

It downloads WordPress and WooCommerce, so it needs the network. It isn't part of
`pnpm test`.
