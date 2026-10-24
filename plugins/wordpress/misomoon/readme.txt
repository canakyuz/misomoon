=== misomoon analytics ===
Contributors: misomoon
Tags: analytics, privacy, cookieless, woocommerce, statistics
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Cookieless analytics from your own misomoon, with WooCommerce revenue credited to the visit that brought the buyer.

== Description ==

misomoon is open-source analytics that runs in your own Cloudflare account. This plugin connects a WordPress site to it.

* Adds the misomoon tracker to every page. It sets no cookies and stores nothing on the visitor's device.
* Leaves out your own visits while you are logged in as someone who can edit posts.
* Can serve the tracker and its events from your own domain, through the REST API, so ad blockers that drop analytics hosts let it through.
* Sends WooCommerce orders and refunds to misomoon. Each paid order counts toward the source, country and device of the visit that placed it.

You need a running misomoon. See https://github.com/jackzard/misomoon/blob/main/docs/self-hosting.md

== Installation ==

1. Upload the `misomoon` folder to `wp-content/plugins/`, or upload the zip under Plugins > Add New > Upload Plugin.
2. Activate the plugin.
3. Open Settings > misomoon. Enter your misomoon address and the site id from Settings > Install in misomoon.
4. Open your site in a private window. You appear in Live in misomoon within a few seconds.

== Frequently Asked Questions ==

= Why don't my own visits show up? =

The plugin loads no tracker for people who can edit posts while they are logged in. Untick "Don't count people who can edit posts" to count them.

= How do I send my own events? =

Call `misomoon('Signup')` from JavaScript, or add `data-misomoon-event="Signup"` to a button. See https://github.com/jackzard/misomoon/blob/main/docs/tracking.md

= Does the proxy keep visitor locations? =

Only when the site is behind Cloudflare, which tells WordPress the visitor's country. Elsewhere misomoon counts the visitors but leaves their location unknown.

== Changelog ==

= 0.1.0 =
* First release: the tracker, the proxy, and WooCommerce orders and refunds.
