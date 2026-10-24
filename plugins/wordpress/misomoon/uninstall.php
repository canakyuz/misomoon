<?php
// Deleting the plugin removes its settings and its queued payment retries. Order meta stays:
// it belongs to the orders.

if (!defined('WP_UNINSTALL_PLUGIN')) {
	exit;
}

delete_option('misomoon_settings');
delete_option('misomoon_last_payment');
// every retry, whatever its arguments; wp_clear_scheduled_hook() would match only empty ones
wp_unschedule_hook('misomoon_retry_payment');
