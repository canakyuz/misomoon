<?php
// The plugin's settings, kept in one option. Every reader goes through misomoon_options(),
// so a missing or partial option still has every key.

if (!defined('ABSPATH')) {
	exit;
}

/** The settings with their defaults. */
function misomoon_defaults() {
	return array(
		// where misomoon answers: https://analytics.example.com
		'host'      => '',
		// the site id, as in m.js?s=
		'site'      => '',
		// leave out people who can edit posts, so your own visits don't count
		'exclude'   => true,
		// serve the tracker and its events through this site's REST API
		'proxy'     => false,
		// count #/route changes as pages (data-hash)
		'hash'      => false,
		// send WooCommerce orders and refunds to the custom webhook
		'woo'       => false,
		// the custom webhook's signing secret (Settings > Revenue > Your server in misomoon)
		'secret'    => '',
	);
}

function misomoon_options() {
	$saved = get_option(MISOMOON_OPTION, array());
	return array_merge(misomoon_defaults(), is_array($saved) ? $saved : array());
}

/** misomoon's address without a trailing slash, or '' when it isn't an http(s) URL. */
function misomoon_host() {
	$host = untrailingslashit(trim((string) misomoon_options()['host']));
	return preg_match('#^https?://[^\s/]+#i', $host) ? $host : '';
}

/** Whether the host and the site id are set, so there is somewhere to send events. */
function misomoon_configured() {
	return misomoon_host() !== '' && misomoon_options()['site'] !== '';
}
