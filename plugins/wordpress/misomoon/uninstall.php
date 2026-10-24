<?php
// Deleting the plugin removes its settings. Order meta stays: it belongs to the orders.

if (!defined('WP_UNINSTALL_PLUGIN')) {
	exit;
}

delete_option('misomoon_settings');
delete_option('misomoon_last_payment');
wp_clear_scheduled_hook('misomoon_retry_payment');
