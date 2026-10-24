<?php
/**
 * Plugin Name:       misomoon analytics
 * Plugin URI:        https://github.com/jackzard/misomoon/blob/main/docs/wordpress.md
 * Description:       Cookieless analytics from your own misomoon. Adds the tracker to every page, can serve it from your own domain, and credits WooCommerce orders to the visit that brought the buyer.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            misomoon
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       misomoon
 */

// The plugin only prints the script tag that docs/tracking.md describes, plus two
// optional parts: a first-party proxy through the REST API (includes/proxy.php) and
// WooCommerce orders sent to the site's custom webhook (includes/woocommerce.php).

if (!defined('ABSPATH')) {
	exit;
}

define('MISOMOON_OPTION', 'misomoon_settings');

require_once __DIR__ . '/includes/options.php';
require_once __DIR__ . '/includes/client.php';
require_once __DIR__ . '/includes/tracker.php';
require_once __DIR__ . '/includes/proxy.php';
require_once __DIR__ . '/includes/woocommerce.php';

if (is_admin()) {
	require_once __DIR__ . '/includes/settings.php';
}
