<?php
// Test-only routes for run.mjs: place, pay and refund a WooCommerce order the way a shopper's
// checkout would, and read what an admin and a guest get.
add_action('rest_api_init', function () {
	register_rest_route('mmtest/v1', '/order', array('methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function () {
		$product = new WC_Product_Simple();
		$product->set_name('Mug');
		$product->set_regular_price('49.90');
		$product->save();
		$order = new WC_Order();
		$order->set_created_via('checkout');
		$order->set_currency('EUR');
		$order->set_customer_ip_address('198.51.100.7');
		$order->set_customer_user_agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36');
		$order->add_product($product, 1);
		$order->calculate_totals();
		$order->save();
		$order->payment_complete('txn_1');
		$order->update_status('completed');
		$refund = wc_create_refund(array('order_id' => $order->get_id(), 'amount' => '10.00', 'reason' => 'test'));
		$fresh = wc_get_order($order->get_id());
		return array('order' => $order->get_id(), 'refund' => is_wp_error($refund) ? $refund->get_error_message() : $refund->get_id(), 'ref' => $fresh->get_meta('_misomoon_ref'), 'sent' => $fresh->get_meta('_misomoon_sent'));
	}));
});
add_action('rest_api_init', function () {
	register_rest_route('mmtest/v1', '/admin', array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function () {
		$guest = misomoon_should_track();
		wp_set_current_user(1);
		$admin = misomoon_should_track();
		$editor_id = username_exists('mm-editor') ?: wp_insert_user(array('user_login' => 'mm-editor', 'user_pass' => wp_generate_password(), 'user_email' => 'editor@shop.test', 'role' => 'editor'));
		wp_set_current_user($editor_id);
		$editor = misomoon_should_track();
		wp_set_current_user(1);
		require_once ABSPATH . 'wp-admin/includes/template.php';
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once WP_PLUGIN_DIR . '/misomoon/includes/settings.php';
		ob_start();
		misomoon_render_settings();
		$html = ob_get_clean();
		$saved = misomoon_sanitize(array('host' => 'https://analytics.example.com/', 'site' => 'bad site!', 'woo' => '1', 'secret' => ''));
		return array('guest' => $guest, 'admin' => $admin, 'editor' => $editor, 'page_has_tag' => strpos($html, 'mm-relay') !== false, 'secret_printed' => strpos($html, 'whsec_test') !== false, 'sanitized' => $saved, 'errors' => wp_list_pluck(get_settings_errors('misomoon_settings'), 'code'));
	}));
});
add_action('rest_api_init', function () {
	// the visitor's address when a filter returns something that is not one, and a ref that misomoon refused
	register_rest_route('mmtest/v1', '/client', array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function () {
		$_SERVER['REMOTE_ADDR'] = '192.0.2.10';
		$bad = function () {
			return 'not an address';
		};
		add_filter('misomoon_visitor_ip', $bad);
		$ip = misomoon_visitor_ip();
		remove_filter('misomoon_visitor_ip', $bad);
		return array('ip' => $ip, 'refused_ref' => misomoon_hand_out_ref('https://shop.com/checkout/', '198.51.100.8', 'refuse-me'));
	}));
	// deleting the plugin: a payment retry queued with its arguments must go too
	register_rest_route('mmtest/v1', '/uninstall', array('methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function () {
		wp_schedule_single_event(time() + 600, 'misomoon_retry_payment', array(array('id' => 'wc_9', 'amount' => 1, 'currency' => 'EUR'), 2));
		$before = (bool) wp_next_scheduled('misomoon_retry_payment', array(array('id' => 'wc_9', 'amount' => 1, 'currency' => 'EUR'), 2));
		define('WP_UNINSTALL_PLUGIN', 'misomoon/misomoon.php');
		include WP_PLUGIN_DIR . '/misomoon/uninstall.php';
		$left = 0;
		foreach (_get_cron_array() as $hooks) {
			$left += isset($hooks['misomoon_retry_payment']) ? count($hooks['misomoon_retry_payment']) : 0;
		}
		return array('queued' => $before, 'left' => $left, 'settings' => get_option('misomoon_settings', null));
	}));
});
